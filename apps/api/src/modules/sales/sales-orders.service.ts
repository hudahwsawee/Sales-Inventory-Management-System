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
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { QuerySalesOrdersDto } from './dto/query-sales-orders.dto';
import { CancelSalesOrderDto } from './dto/cancel-sales-order.dto';

const CANCELLABLE_STATUSES = ['draft', 'approved'] as const;

/**
 * ملاحظة تصميمية مهمة (قرار يحتاج تأكيدكم — موثَّق أيضًا في تقرير التسليم):
 * المتطلبات المعتمدة أصلًا (System Architecture) تتضمن حالات وسيطة إضافية
 * (pending_approval لتجاوز الخصم/الائتمان، preparing، ready_for_delivery)
 * ضمن Sales Workflow الكامل. **نطاق Step 4 لا يطلب منطق الموافقات على
 * الخصم/الحد الائتماني** (غير مذكور في تعليماتكم)، لذلك بسّطت التدفق إلى:
 *   draft → (confirm) → approved → (fulfill) → delivered
 *   + cancelled من draft أو approved
 * هذا **لا يخترع حالات جديدة** — كل الحالات المستخدمة هنا موجودة أصلًا في
 * SalesOrderStatus enum المعتمد؛ فقط لا نستخدم pending_approval/preparing/
 * ready_for_delivery/rejected في هذه الخطوة لعدم وجود منطق موافقة مطلوب بعد.
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    // اختياري عمدًا (Step 6): يحافظ على توافق `new SalesOrdersService(prisma,
    // inventoryService)` الحالي في sales-orders.service.spec.ts دون أي تعديل
    // عليه، بينما يُحقَن فعليًا عبر NestJS DI في SalesModule الحقيقي.
    private notificationsService?: NotificationsService,
  ) {}

  async findAll(query: QuerySalesOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.SalesOrderWhereInput = {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { orderNumber: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: { customer: true, warehouse: true, items: true },
        orderBy: { orderDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      items: items.map(this.withRemainingBalance),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        customerLocation: true,
        warehouse: true,
        creator: { select: { id: true, fullName: true } },
        items: { include: { product: true, reservation: true } },
        payments: { include: { paymentMethod: true }, orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!order) {
      throw new NotFoundException({ code: 'SALES_ORDER_NOT_FOUND', message_ar: 'طلب البيع غير موجود' });
    }
    return this.withRemainingBalance(order);
  }

  async create(dto: CreateSalesOrderDto, userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) {
      throw new BadRequestException({ code: 'CUSTOMER_NOT_FOUND', message_ar: 'العميل غير موجود' });
    }
    if (!customer.isActive) {
      throw new BadRequestException({ code: 'CUSTOMER_INACTIVE', message_ar: 'العميل غير نشط' });
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new BadRequestException({ code: 'WAREHOUSE_NOT_FOUND', message_ar: 'المخزن غير موجود' });
    }
    if (!warehouse.isActive) {
      throw new BadRequestException({ code: 'WAREHOUSE_INACTIVE', message_ar: 'المخزن غير نشط' });
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const stockWarnings: { productId: string; requested: number; available: number }[] = [];
    const itemsData: Prisma.SalesOrderItemUncheckedCreateWithoutSalesOrderInput[] = [];
    let subtotal = 0;

    for (const line of dto.items) {
      const product = productMap.get(line.productId);
      if (!product) {
        throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message_ar: `المنتج غير موجود (${line.productId})` });
      }
      if (!product.isActive) {
        throw new BadRequestException({ code: 'PRODUCT_INACTIVE', message_ar: `المنتج "${product.nameAr}" غير نشط` });
      }

      // فحص استرشادي غير حاجز عند الإنشاء (Draft) — الحجز الذري الفعلي
      // والرفض الحاسم يحدثان عند /confirm فقط، تطبيقًا لنمط Sales Workflow
      // المعتمد أصلًا (Draft → تحذير مبكر غير ملزم → Approved → حجز ذري).
      const balance = await this.prisma.inventoryBalance.findUnique({
        where: { productId_warehouseId: { productId: line.productId, warehouseId: dto.warehouseId } },
      });
      const available = balance ? Number(balance.quantityOnHand) - Number(balance.reservedQuantity) : 0;
      if (available < line.quantity) {
        stockWarnings.push({ productId: line.productId, requested: line.quantity, available });
      }

      const discountPercent = line.discountPercent ?? 0;
      const lineTotal = round2(line.quantity * line.unitPrice * (1 - discountPercent / 100));
      subtotal += lineTotal;

      itemsData.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent,
        // unitCostSnapshot: يُلتقَط عند الإنشاء من average_cost الحالي —
        // حقل إلزامي (NOT NULL) في التصميم المعتمد، وأساس حساب الربح لاحقًا
        // دون أن يتأثر بتغيّر التكلفة مستقبلًا (نفس مبدأ Costing المعتمد).
        unitCostSnapshot: Number(product.averageCost),
        lineTotal,
      });
    }

    const order = await this.prisma.salesOrder.create({
      data: {
        orderNumber: this.generateCode('SO'),
        customerId: dto.customerId,
        customerLocationId: dto.customerLocationId,
        warehouseId: dto.warehouseId,
        status: 'draft',
        paymentType: dto.paymentType,
        subtotal: round2(subtotal),
        totalAmount: round2(subtotal),
        createdBy: userId,
        items: { create: itemsData },
      },
      include: { items: { include: { product: true } }, customer: true, warehouse: true },
    });

    return { ...this.withRemainingBalance(order), stockWarnings };
  }

  async update(id: string, dto: UpdateSalesOrderDto) {
    const order = await this.findOne(id);
    if (order.status !== 'draft') {
      throw new ConflictException({
        code: 'SALES_ORDER_LOCKED',
        message_ar: 'لا يمكن تعديل طلب بيع بعد تأكيده',
      });
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: { ...(dto.customerLocationId !== undefined ? { customerLocationId: dto.customerLocationId } : {}) },
      include: { items: { include: { product: true } }, customer: true, warehouse: true },
    });
  }

  /**
   * confirm — التأكيد الحاسم: حجز ذرّي لكل بنود الطلب معًا (الكل أو لا شيء).
   * فشل حجز أي بند واحد يُرجِع كل شيء (لا حجز جزئي لبعض البنود دون بعض).
   */
  async confirm(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) {
        throw new NotFoundException({ code: 'SALES_ORDER_NOT_FOUND', message_ar: 'طلب البيع غير موجود' });
      }
      if (order.status !== 'draft') {
        throw new ConflictException({
          code: 'SALES_ORDER_NOT_DRAFT',
          message_ar: 'لا يمكن تأكيد طلب تم تأكيده أو إلغاؤه بالفعل',
        });
      }

      // ترتيب ثابت بمعرّف البند لتفادي Deadlock عند تزامن تأكيد طلبين يلمسان نفس المنتج
      const sortedItems = [...order.items].sort((a, b) => a.id.localeCompare(b.id));
      for (const item of sortedItems) {
        await this.inventoryService.reserveStock(tx, {
          salesOrderItemId: item.id,
          productId: item.productId,
          warehouseId: order.warehouseId,
          quantity: Number(item.quantity),
        });
      }

      // البيع الآجل فقط يزيد التزام العميل الائتماني — يتوافق مع التصميم المعتمد
      if (order.paymentType === 'credit') {
        const updatedCustomer = await tx.customer.update({
          where: { id: order.customerId },
          data: { currentBalance: { increment: order.totalAmount } },
        });

        // Step 6 — Customer Credit Limit Alert: تنبيه فقط، بلا منع للعملية.
        // لا Business Rule معتمدة حاليًا تفرض حظر تجاوز الحد الائتماني عند
        // التأكيد (لم تُطلَب صراحة في أي مرحلة سابقة)، لذلك لا نضيف حظرًا
        // جديدًا هنا من عندنا — فقط الجزء المطلوب صراحة في Step 6: التنبيه.
        await this.checkCreditLimitAndNotify(tx, updatedCustomer);
      }

      return tx.salesOrder.update({
        where: { id },
        data: { status: 'approved', approvedBy: userId },
        include: { items: { include: { product: true } } },
      });
    });
  }

  /**
   * fulfill — التسليم الفعلي: استهلاك كل الحجوزات (خصم فعلي من المخزون +
   * إنشاء حركة `sale`) لكل بند. الاستحواذ الذري على الانتقال draft→delivered
   * قبل أي معالجة يمنع التسليم المزدوج المتزامن (نفس نمط Rotation المعتمد
   * في Auth سابقًا).
   */
  async fulfill(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.salesOrder.updateMany({
        where: { id, status: 'approved' },
        data: { status: 'delivered', deliveredAt: new Date() },
      });

      if (claim.count === 0) {
        // إما تم تسليمه بالفعل (تسليم مزدوج مُتجَنَّب هنا تحديدًا)، أو لم يصل
        // بعد لحالة "معتمد"، أو أُلغي — في كل الحالات: رفض واضح بلا أثر جانبي
        throw new ConflictException({
          code: 'SALES_ORDER_NOT_FULFILLABLE',
          message_ar: 'لا يمكن تسليم هذا الطلب — إما تم تسليمه مسبقًا أو ليس في حالة معتمدة',
        });
      }

      const order = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
      const sortedItems = [...order.items].sort((a, b) => a.id.localeCompare(b.id));

      for (const item of sortedItems) {
        await this.inventoryService.consumeReservation(tx, {
          salesOrderItemId: item.id,
          referenceId: order.id,
          userId,
        });
      }

      return tx.salesOrder.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { product: true } } },
      });
    });
  }

  async cancel(id: string, dto: CancelSalesOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) {
        throw new NotFoundException({ code: 'SALES_ORDER_NOT_FOUND', message_ar: 'طلب البيع غير موجود' });
      }
      if (!CANCELLABLE_STATUSES.includes(order.status as (typeof CANCELLABLE_STATUSES)[number])) {
        throw new ConflictException({
          code: 'SALES_ORDER_NOT_CANCELLABLE',
          message_ar:
            order.status === 'cancelled' ? 'الطلب ملغى بالفعل' : 'لا يمكن إلغاء طلب تم تسليمه بالفعل',
        });
      }

      // تحرير أي حجوزات نشطة (لن يوجد شيء لتحريره إن كان الطلب لا يزال Draft)
      for (const item of order.items) {
        await this.inventoryService.releaseReservation(tx, item.id);
      }

      // عكس أثر الالتزام الائتماني إن كان قد أُضيف فعلًا عند التأكيد
      if (order.status === 'approved' && order.paymentType === 'credit') {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { currentBalance: { decrement: order.totalAmount } },
        });
      }

      return tx.salesOrder.update({
        where: { id },
        data: { status: 'cancelled', cancelledReason: dto.reason },
      });
    });
  }

  /**
   * checkCreditLimitAndNotify — Step 6. المقارنة تتم عبر Prisma.Decimal
   * (.gte) مباشرة، **بلا تحويل إلى Number إطلاقًا** لغرض اتخاذ القرار —
   * تحويل الأموال إلى JavaScript float قبل مقارنة حرجة قد يُنتج أخطاء
   * تقريب صامتة، وهذا مرفوض صراحة لهذا النوع من المقارنات.
   */
  private async checkCreditLimitAndNotify(
    tx: Prisma.TransactionClient,
    customer: { id: string; name: string; currentBalance: Prisma.Decimal; creditLimit: Prisma.Decimal },
  ) {
    if (!this.notificationsService) return; // لا خدمة إشعارات متاحة (اختبارات) — تجاهل بصمت، بلا أي أثر آخر

    if (!customer.currentBalance.gte(customer.creditLimit)) return; // لم يصل للحد بعد

    const existingActiveAlert = await tx.notification.findFirst({
      where: { type: 'credit_limit_exceeded', referenceType: 'customer', referenceId: customer.id, isRead: false },
    });
    if (existingActiveAlert) return; // منع التكرار — تنبيه نشط بالفعل لهذا العميل

    await this.notificationsService.notifyRoleByCode(tx, 'SALES', {
      type: 'credit_limit_exceeded',
      titleAr: 'تنبيه: عميل عند الحد الائتماني أو تجاوزه',
      messageAr: `العميل "${customer.name}" وصل رصيده المستحق (${customer.currentBalance.toString()}) إلى الحد الائتماني (${customer.creditLimit.toString()}) أو تجاوزه`,
      referenceType: 'customer',
      referenceId: customer.id,
    });
  }

  private withRemainingBalance<T extends { totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>(
    order: T,
  ) {
    return { ...order, remainingBalance: Number(order.totalAmount) - Number(order.paidAmount) };
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
