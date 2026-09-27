import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma, InventoryTransactionType, InventoryReferenceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueryInventoryBalancesDto } from './dto/query-inventory-balances.dto';
import { QueryInventoryTransactionsDto } from './dto/query-inventory-transactions.dto';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';

export interface ApplyInventoryChangeParams {
  productId: string;
  warehouseId: string;
  transactionType: InventoryTransactionType;
  /** موجب للحركات الداخلة (استلام، تسوية IN)، سالب للخارجة (تسوية OUT) — نفس اتفاقية التصميم المعتمد */
  quantity: number;
  unitCost?: number | null;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  userId: string;
  notes?: string | null;
}

/**
 * ملاحظة تصميمية: الحد الأدنى للمخزون (Low Stock) يُقارَن بـ`quantity_on_hand`
 * وليس `available_quantity`. السبب: في هذه المرحلة (لا مبيعات بعد)
 * `reserved_quantity` يبقى 0 دائمًا فتتساوى القيمتان عمليًا، لكن اخترنا
 * `quantity_on_hand` كقاعدة دائمة لأن قرار الشراء (إعادة الطلب) يجب أن
 * يعتمد على الكمية الفعلية الموجودة فعليًا في المخزن، وليس على كمية قد
 * تنخفض مؤقتًا بسبب حجوزات عابرة لطلبات لم تُسلَّم بعد — هذه القاعدة
 * قابلة لإعادة المراجعة صراحة عند بناء Sales لاحقًا إن ظهرت حاجة عملية لذلك.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private prisma: PrismaService,
    // اختياري عمدًا: يحافظ على توافق كل استدعاءات `new InventoryService(prisma)`
    // الحالية في اختبارات Step 3/4 (auth/receiving/sales) دون أي تعديل عليها،
    // بينما يُحقَن فعليًا عبر NestJS DI في التطبيق الحقيقي (InventoryModule
    // يستورد NotificationsModule). لا يُستخدَم إطلاقًا داخل applyInventoryChange
    // نفسها لتفادي أي أثر على مسارها المُختبَر أصلًا — فقط في checkLowStockAndNotify
    // الجديدة أدناه، التي تستدعيها الوحدات الجديدة (Returns) صراحة عند الحاجة.
    private notificationsService?: NotificationsService,
  ) {}

  async findBalances(query: QueryInventoryBalancesDto) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: { product: { nameAr: 'asc' } },
    });

    return balances.map(this.withAvailableQuantity);
  }

  async findTransactions(query: QueryInventoryTransactionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const where: Prisma.InventoryTransactionWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.transactionType ? { transactionType: query.transactionType } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            transactionDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: {
          product: true,
          warehouse: true,
          user: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * ملاحظة تحديث Step 6: القاعدة السابقة (Step 3) كانت quantity_on_hand
   * <= minimum_stock، بمبرر أن القرار الشرائي يجب أن يعتمد على الموجود
   * فعليًا. **تعليمات Step 6 الصريحة غيّرت هذا القرار**: "الاعتماد على
   * available quantity وليس فقط quantity on hand" — الآن بعد أن أصبح لدى
   * النظام حجوزات فعلية (Sales Reservation من Step 4)، الكمية المتاحة
   * فعليًا للبيع (بعد خصم المحجوز) هي المقياس الأصح لتنبيه "قارب على
   * النفاد"، لأن كمية ظاهريًا كافية على الورق (quantity_on_hand) قد تكون
   * بالكامل محجوزة فعليًا لطلبات أخرى.
   */
  async findLowStock(warehouseId?: string) {
    const settings = await this.prisma.warehouseProductSetting.findMany({
      where: { isActive: true, ...(warehouseId ? { warehouseId } : {}) },
      include: { product: true, warehouse: true },
    });

    const results = [];
    for (const setting of settings) {
      const balance = await this.prisma.inventoryBalance.findUnique({
        where: { productId_warehouseId: { productId: setting.productId, warehouseId: setting.warehouseId } },
      });
      const quantityOnHand = balance ? Number(balance.quantityOnHand) : 0;
      const reservedQuantity = balance ? Number(balance.reservedQuantity) : 0;
      const availableQuantity = quantityOnHand - reservedQuantity;

      // Low Stock Rule (محدَّثة في Step 6): available_quantity <= minimum_stock
      if (availableQuantity <= setting.minimumStock) {
        results.push({
          product: setting.product,
          warehouse: setting.warehouse,
          quantityOnHand,
          availableQuantity,
          minimumStock: setting.minimumStock,
          reorderLevel: setting.reorderLevel,
        });
      }
    }
    return results;
  }

  /**
   * createAdjustment — تسوية يدوية للمخزون (IN/OUT). تُستخدم دالة
   * applyInventoryChange نفسها المستخدمة من وحدة الاستلام، لضمان أن كل
   * عملية تُغيِّر المخزون تمر من نفس المسار الموثوق دون ازدواجية منطق.
   */
  async createAdjustment(dto: CreateInventoryAdjustmentDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message_ar: 'المنتج غير موجود' });
    }
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new BadRequestException({ code: 'WAREHOUSE_NOT_FOUND', message_ar: 'المخزن غير موجود' });
    }

    const signedQuantity = dto.type === 'ADJUSTMENT_IN' ? dto.quantity : -dto.quantity;
    const notes = `${dto.reason}${dto.notes ? ` — ${dto.notes}` : ''}`;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await this.applyInventoryChange(tx, {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        transactionType: 'adjustment',
        quantity: signedQuantity,
        unitCost: null,
        referenceType: 'manual',
        referenceId: null,
        userId,
        notes,
      });

      // Step 6: تسوية "نقص" حقيقية قد تُدخِل المنتج في نطاق "منخفض" —
      // فحص واختياري تمامًا (لا أثر إن لم تتوفر notificationsService، انظر توثيق الدالة)
      if (signedQuantity < 0) {
        await this.notifyIfLowStock(tx, { productId: dto.productId, warehouseId: dto.warehouseId });
      }

      return transaction;
    });
  }

  /**
   * applyInventoryChange — نقطة التحديث الوحيدة المعتمدة لدفتر الحركات
   * والرصيد معًا. يجب استدعاؤها دائمًا داخل معاملة قائمة (tx) يوفّرها
   * المستدعي (ReceivingService أو createAdjustment أعلاه)، وليس أبدًا
   * بمعزل عنها — هذا يضمن أن inventory_transactions وinventory_balances
   * يتحدَّثان معًا ذريًا دائمًا (قاعدة معمارية معتمدة صراحة).
   *
   * الحماية من Race Conditions: الزيادة (quantity > 0) تُنفَّذ عبر Prisma
   * `increment` (جملة SQL ذرية واحدة `col = col + x`، لا قراءة ثم كتابة).
   * الخصم (quantity < 0) يُنفَّذ عبر `updateMany` بشرط `quantity_on_hand
   * >= |quantity|` ضمن نفس الاستعلام — إن لم يتحقق الشرط (Race أو رصيد
   * غير كافٍ)، `count` يكون 0 وتُرفَض العملية فورًا، بنفس نمط الاستحواذ
   * الذري المعتمد أصلًا في تصميم الحجز (Reservation).
   */
  async applyInventoryChange(tx: Prisma.TransactionClient, params: ApplyInventoryChangeParams) {
    const { productId, warehouseId, quantity } = params;

    if (quantity === 0) {
      throw new BadRequestException({ code: 'ZERO_QUANTITY', message_ar: 'الكمية يجب ألا تساوي صفرًا' });
    }

    if (quantity > 0) {
      // زيادة: Upsert آمن (لا خطر من تجاوز حد، فقط إنشاء الصف إن لم يوجد أو زيادته)
      await tx.inventoryBalance.upsert({
        where: { productId_warehouseId: { productId, warehouseId } },
        create: { productId, warehouseId, quantityOnHand: quantity, reservedQuantity: 0 },
        update: { quantityOnHand: { increment: quantity } },
      });
    } else {
      const decrementAmount = Math.abs(quantity);
      const claim = await tx.inventoryBalance.updateMany({
        where: { productId, warehouseId, quantityOnHand: { gte: decrementAmount } },
        data: { quantityOnHand: { decrement: decrementAmount } },
      });

      if (claim.count === 0) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          message_ar: 'الرصيد غير كافٍ لإجراء التسوية',
        });
      }
    }

    return tx.inventoryTransaction.create({
      data: {
        productId,
        warehouseId,
        transactionType: params.transactionType,
        quantity: params.quantity,
        unitCost: params.unitCost ?? undefined,
        referenceType: params.referenceType,
        referenceId: params.referenceId ?? undefined,
        userId: params.userId,
        notes: params.notes ?? undefined,
      },
    });
  }

  // ==========================================================================
  // Step 4 — دورة حياة الحجز (Reservation Lifecycle)، تُستخدَم حصريًا من
  // SalesService. لا تُنشئ هذه الدوال أي inventory_transaction بذاتها إلا
  // عند الاستهلاك الفعلي (consumeReservation) — الحجز نفسه لا يُعتبر حركة
  // مخزون حسب التصميم المعتمد، فقط تعديل reserved_quantity.
  // ==========================================================================

  /**
   * reserveStock — استحواذ ذرّي على الكمية عبر UPDATE ... WHERE واحد يقارن
   * (quantity_on_hand - reserved_quantity) >= qty مباشرة في SQL (مقارنة بين
   * عمودين لا يدعمها Prisma تصريحيًا، فاستخدام $executeRaw هنا ضروري
   * وليس اختيارًا أسلوبيًا) — نفس المبدأ المعتمد أصلًا في تصميم الحجز.
   * فشل الاستحواذ (0 صف متأثر) = "الكمية غير متوفرة"، رفض فوري بلا حالة وسيطة.
   */
  async reserveStock(
    tx: Prisma.TransactionClient,
    params: {
      salesOrderItemId: string;
      productId: string;
      warehouseId: string;
      quantity: number;
    },
  ) {
    const affectedRows = await tx.$executeRaw`
      UPDATE inventory_balances
      SET reserved_quantity = reserved_quantity + ${params.quantity}
      WHERE product_id = ${params.productId}
        AND warehouse_id = ${params.warehouseId}
        AND (quantity_on_hand - reserved_quantity) >= ${params.quantity}
    `;

    if (affectedRows === 0) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_AVAILABLE_STOCK',
        message_ar: 'الكمية المطلوبة غير متوفرة في المخزون',
      });
    }

    return tx.inventoryReservation.create({
      data: {
        salesOrderItemId: params.salesOrderItemId,
        productId: params.productId,
        warehouseId: params.warehouseId,
        quantityReserved: params.quantity,
        status: 'active',
      },
    });
  }

  /** releaseReservation — تحرير حجز نشط دون أي أثر فعلي على quantity_on_hand (لم تغادر الكمية المخزن أصلًا) */
  async releaseReservation(tx: Prisma.TransactionClient, salesOrderItemId: string) {
    const reservation = await tx.inventoryReservation.findUnique({ where: { salesOrderItemId } });
    if (!reservation || reservation.status !== 'active') {
      return null; // لا شيء لتحريره — حالة طبيعية إن لم يكن الطلب قد وصل لمرحلة الحجز أصلًا
    }

    await tx.$executeRaw`
      UPDATE inventory_balances
      SET reserved_quantity = reserved_quantity - ${Number(reservation.quantityReserved)}
      WHERE product_id = ${reservation.productId} AND warehouse_id = ${reservation.warehouseId}
    `;

    return tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: 'released', resolvedAt: new Date() },
    });
  }

  /**
   * consumeReservation — التحويل الفعلي من "محجوز" إلى "خارج فعليًا".
   * هذا هو الحدث الوحيد الذي يُنشئ inventory_transaction من نوع `sale`
   * ويُخصِم quantity_on_hand فعليًا (Fulfillment/التسليم)، مع تحرير الحجز
   * في نفس العملية الذرية (UPDATE واحد على العمودين معًا).
   */
  async consumeReservation(
    tx: Prisma.TransactionClient,
    params: { salesOrderItemId: string; referenceId: string; userId: string },
  ) {
    const reservation = await tx.inventoryReservation.findUnique({
      where: { salesOrderItemId: params.salesOrderItemId },
    });
    if (!reservation || reservation.status !== 'active') {
      throw new BadRequestException({
        code: 'RESERVATION_NOT_ACTIVE',
        message_ar: 'لا يوجد حجز نشط لهذا البند لتنفيذ التسليم',
      });
    }

    const qty = Number(reservation.quantityReserved);

    const affectedRows = await tx.$executeRaw`
      UPDATE inventory_balances
      SET quantity_on_hand = quantity_on_hand - ${qty},
          reserved_quantity = reserved_quantity - ${qty}
      WHERE product_id = ${reservation.productId} AND warehouse_id = ${reservation.warehouseId}
        AND quantity_on_hand >= ${qty} AND reserved_quantity >= ${qty}
    `;

    if (affectedRows === 0) {
      // احترازي فقط — لا ينبغي حدوثه إن كان الحجز قد تم بنجاح مسبقًا
      throw new BadRequestException({
        code: 'FULFILLMENT_BALANCE_MISMATCH',
        message_ar: 'تعذّر تنفيذ التسليم — تعارض في رصيد المخزون، الرجاء المحاولة مجددًا',
      });
    }

    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: 'consumed', resolvedAt: new Date() },
    });

    const transaction = await tx.inventoryTransaction.create({
      data: {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        transactionType: 'sale',
        quantity: -qty,
        referenceType: 'sales_order',
        referenceId: params.referenceId,
        userId: params.userId,
      },
    });

    // Step 6: التسليم الفعلي هو أكثر الأحداث شيوعًا لدخول المخزون نطاق
    // "منخفض" عمليًا — فحص واختياري تمامًا (لا أثر بدون notificationsService)
    await this.notifyIfLowStock(tx, { productId: reservation.productId, warehouseId: reservation.warehouseId });

    return transaction;
  }

  /**
   * notifyIfLowStock — مُحدَّثة في Step 6:
   * 1) القاعدة أصبحت available_quantity <= minimum_stock (تطابق findLowStock أعلاه).
   * 2) **منع التكرار (Deduplication)**: لا يُنشأ تنبيه جديد إن وُجد تنبيه
   *    low_stock غير مقروء بالفعل لنفس رصيد المنتج×المخزن — يُكتفى بالتنبيه
   *    القائم حتى يُقرَأ (يُفترض أن قراءته تعني معالجة الموقف)، بدل إغراق
   *    المستخدم بتنبيه مطابق مع كل عملية بيع/تسوية لاحقة قبل معالجة الأول.
   * 3) الآن تُستدعى فعليًا من مسارين حقيقيين إضافيين (وليس فقط مرتجعات
   *    الموردين كما في Step 5): InventoryService.consumeReservation
   *    (تسليم المبيعات) وcreateAdjustment (ADJUSTMENT_OUT) — أُضيفت
   *    الاستدعاءات داخل هاتين الدالتين مباشرة أدناه.
   */
  async notifyIfLowStock(
    tx: Prisma.TransactionClient,
    params: { productId: string; warehouseId: string },
  ): Promise<void> {
    if (!this.notificationsService) return; // لا خدمة إشعارات متاحة (مثال: استدعاء يدوي في اختبار) — تجاهل بصمت

    const setting = await tx.warehouseProductSetting.findUnique({
      where: { productId_warehouseId: { productId: params.productId, warehouseId: params.warehouseId } },
    });
    if (!setting || !setting.isActive) return; // لا حد أدنى مُعرَّف لهذا المنتج×المخزن — لا تنبيه ممكن أصلًا

    const balance = await tx.inventoryBalance.findUnique({
      where: { productId_warehouseId: { productId: params.productId, warehouseId: params.warehouseId } },
    });
    if (!balance) return;

    const availableQuantity = Number(balance.quantityOnHand) - Number(balance.reservedQuantity);
    if (availableQuantity > setting.minimumStock) return; // لم يعد منخفضًا — لا شيء لفعله

    // === منع التكرار: تخطَّ الإنشاء إن وُجد تنبيه نشط (غير مقروء) بالفعل ===
    const existingActiveAlert = await tx.notification.findFirst({
      where: { type: 'low_stock', referenceType: 'inventory_balance', referenceId: balance.id, isRead: false },
    });
    if (existingActiveAlert) return;

    const product = await tx.product.findUnique({ where: { id: params.productId } });
    const warehouse = await tx.warehouse.findUnique({ where: { id: params.warehouseId } });

    for (const roleCode of ['WAREHOUSE', 'PURCHASING']) {
      await this.notificationsService.notifyRoleByCode(tx, roleCode, {
        type: 'low_stock',
        titleAr: 'تنبيه: مخزون منخفض',
        messageAr: `المنتج "${product?.nameAr ?? params.productId}" في مخزن "${warehouse?.name ?? params.warehouseId}" وصل للحد الأدنى أو أقل (المتاح: ${availableQuantity}, الحد الأدنى: ${setting.minimumStock})`,
        referenceType: 'inventory_balance',
        referenceId: balance.id,
      });
    }
  }

  private withAvailableQuantity<
    T extends { quantityOnHand: Prisma.Decimal; reservedQuantity: Prisma.Decimal },
  >(balance: T) {
    return {
      ...balance,
      // availableQuantity: عمود GENERATED فعليًا في قاعدة البيانات (غير
      // معرَّف في Prisma Schema — راجع الملاحظة أعلى schema.prisma)، لذلك
      // يُحسَب هنا بنفس الصيغة تمامًا بدل استعلام SQL خام إضافي.
      availableQuantity: Number(balance.quantityOnHand) - Number(balance.reservedQuantity),
    };
  }
}
