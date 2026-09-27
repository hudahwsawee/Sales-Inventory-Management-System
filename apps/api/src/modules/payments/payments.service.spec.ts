import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma/prisma.service';

function buildFakeDb() {
  const salesOrders = new Map<string, any>();
  const paymentMethods = new Map<string, any>();
  const payments: any[] = [];
  const customers = new Map<string, any>();

  paymentMethods.set('cash', { id: 'pm-cash', code: 'cash', isActive: true });

  const $executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const [amount, salesOrderId] = values as [number, string];
    const order = salesOrders.get(salesOrderId);
    if (!order) return 0;
    const remaining = Number(order.totalAmount) - Number(order.paidAmount);
    if (remaining < amount) return 0;
    order.paidAmount = Number(order.paidAmount) + amount;
    return 1;
  });

  const tx = {
    $executeRaw,
    payment: {
      create: jest.fn(async ({ data }: any) => {
        const p = { id: `pay-${payments.length + 1}`, ...data };
        payments.push(p);
        return p;
      }),
    },
    customer: {
      update: jest.fn(async ({ where, data }: any) => {
        const c = customers.get(where.id);
        if (data.currentBalance?.decrement !== undefined) c.currentBalance -= data.currentBalance.decrement;
        return c;
      }),
    },
    salesOrder: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => salesOrders.get(where.id)),
    },
  };

  const prisma = {
    salesOrder: { findUnique: jest.fn(async ({ where }: any) => salesOrders.get(where.id) ?? null) },
    paymentMethod: { findUnique: jest.fn(async ({ where }: any) => paymentMethods.get(where.code) ?? null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  } as unknown as PrismaService;

  const service = new PaymentsService(prisma);

  return { service, salesOrders, customers, payments };
}

describe('PaymentsService', () => {
  function seedApprovedOrder(db: ReturnType<typeof buildFakeDb>, total = 1000, paid = 0, paymentType: 'cash' | 'credit' = 'cash') {
    db.customers.set('cust-1', { id: 'cust-1', currentBalance: paymentType === 'credit' ? total : 0 });
    db.salesOrders.set('so-1', {
      id: 'so-1',
      customerId: 'cust-1',
      status: 'approved',
      paymentType,
      totalAmount: total,
      paidAmount: paid,
    });
  }

  it('الدفعة تُقلِّل الرصيد المتبقي على الطلب بشكل صحيح', async () => {
    const db = buildFakeDb();
    seedApprovedOrder(db, 1000, 0);

    const result = await db.service.create(
      { salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 300 },
      'user-1',
    );

    expect(result.remainingBalance).toBe(700);
    expect(db.payments).toHaveLength(1);
  });

  it('مثال المهمة بالضبط: 100,000 ثم دفعتان 30,000 و20,000 → المتبقي 50,000', async () => {
    const db = buildFakeDb();
    seedApprovedOrder(db, 100000, 0);

    await db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 30000 }, 'user-1');
    const result = await db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 20000 }, 'user-1');

    expect(result.remainingBalance).toBe(50000);
  });

  it('يرفض الدفع الزائد عن المتبقي (Overpayment)', async () => {
    const db = buildFakeDb();
    seedApprovedOrder(db, 1000, 800); // المتبقي 200 فقط

    await expect(
      db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 500 }, 'user-1'),
    ).rejects.toMatchObject({ response: { code: 'OVERPAYMENT_NOT_ALLOWED' } });

    expect(db.payments).toHaveLength(0);
  });

  it('يرفض تسجيل دفعة لطلب لم يُعتمَد بعد (لا يزال Draft)', async () => {
    const db = buildFakeDb();
    db.customers.set('cust-1', { id: 'cust-1', currentBalance: 0 });
    db.salesOrders.set('so-1', {
      id: 'so-1',
      customerId: 'cust-1',
      status: 'draft',
      paymentType: 'cash',
      totalAmount: 1000,
      paidAmount: 0,
    });

    await expect(
      db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 100 }, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('البيع الآجل: الدفعة تُخفِّض التزام العميل الائتماني بنفس المبلغ', async () => {
    const db = buildFakeDb();
    seedApprovedOrder(db, 1000, 0, 'credit');

    await db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 400 }, 'user-1');

    expect(db.customers.get('cust-1').currentBalance).toBe(600);
  });

  it('يرفض طريقة دفع غير معروفة', async () => {
    const db = buildFakeDb();
    seedApprovedOrder(db, 1000, 0);

    await expect(
      db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'unknown_method', amount: 100 }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('دفعتان متزامنتان يتجاوز مجموعهما المتبقي: واحدة فقط تنجح (لا Race)', async () => {
    const db = buildFakeDb();
    seedApprovedOrder(db, 100, 0); // المتبقي 100 فقط

    const outcomes = await Promise.allSettled([
      db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 60 }, 'user-1'),
      db.service.create({ salesOrderId: 'so-1', paymentMethodCode: 'cash', amount: 60 }, 'user-1'),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1); // 60+60=120 > 100، فطلب واحد فقط ينجح
    expect(db.salesOrders.get('so-1').paidAmount).toBe(60);
  });
});
