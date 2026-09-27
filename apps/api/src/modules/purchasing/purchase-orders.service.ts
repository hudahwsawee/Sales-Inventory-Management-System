import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';

const CANCELLABLE_STATUSES = ['draft', 'pending'] as const;
const OPEN_PO_STATUSES = ['draft', 'pending', 'partially_received'] as const;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    // اختياري عمدًا (Step 6): يحافظ على توافق `new PurchaseOrdersService(prisma)`
    // إن استُخدِم كذلك في أي اختبار مستقبلي، ويُحقَن فعليًا عبر NestJS DI.
    private notificationsService?: NotificationsService,
  ) {}

  async findAll(query: QueryPurchaseOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { poNumber: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            orderDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          warehouse: true,
          items: true,
          _count: { select: { receipts: true } },
        },
        orderBy: { orderDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        creator: { select: { id: true, fullName: true, username: true } },
        items: { include: { product: true } },
        receipts: { include: { items: true }, orderBy: { receiptDate: 'desc' } },
      },
    });
    if (!po) {
      throw new NotFoundException({ code: 'PURCHASE_ORDER_NOT_FOUND', message_ar: 'أمر الشراء غير موجود' });
    }
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) {
      throw new BadRequestException({ code: 'SUPPLIER_NOT_FOUND', message_ar: 'المورد المحدَّد غير موجود' });
    }
    if (!supplier.isActive) {
      throw new BadRequestException({ code: 'SUPPLIER_INACTIVE', message_ar: 'المورد غير نشط' });
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new BadRequestException({ code: 'WAREHOUSE_NOT_FOUND', message_ar: 'المخزن المحدَّد غير موجود' });
    }
    if (!warehouse.isActive) {
      throw new BadRequestException({ code: 'WAREHOUSE_INACTIVE', message_ar: 'المخزن غير نشط' });
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException({
          code: 'PRODUCT_NOT_FOUND',
          message_ar: `المنتج غير موجود (${item.productId})`,
        });
      }
      if (!product.isActive) {
        throw new BadRequestException({
          code: 'PRODUCT_INACTIVE',
          message_ar: `المنتج "${product.nameAr}" غير نشط`,
        });
      }
      // "يُفضَّل ارتباط المنتج بالمورد المحدَّد" — قاعدة استرشادية وليست
      // إلزامية حسب المتطلبات المعتمدة صراحة ("preferably")، لذلك لا تُفرض
      // كخطأ حاجز هنا؛ يمكن تفعيلها لاحقًا كتحذير في الواجهة إن رغبتم.
    }

    const poNumber = this.generateCode('PO');

    const po = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        status: 'pending', // تبسيط متعمَّد: لا حالة Draft منفصلة فعليًا في MVP (لا Endpoint لاعتماد/تقديم مسودة)
        expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : null,
        notes: dto.notes,
        createdBy: userId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitPrice: item.unitPrice,
            lineTotal: round2(item.quantityOrdered * item.unitPrice),
          })),
        },
      },
      include: { items: { include: { product: true } }, supplier: true, warehouse: true },
    });

    return po;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.findOne(id);

    if (po.status === 'cancelled' || po.status === 'completed') {
      throw new ConflictException({
        code: 'PURCHASE_ORDER_LOCKED',
        message_ar: 'لا يمكن تعديل أمر شراء مكتمل أو ملغى',
      });
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(dto.expectedDeliveryDate !== undefined
          ? { expectedDeliveryDate: new Date(dto.expectedDeliveryDate) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { items: { include: { product: true } }, supplier: true, warehouse: true },
    });
  }

  async cancel(id: string) {
    const po = await this.findOne(id);

    if (!CANCELLABLE_STATUSES.includes(po.status as (typeof CANCELLABLE_STATUSES)[number])) {
      throw new ConflictException({
        code: 'PURCHASE_ORDER_NOT_CANCELLABLE',
        message_ar:
          po.status === 'cancelled'
            ? 'أمر الشراء ملغى بالفعل'
            : 'لا يمكن إلغاء أمر شراء بدأ استلامه أو اكتمل بالفعل',
      });
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  /**
   * findOverdue — استعلام قراءة فقط، بلا أي أثر جانبي: أوامر الشراء
   * المفتوحة (لم تكتمل ولم تُلغَ) التي تجاوز تاريخ توريدها المتوقع اليوم.
   * تُستخدَم من Dashboard Alerts Summary وأي شاشة قائمة مستقبلية.
   */
  async findOverdue() {
    const now = new Date();
    const overdueOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { in: [...OPEN_PO_STATUSES] },
        expectedDeliveryDate: { lt: now },
      },
      include: { supplier: true, warehouse: true },
      orderBy: { expectedDeliveryDate: 'asc' },
    });

    return overdueOrders.map((po: (typeof overdueOrders)[number]) => {
      const daysLate = Math.floor((now.getTime() - po.expectedDeliveryDate!.getTime()) / (1000 * 60 * 60 * 24));
      return { ...po, daysLate };
    });
  }

  /**
   * checkOverdueAndNotify — Step 6. لا يوجد Scheduler/Cron حقيقي مثبَّت في
   * هذا المشروع (لم نُضِف حزمة جديدة مثل @nestjs/schedule تفاديًا لأي
   * تبعية لم يتسنَّ اختبارها فعليًا)؛ بدلًا من ذلك تُستدعى هذه الدالة صراحة
   * من DashboardService عند كل تحميل لملخص التنبيهات — تفصيل موثَّق بوضوح
   * في تقرير التسليم كبديل عملي وليس Cron حقيقيًا. منع التكرار عبر تنبيه
   * po_delayed غير مقروء موجود بالفعل لنفس أمر الشراء.
   */
  async checkOverdueAndNotify() {
    if (!this.notificationsService) return;

    const overdueOrders = await this.findOverdue();

    for (const po of overdueOrders) {
      await this.prisma.$transaction(async (tx) => {
        const existingActiveAlert = await tx.notification.findFirst({
          where: { type: 'po_delayed', referenceType: 'purchase_order', referenceId: po.id, isRead: false },
        });
        if (existingActiveAlert) return; // منع التكرار

        await this.notificationsService!.notifyRoleByCode(tx, 'PURCHASING', {
          type: 'po_delayed',
          titleAr: 'تنبيه: أمر شراء متأخر',
          messageAr: `أمر الشراء "${po.poNumber}" من المورد "${po.supplier.name}" تجاوز تاريخ التوريد المتوقع بـ${po.daysLate} يومًا`,
          referenceType: 'purchase_order',
          referenceId: po.id,
        });
      });
    }
  }

  private generateCode(prefix: string): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
