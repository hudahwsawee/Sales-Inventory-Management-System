import { BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PurchaseOrdersService — أهم قاعدة يجب اختبارها هنا: **إنشاء أمر الشراء
 * لا يجب أن يستدعي أي دالة متعلقة بـinventory_balances أو
 * inventory_transactions إطلاقًا** (BR-04 من التصميم المعتمد). نتحقق من
 * هذا مباشرة عبر Spies على PrismaService بدل الاكتفاء بفحص النتيجة فقط.
 */
describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let prisma: jest.Mocked<PrismaService>;

  const activeSupplier = { id: 'sup-1', isActive: true };
  const activeWarehouse = { id: 'wh-1', isActive: true };
  const activeProduct = { id: 'prod-1', isActive: true, nameAr: 'منتج تجريبي' };

  beforeEach(() => {
    prisma = {
      supplier: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      product: { findMany: jest.fn() },
      purchaseOrder: { create: jest.fn(), findUnique: jest.fn() },
      // لا وجود لأي mock لـ inventoryBalance أو inventoryTransaction هنا عمدًا:
      // إن استدعتهما الخدمة، سيفشل الاختبار بخطأ "is not a function"، وهذا
      // بالضبط الدليل العملي المطلوب على عدم مسّ المخزون عند الإنشاء.
    } as unknown as jest.Mocked<PrismaService>;

    service = new PurchaseOrdersService(prisma);
  });

  it('1) إنشاء أمر شراء لا يستدعي أي عملية على المخزون (Ledger أو Balance)', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue(activeSupplier);
    (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(activeWarehouse);
    (prisma.product.findMany as jest.Mock).mockResolvedValue([activeProduct]);
    (prisma.purchaseOrder.create as jest.Mock).mockResolvedValue({
      id: 'po-1',
      poNumber: 'PO-TEST',
      status: 'pending',
      items: [],
    });

    await service.create(
      {
        supplierId: 'sup-1',
        warehouseId: 'wh-1',
        items: [{ productId: 'prod-1', quantityOrdered: 100, unitPrice: 10 }],
      },
      'user-1',
    );

    // التأكيد الإيجابي: أمر الشراء أُنشئ فعليًا
    expect(prisma.purchaseOrder.create).toHaveBeenCalledTimes(1);

    // التأكيد الحاسم: lineTotal محسوب صحيحًا (100 × 10 = 1000) بدون أي أثر على المخزون
    const createCallArg = (prisma.purchaseOrder.create as jest.Mock).mock.calls[0][0];
    expect(createCallArg.data.items.create[0].lineTotal).toBe(1000);
    expect(createCallArg.data.status).toBe('pending');
  });

  it('يرفض إنشاء أمر شراء لمورد غير نشط', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({ ...activeSupplier, isActive: false });

    await expect(
      service.create(
        { supplierId: 'sup-1', warehouseId: 'wh-1', items: [{ productId: 'prod-1', quantityOrdered: 1, unitPrice: 1 }] },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('يرفض إنشاء أمر شراء لمنتج غير نشط', async () => {
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue(activeSupplier);
    (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(activeWarehouse);
    (prisma.product.findMany as jest.Mock).mockResolvedValue([{ ...activeProduct, isActive: false }]);

    await expect(
      service.create(
        { supplierId: 'sup-1', warehouseId: 'wh-1', items: [{ productId: 'prod-1', quantityOrdered: 1, unitPrice: 1 }] },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

/**
 * === Step 6 — Purchase Order Delay Alerts ===
 * إعداد منفصل بحقن notificationsService وهميًا فعليًا.
 */
describe('PurchaseOrdersService — Step 6 (Overdue Detection)', () => {
  function buildService(overduePOs: any[]) {
    const notifications: any[] = [];

    const prisma = {
      purchaseOrder: {
        findMany: jest.fn(async () => overduePOs),
      },
      notification: {
        findFirst: jest.fn(async ({ where }: any) => notifications.find((n) => n.referenceId === where.referenceId && n.isRead === false) ?? null),
      },
      role: { findUnique: jest.fn(async ({ where }: any) => ({ id: `role-${where.code}` })) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    const fakeNotificationsService = {
      notifyRoleByCode: jest.fn(async (_c: any, roleCode: string, params: any) => {
        const n = { id: `notif-${notifications.length + 1}`, roleCode, referenceId: params.referenceId, isRead: false };
        notifications.push(n);
        return n;
      }),
    };

    const service = new PurchaseOrdersService(prisma, fakeNotificationsService as any);
    return { service, prisma, notifications, fakeNotificationsService };
  }

  it('findOverdue يكتشف أمر الشراء المفتوح المتجاوز لتاريخ التوريد المتوقع، ويحسب أيام التأخير', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const { service } = buildService([
      { id: 'po-1', poNumber: 'PO-LATE', status: 'pending', expectedDeliveryDate: fiveDaysAgo, supplier: { name: 'مورد ١' }, warehouse: { name: 'الرئيسي' } },
    ]);

    const result = await service.findOverdue();

    expect(result).toHaveLength(1);
    expect(result[0].poNumber).toBe('PO-LATE');
    expect(result[0].daysLate).toBeGreaterThanOrEqual(4); // احتساب تقريبي، لا نريد اختبارًا هشًا بالساعة بالضبط
  });

  it('checkOverdueAndNotify يُنشئ تنبيه po_delayed لكل أمر شراء متأخر', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const { service, fakeNotificationsService } = buildService([
      { id: 'po-1', poNumber: 'PO-LATE', status: 'partially_received', expectedDeliveryDate: twoDaysAgo, supplier: { name: 'مورد ١' }, warehouse: { name: 'الرئيسي' } },
    ]);

    await service.checkOverdueAndNotify();

    expect(fakeNotificationsService.notifyRoleByCode).toHaveBeenCalledWith(
      expect.anything(),
      'PURCHASING',
      expect.objectContaining({ type: 'po_delayed', referenceId: 'po-1' }),
    );
  });

  it('منع التكرار: لا يُنشئ تنبيهًا ثانيًا لنفس أمر الشراء المتأخر إن كان هناك تنبيه نشط بالفعل', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const { service, fakeNotificationsService, notifications } = buildService([
      { id: 'po-1', poNumber: 'PO-LATE', status: 'pending', expectedDeliveryDate: twoDaysAgo, supplier: { name: 'مورد ١' }, warehouse: { name: 'الرئيسي' } },
    ]);
    notifications.push({ id: 'existing', referenceId: 'po-1', isRead: false });

    await service.checkOverdueAndNotify();

    expect(fakeNotificationsService.notifyRoleByCode).not.toHaveBeenCalled();
  });
});
