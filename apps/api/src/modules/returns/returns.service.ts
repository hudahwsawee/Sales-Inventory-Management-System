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
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';

const CANCELLABLE_STATUSES = ['draft', 'pending_approval', 'approved'] as const;

/**
 * ملاحظة تصميمية (قرار يستحق تأكيدكم — موثَّق في تقرير التسليم):
 * ReturnStatus المعتمد أصلًا هو: draft → pending_approval → approved →
 * completed (+ cancelled). هذا التسلسل الخماسي المُعرَّف في الـenum نفسه
 * يوحي بوضوح أن التصميم الأصلي قصد **مسارًا واحدًا خطيًا** لكل مرتجع
 * (وليس مسارين بديلين كما في Sales Orders في Step 4) — لذلك كل مرتجع
 * يمر إلزاميًا عبر تقديم/قرار موافقة قبل إتمامه. هذا اختيار قابل للنقاش:
 * البديل كان "تخطي الموافقة" (draft → approved مباشرة) كما فعلنا مع
 * Sales Orders، لكنني رجّحت الالتزام الحرفي بترتيب enum المعتمد بدل
 * افتراض تبسيط إضافي غير مطلوب صراحة.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private notificationsService: NotificationsService,
  ) {}

  async findAll(query: QueryReturnsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ReturnWhereInput = {
      ...(query.returnType ? { returnType: query.returnType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.return.findMany({
        where,
        include: { customer: true, supplier: true, warehouse: true, items: true },
        orderBy: { returnDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.return.count({ where }),
    ]);

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const ret = await this.prisma.return.findUnique({
      where: { id },
      include: {
        customer: true,
        supplier: true,
        warehouse: true,
        creator: { select: { id: true, fullName: true } },
        referenceSalesOrder: { select: { id: true, orderNumber: true } },
        referencePurchaseOrder: { select: { id: true, poNumber: true } },
        items: { include: { product: true } },
        approvals: { orderBy: { requestedAt: 'desc' } },
      },
    });
    if (!ret) {
      throw new NotFoundException({ code: 'RETURN_NOT_FOUND', message_ar: 'المرتجع غير موجود' });
    }
    return ret;
  }

  async create(dto: CreateReturnDto, userId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException({ code: 'WAREHOUSE_INVALID', message_ar: 'المخزن غير موجود أو غير نشط' });
    }

    if (dto.returnType === 'customer_return') {
      await this.validateCustomerReturnReferences(dto);
    } else {
      await this.validateSupplierReturnReferences(dto);
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message_ar: `المنتج غير موجود (${item.productId})` });
      }

      const eligible = await this.getEligibleQuantity(this.prisma, {
        returnType: dto.returnType,
        productId: item.productId,
        referenceSalesOrderId: dto.referenceSalesOrderId,
        referencePurchaseOrderId: dto.referencePurchaseOrderId,
      });

      if (item.quantity > eligible) {
        throw new BadRequestException({
          code: 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE',
          message_ar: `الكمية المطلوب إرجاعها للمنتج "${product.nameAr}" (${item.quantity}) أكبر من الكمية المؤهَّلة للإرجاع (${eligible})`,
        });
      }
    }

    return this.prisma.return.create({
      data: {
        returnNumber: this.generateCode('RET'),
        returnType: dto.returnType,
        customerId: dto.returnType === 'customer_return' ? dto.customerId : undefined,
        supplierId: dto.returnType === 'supplier_return' ? dto.supplierId : undefined,
        referenceSalesOrderId: dto.returnType === 'customer_return' ? dto.referenceSalesOrderId : undefined,
        referencePurchaseOrderId: dto.returnType === 'supplier_return' ? dto.referencePurchaseOrderId : undefined,
        warehouseId: dto.warehouseId,
        status: 'draft',
        createdBy: userId,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            reason: i.reason,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });
  }

  /** submit — تقديم المرتجع للموافقة (المسار الإلزامي الوحيد نحو الإتمام، انظر الملاحظة أعلى الملف) */
  async submit(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.return.updateMany({ where: { id, status: 'draft' }, data: { status: 'pending_approval' } });
      if (claim.count === 0) {
        throw new ConflictException({ code: 'RETURN_NOT_DRAFT', message_ar: 'لا يمكن تقديم مرتجع إلا وهو في حالة مسودة' });
      }

      const approval = await tx.approval.create({
        data: { approvalType: 'return_approval', returnId: id, requestedBy: userId, status: 'pending' },
      });

      await this.notificationsService.notifyRoleByCode(tx, 'ADMIN', {
        type: 'approval_needed',
        titleAr: 'طلب موافقة على مرتجع',
        messageAr: 'هناك مرتجع جديد بانتظار الموافقة.',
        referenceType: 'approval',
        referenceId: approval.id,
      });

      return tx.return.findUniqueOrThrow({ where: { id } });
    });
  }

  async cancel(id: string) {
    const ret = await this.findOne(id);
    if (!CANCELLABLE_STATUSES.includes(ret.status as (typeof CANCELLABLE_STATUSES)[number])) {
      throw new ConflictException({
        code: 'RETURN_NOT_CANCELLABLE',
        message_ar: ret.status === 'completed' ? 'لا يمكن إلغاء مرتجع مكتمل بالفعل' : 'المرتجع ملغى بالفعل',
      });
    }
    return this.prisma.return.update({ where: { id }, data: { status: 'cancelled' } });
  }

  /**
   * complete — التنفيذ الفعلي: الأثر الوحيد على المخزون في كامل دورة حياة
   * المرتجع. استحواذ ذرّي على الانتقال approved→completed أولًا (يمنع
   * الإتمام المزدوج/المتكرر عند إعادة إرسال الطلب — نفس نمط
   * SalesOrdersService.fulfill المعتمد في Step 4)، ثم إعادة التحقق من
   * الأهلية دفاعيًا (تحسّبًا لمرتجع آخر أُتمَّ للمنتج نفسه بين لحظة
   * الإنشاء ولحظة الإتمام)، ثم تطبيق الأثر الفعلي.
   */
  async complete(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.return.updateMany({ where: { id, status: 'approved' }, data: { status: 'completed' } });
      if (claim.count === 0) {
        throw new ConflictException({
          code: 'RETURN_NOT_COMPLETABLE',
          message_ar: 'لا يمكن إتمام هذا المرتجع — إما أُتمَّ بالفعل أو ليس في حالة معتمدة',
        });
      }

      const ret = await tx.return.findUniqueOrThrow({ where: { id }, include: { items: true } });

      for (const item of ret.items) {
        // إعادة تحقق دفاعية للأهلية عند الإتمام (وليس فقط عند الإنشاء) —
        // تستثني هذا المرتجع نفسه من الحساب لأن حالته الآن 'completed' مسبقًا
        const eligible = await this.getEligibleQuantity(tx, {
          returnType: ret.returnType,
          productId: item.productId,
          referenceSalesOrderId: ret.referenceSalesOrderId ?? undefined,
          referencePurchaseOrderId: ret.referencePurchaseOrderId ?? undefined,
          excludeReturnId: ret.id,
        });
        if (Number(item.quantity) > eligible) {
          throw new BadRequestException({
            code: 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE',
            message_ar: 'تغيّرت الكمية المؤهَّلة للإرجاع منذ إنشاء هذا المرتجع (مرتجع آخر أُتمَّ بينهما) — لا يمكن الإتمام',
          });
        }

        if (ret.returnType === 'customer_return') {
          // مرتجع عميل: البضاعة تعود فعليًا → المخزون يزيد
          await this.inventoryService.applyInventoryChange(tx, {
            productId: item.productId,
            warehouseId: ret.warehouseId,
            transactionType: 'customer_return',
            quantity: Number(item.quantity),
            referenceType: 'return',
            referenceId: ret.id,
            userId,
          });
        } else {
          // مرتجع مورد: البضاعة تغادر فعليًا (تُعاد للمورد) → المخزون ينقص
          await this.inventoryService.applyInventoryChange(tx, {
            productId: item.productId,
            warehouseId: ret.warehouseId,
            transactionType: 'supplier_return',
            quantity: -Number(item.quantity),
            referenceType: 'return',
            referenceId: ret.id,
            userId,
          });
          // تنبيه نقص المخزون اختياري (لا يوقف العملية إن فشل) — فقط لمرتجعات
          // المورد لأنها الحالة الوحيدة التي تُنقِص المخزون فعليًا في هذه الخطوة
          await this.inventoryService.notifyIfLowStock(tx, {
            productId: item.productId,
            warehouseId: ret.warehouseId,
          });
        }
      }

      return tx.return.findUniqueOrThrow({ where: { id }, include: { items: { include: { product: true } } } });
    });
  }

  // ---------------------------------------------------------------------
  // مساعدات خاصة
  // ---------------------------------------------------------------------

  private async validateCustomerReturnReferences(dto: CreateReturnDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) {
      throw new BadRequestException({ code: 'CUSTOMER_NOT_FOUND', message_ar: 'العميل غير موجود' });
    }

    const salesOrder = await this.prisma.salesOrder.findUnique({ where: { id: dto.referenceSalesOrderId } });
    if (!salesOrder) {
      throw new BadRequestException({ code: 'SALES_ORDER_NOT_FOUND', message_ar: 'أمر البيع المرجعي غير موجود' });
    }
    if (salesOrder.customerId !== dto.customerId) {
      throw new BadRequestException({ code: 'SALES_ORDER_CUSTOMER_MISMATCH', message_ar: 'أمر البيع لا يخص هذا العميل' });
    }
    if (salesOrder.status !== 'delivered') {
      throw new BadRequestException({
        code: 'SALES_ORDER_NOT_DELIVERED',
        message_ar: 'لا يمكن إرجاع بضاعة من طلب لم يُسلَّم بعد',
      });
    }
  }

  private async validateSupplierReturnReferences(dto: CreateReturnDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) {
      throw new BadRequestException({ code: 'SUPPLIER_NOT_FOUND', message_ar: 'المورد غير موجود' });
    }

    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({ where: { id: dto.referencePurchaseOrderId } });
    if (!purchaseOrder) {
      throw new BadRequestException({ code: 'PURCHASE_ORDER_NOT_FOUND', message_ar: 'أمر الشراء المرجعي غير موجود' });
    }
    if (purchaseOrder.supplierId !== dto.supplierId) {
      throw new BadRequestException({ code: 'PURCHASE_ORDER_SUPPLIER_MISMATCH', message_ar: 'أمر الشراء لا يخص هذا المورد' });
    }
  }

  /**
   * getEligibleQuantity — الكمية الأصلية (المسلَّمة فعليًا للعميل، أو
   * المستلمة فعليًا من المورد) ناقص ما أُرجِع بالفعل عبر مرتجعات **مكتملة**
   * فقط لنفس المرجع والمنتج والنوع. تُستخدَم عند الإنشاء (تحقق مبكر) وعند
   * الإتمام (تحقق حاسم دفاعي).
   */
  private async getEligibleQuantity(
    client: PrismaService | Prisma.TransactionClient,
    params: {
      returnType: 'customer_return' | 'supplier_return';
      productId: string;
      referenceSalesOrderId?: string;
      referencePurchaseOrderId?: string;
      excludeReturnId?: string;
    },
  ): Promise<number> {
    let originalQty = 0;

    if (params.returnType === 'customer_return') {
      const agg = await client.salesOrderItem.aggregate({
        where: { salesOrderId: params.referenceSalesOrderId, productId: params.productId },
        _sum: { quantity: true },
      });
      originalQty = Number(agg._sum.quantity ?? 0);
    } else {
      const agg = await client.purchaseReceiptItem.aggregate({
        where: { productId: params.productId, purchaseReceipt: { purchaseOrderId: params.referencePurchaseOrderId } },
        _sum: { quantityReceived: true },
      });
      originalQty = Number(agg._sum.quantityReceived ?? 0);
    }

    const returnedAgg = await client.returnItem.aggregate({
      where: {
        productId: params.productId,
        return: {
          returnType: params.returnType,
          status: 'completed',
          ...(params.returnType === 'customer_return'
            ? { referenceSalesOrderId: params.referenceSalesOrderId }
            : { referencePurchaseOrderId: params.referencePurchaseOrderId }),
          ...(params.excludeReturnId ? { id: { not: params.excludeReturnId } } : {}),
        },
      },
      _sum: { quantity: true },
    });
    const alreadyReturned = Number(returnedAgg._sum.quantity ?? 0);

    return originalQty - alreadyReturned;
  }

  private generateCode(prefix: string): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
  }
}
