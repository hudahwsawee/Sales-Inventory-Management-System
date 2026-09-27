import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';

const CLOSED_PO_STATUSES = ['cancelled', 'completed'] as const;

@Injectable()
export class ReceivingService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  async findAll(purchaseOrderId?: string) {
    return this.prisma.purchaseReceipt.findMany({
      where: purchaseOrderId ? { purchaseOrderId } : {},
      include: {
        items: { include: { product: true } },
        receiver: { select: { id: true, fullName: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
      orderBy: { receiptDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const receipt = await this.prisma.purchaseReceipt.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        receiver: { select: { id: true, fullName: true } },
        purchaseOrder: { select: { id: true, poNumber: true, status: true } },
      },
    });
    if (!receipt) {
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message_ar: 'إيصال الاستلام غير موجود' });
    }
    return receipt;
  }

  /**
   * confirmReceipt — العملية الوحيدة التي تزيد المخزون فعليًا في كل النظام
   * (BR-04/BR-05 من التصميم المعتمد: إنشاء أمر الشراء وحده لا يزيد المخزون
   * إطلاقًا). كل شيء هنا داخل معاملة واحدة شاملة — فشل أي بند يُرجِع كل شيء.
   *
   * ترتيب الأقفال (Row Locking) مقصود ومرتَّب دائمًا بنفس التسلسل
   * (PO → كل بند مرتَّب بمعرّفه → المنتج المرتبط) لتفادي Deadlock عند
   * تزامن عمليتي استلام مختلفتين تلمسان صفوفًا مشتركة.
   */
  async confirmReceipt(dto: ConfirmReceiptDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1) قفل وتحقق من أمر الشراء
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${dto.purchaseOrderId} FOR UPDATE`;
      const po = await tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } });

      if (!po) {
        throw new NotFoundException({ code: 'PURCHASE_ORDER_NOT_FOUND', message_ar: 'أمر الشراء غير موجود' });
      }
      if (CLOSED_PO_STATUSES.includes(po.status as (typeof CLOSED_PO_STATUSES)[number])) {
        throw new ConflictException({
          code: 'PURCHASE_ORDER_CLOSED',
          message_ar: po.status === 'cancelled' ? 'أمر الشراء ملغى' : 'أمر الشراء مكتمل بالفعل',
        });
      }

      // 2) إنشاء رأس إيصال الاستلام أولًا (البنود ستُشير إليه)
      const receipt = await tx.purchaseReceipt.create({
        data: {
          receiptNumber: this.generateCode('RCPT'),
          purchaseOrderId: po.id,
          warehouseId: po.warehouseId,
          receivedBy: userId,
          notes: dto.notes,
        },
      });

      // 3) ترتيب البنود بمعرّف بند أمر الشراء لضمان تسلسل أقفال ثابت دائمًا
      const sortedItems = [...dto.items].sort((a, b) =>
        a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId),
      );

      for (const line of sortedItems) {
        await this.processReceiptLine(tx, po, receipt.id, line, userId);
      }

      // 4) إعادة تقييم حالة أمر الشراء بعد تحديث كل البنود
      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const allComplete = allItems.every(
        (i: { quantityReceived: unknown; quantityOrdered: unknown }) =>
          Number(i.quantityReceived) >= Number(i.quantityOrdered),
      );
      const anyReceived = allItems.some(
        (i: { quantityReceived: unknown }) => Number(i.quantityReceived) > 0,
      );
      const newStatus = allComplete ? 'completed' : anyReceived ? 'partially_received' : po.status;

      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newStatus } });
      await tx.purchaseReceipt.update({
        where: { id: receipt.id },
        data: { isPartial: newStatus !== 'completed' },
      });

      return tx.purchaseReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { items: { include: { product: true } } },
      });
    });
  }

  private async processReceiptLine(
    tx: Prisma.TransactionClient,
    po: { id: string; poNumber: string; warehouseId: string },
    receiptId: string,
    line: { purchaseOrderItemId: string; quantityReceived: number; unitCost?: number },
    userId: string,
  ) {
    // قفل بند أمر الشراء — يمنع تزامن استلامين يتجاوزان الكمية المتبقية معًا
    await tx.$queryRaw`SELECT id FROM purchase_order_items WHERE id = ${line.purchaseOrderItemId} FOR UPDATE`;
    const item = await tx.purchaseOrderItem.findUnique({ where: { id: line.purchaseOrderItemId } });

    if (!item || item.purchaseOrderId !== po.id) {
      throw new BadRequestException({
        code: 'ITEM_NOT_IN_PURCHASE_ORDER',
        message_ar: 'المنتج غير موجود في أمر الشراء',
      });
    }

    const remaining = Number(item.quantityOrdered) - Number(item.quantityReceived);
    if (line.quantityReceived > remaining) {
      throw new BadRequestException({
        code: 'QUANTITY_EXCEEDS_REMAINING',
        message_ar: 'الكمية المستلمة أكبر من الكمية المتبقية',
      });
    }

    const unitCost = line.unitCost ?? Number(item.unitPrice);

    // قفل صف المنتج — ضروري لأن average_cost حقل على مستوى المنتج نفسه
    // (عبر كل المخازن)، فتزامن استلامين لنفس المنتج (حتى في مخزنين
    // مختلفين) يجب أن يتسلسلا عند حساب المتوسط المرجّح، وإلا يضيع أحد
    // التحديثين (Lost Update) على قيمة average_cost.
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });

    const priorTotalQtyAgg = await tx.inventoryBalance.aggregate({
      where: { productId: item.productId },
      _sum: { quantityOnHand: true },
    });
    const oldTotalQty = Number(priorTotalQtyAgg._sum.quantityOnHand ?? 0);
    const oldAverageCost = Number(product.averageCost);
    const newTotalQty = oldTotalQty + line.quantityReceived;

    // === معادلة المتوسط المرجّح المعتمدة، مع الحماية من القسمة على صفر ===
    const newAverageCost =
      newTotalQty === 0 ? unitCost : (oldTotalQty * oldAverageCost + line.quantityReceived * unitCost) / newTotalQty;

    await tx.product.update({
      where: { id: item.productId },
      data: { averageCost: round4(newAverageCost) },
    });

    // تحديث المخزون (دفتر الحركات + الرصيد) عبر المسار الموحَّد الوحيد المعتمد
    await this.inventoryService.applyInventoryChange(tx, {
      productId: item.productId,
      warehouseId: po.warehouseId,
      transactionType: 'purchase_receipt',
      quantity: line.quantityReceived,
      unitCost,
      referenceType: 'purchase_receipt',
      referenceId: receiptId,
      userId,
      notes: `استلام أمر الشراء ${po.poNumber}`,
    });

    // تحديث الكمية المستلمة على بند أمر الشراء — Increment ذرّي (لا Race)
    await tx.purchaseOrderItem.update({
      where: { id: item.id },
      data: { quantityReceived: { increment: line.quantityReceived } },
    });

    await tx.purchaseReceiptItem.create({
      data: {
        purchaseReceiptId: receiptId,
        purchaseOrderItemId: item.id,
        productId: item.productId,
        quantityReceived: line.quantityReceived,
        unitCost,
      },
    });
  }

  private generateCode(prefix: string): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
