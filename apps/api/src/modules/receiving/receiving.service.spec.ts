import { BadRequestException } from '@nestjs/common';
import { ReceivingService } from './receiving.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * محاكاة In-Memory كاملة لكل الجداول التي تلمسها confirmReceipt، بما فيها
 * $queryRaw (نتجاهل قفل الصفوف فعليًا هنا لأنه بلا معنى خارج PostgreSQL
 * حقيقي — التوثيق الصريح لهذا القيد موجود في تقرير التحقق النهائي).
 */
function buildFakeDb() {
  const purchaseOrders = new Map<string, any>();
  const purchaseOrderItems = new Map<string, any>();
  const products = new Map<string, any>();
  const inventoryBalances = new Map<string, { quantityOnHand: number }>();
  const inventoryTransactions: any[] = [];
  const receipts = new Map<string, any>();
  const receiptItems: any[] = [];
  let idCounter = 0;

  const balanceKey = (p: string) => p; // مخزن واحد فقط في هذا الاختبار، التبسيط آمن

  const tx = {
    $queryRaw: jest.fn(async () => []), // محاكاة FOR UPDATE — بلا قفل فعلي خارج DB حقيقية
    purchaseOrder: {
      findUnique: jest.fn(async ({ where }: any) => purchaseOrders.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const po = purchaseOrders.get(where.id);
        Object.assign(po, data);
        return po;
      }),
    },
    purchaseOrderItem: {
      findUnique: jest.fn(async ({ where }: any) => purchaseOrderItems.get(where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        Array.from(purchaseOrderItems.values()).filter((i) => i.purchaseOrderId === where.purchaseOrderId),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const item = purchaseOrderItems.get(where.id);
        if (data.quantityReceived?.increment !== undefined) {
          item.quantityReceived += data.quantityReceived.increment;
        }
        return item;
      }),
    },
    product: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const p = products.get(where.id);
        if (!p) throw new Error('NotFound');
        return p;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const p = products.get(where.id);
        Object.assign(p, data);
        return p;
      }),
    },
inventoryBalance: {
  aggregate: jest.fn(async ({ where }: any) => ({
    _sum: { quantityOnHand: inventoryBalances.get(balanceKey(where.productId))?.quantityOnHand ?? null },
  })),
},
inventoryTransaction: {
  create: jest.fn(),
},
    purchaseReceipt: {
      create: jest.fn(async ({ data }: any) => {
        const receipt = { id: `receipt-${++idCounter}`, ...data };
        receipts.set(receipt.id, receipt);
        return receipt;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(receipts.get(where.id), data);
        return receipts.get(where.id);
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({
        ...receipts.get(where.id),
        items: receiptItems.filter((i) => i.purchaseReceiptId === where.id),
      })),
    },
    purchaseReceiptItem: {
      create: jest.fn(async ({ data }: any) => {
        receiptItems.push(data);
        return data;
      }),
    },
  };

  // InventoryService الحقيقي يُستخدَم كما هو (وليس Mock) — لضمان اختبار
  // التكامل الفعلي بين ReceivingService وInventoryService.applyInventoryChange
  const realInventoryService = new InventoryService({} as PrismaService);
  // نُبدِّل فقط الدوال التي تلمس Prisma داخل applyInventoryChange عبر tx نفسه:
  (tx as any).inventoryBalance.upsert = jest.fn(async ({ where, create, update }: any) => {
    const k = balanceKey(where.productId_warehouseId.productId);
    const existing = inventoryBalances.get(k);
    if (!existing) inventoryBalances.set(k, { quantityOnHand: create.quantityOnHand });
    else if (update.quantityOnHand?.increment !== undefined) existing.quantityOnHand += update.quantityOnHand.increment;
  });
  (tx as any).inventoryTransaction.create = jest.fn(async ({ data }: any) => {
    const record = { id: `txn-${++idCounter}`, ...data };
    inventoryTransactions.push(record);
    return record;
  });

  const prisma = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  } as unknown as PrismaService;

  const service = new ReceivingService(prisma, realInventoryService);

  return { service, purchaseOrders, purchaseOrderItems, products, inventoryBalances, inventoryTransactions };
}

describe('ReceivingService', () => {
  function seedPoWithOneItem(db: ReturnType<typeof buildFakeDb>, ordered = 100, unitPrice = 10) {
    db.purchaseOrders.set('po-1', {
      id: 'po-1',
      poNumber: 'PO-TEST',
      warehouseId: 'w1',
      status: 'pending',
    });
    db.purchaseOrderItems.set('item-1', {
      id: 'item-1',
      purchaseOrderId: 'po-1',
      productId: 'p1',
      quantityOrdered: ordered,
      quantityReceived: 0,
      unitPrice,
    });
    db.products.set('p1', { id: 'p1', averageCost: 0 });
  }

  it('2) الاستلام الكامل يزيد الرصيد بالكامل ويكمل حالة أمر الشراء', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);

    await db.service.confirmReceipt(
      { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 100, unitCost: 10 }] },
      'user-1',
    );

    expect(db.inventoryBalances.get('p1')?.quantityOnHand).toBe(100);
    expect(db.purchaseOrders.get('po-1').status).toBe('completed');
    expect(db.inventoryTransactions).toHaveLength(1);
    expect(db.inventoryTransactions[0].quantity).toBe(100);
    expect(db.inventoryTransactions[0].transactionType).toBe('purchase_receipt');
  });

  it('3+4) الاستلام الجزئي مرتين يكمل أمر الشراء تدريجيًا (70 ثم 30)', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);

    const r1 = await db.service.confirmReceipt(
      { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 70, unitCost: 10 }] },
      'user-1',
    );
    expect(db.purchaseOrders.get('po-1').status).toBe('partially_received');
    expect(db.inventoryBalances.get('p1')?.quantityOnHand).toBe(70);
    expect((r1 as any).isPartial).toBe(true);

    await db.service.confirmReceipt(
      { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 30, unitCost: 10 }] },
      'user-1',
    );
    expect(db.purchaseOrders.get('po-1').status).toBe('completed');
    expect(db.inventoryBalances.get('p1')?.quantityOnHand).toBe(100);
  });

  it('5) لا يمكن استلام كمية أكبر من المتبقي', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);

    await expect(
      db.service.confirmReceipt(
        { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 150, unitCost: 10 }] },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'QUANTITY_EXCEEDS_REMAINING' } });

    // لا أثر جزئي على المخزون عند الفشل
    expect(db.inventoryBalances.get('p1')).toBeUndefined();
  });

  it('6) حساب المتوسط المرجّح صحيح عبر استلامين بتكلفتين مختلفتين', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);

    // استلام أول: 60 وحدة بتكلفة 10 → متوسط = 10
    await db.service.confirmReceipt(
      { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 60, unitCost: 10 }] },
      'user-1',
    );
    expect(Number(db.products.get('p1').averageCost)).toBeCloseTo(10, 4);

    // استلام ثانٍ: 40 وحدة بتكلفة 20 → المتوسط الجديد = (60×10 + 40×20)/100 = 14
    await db.service.confirmReceipt(
      { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 40, unitCost: 20 }] },
      'user-1',
    );
    expect(Number(db.products.get('p1').averageCost)).toBeCloseTo(14, 4);
  });

  it('7) كل عملية استلام تُنشئ حركة مخزون واحدة بالضبط لكل بند', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);

    await db.service.confirmReceipt(
      { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 50, unitCost: 10 }] },
      'user-1',
    );

    expect(db.inventoryTransactions).toHaveLength(1);
    expect(db.inventoryTransactions[0].referenceType).toBe('purchase_receipt');
  });

  it('يرفض الاستلام إذا كان البند لا ينتمي لأمر الشراء المحدَّد', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);
    db.purchaseOrderItems.set('item-other', {
      id: 'item-other',
      purchaseOrderId: 'po-OTHER',
      productId: 'p1',
      quantityOrdered: 10,
      quantityReceived: 0,
      unitPrice: 10,
    });

    await expect(
      db.service.confirmReceipt(
        { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-other', quantityReceived: 5 }] },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'ITEM_NOT_IN_PURCHASE_ORDER' } });
  });

  it('يرفض الاستلام لأمر شراء ملغى', async () => {
    const db = buildFakeDb();
    seedPoWithOneItem(db, 100, 10);
    db.purchaseOrders.get('po-1').status = 'cancelled';

    await expect(
      db.service.confirmReceipt(
        { purchaseOrderId: 'po-1', items: [{ purchaseOrderItemId: 'item-1', quantityReceived: 10 }] },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'PURCHASE_ORDER_CLOSED' } });
  });
});
