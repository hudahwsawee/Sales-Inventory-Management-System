import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * محاكاة In-Memory شاملة، تستخدم InventoryService **الحقيقي** (بدون
 * notificationsService — يماثل بالضبط `new InventoryService({} as
 * PrismaService)` المستخدَم في اختبارات Step 3/4 الحالية، فيتخطى
 * notifyIfLowStock بصمت) لضمان اختبار التكامل الفعلي، بنفس منهجية
 * receiving.service.spec.ts وsales-orders.service.spec.ts المعتمدة سابقًا.
 */
function buildFakeDb() {
  const returns = new Map<string, any>();
  const returnItems: any[] = [];
  const salesOrders = new Map<string, any>();
  const salesOrderItems: any[] = [];
  const purchaseOrders = new Map<string, any>();
  const purchaseReceiptItems: any[] = [];
  const balances = new Map<string, { quantityOnHand: number; reservedQuantity: number }>();
  const inventoryTransactions: any[] = [];
  let idCounter = 0;

  const balKey = (p: string, w: string) => `${p}::${w}`;

  function sharedFns() {
    return {
      return: {
        findUnique: jest.fn(async ({ where }: any) => {
          const r = returns.get(where.id);
          if (!r) return null;
          return { ...r, items: returnItems.filter((i) => i.returnId === where.id) };
        }),
        findUniqueOrThrow: jest.fn(async ({ where }: any) => {
          const r = returns.get(where.id);
          if (!r) throw new Error('NotFound');
          return { ...r, items: returnItems.filter((i) => i.returnId === where.id) };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          Object.assign(returns.get(where.id), data);
          return returns.get(where.id);
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const r = returns.get(where.id);
          if (!r || r.status !== where.status) return { count: 0 };
          Object.assign(r, data);
          return { count: 1 };
        }),
        create: jest.fn(async ({ data }: any) => {
          const { items, ...header } = data;
          const id = `ret-${++idCounter}`;
          const r = { id, ...header };
          returns.set(id, r);
          for (const item of items.create) {
            returnItems.push({ id: `reti-${returnItems.length + 1}`, returnId: id, ...item });
          }
          return { ...r, items: returnItems.filter((i) => i.returnId === id) };
        }),
      },
      returnItem: {
        aggregate: jest.fn(async ({ where }: any) => {
          const matches = returnItems.filter((i) => {
            if (i.productId !== where.productId) return false;
            const parentReturn = returns.get(i.returnId);
            if (!parentReturn) return false;
            if (where.return.status && parentReturn.status !== where.return.status) return false;
            if (where.return.returnType && parentReturn.returnType !== where.return.returnType) return false;
            if (where.return.referenceSalesOrderId && parentReturn.referenceSalesOrderId !== where.return.referenceSalesOrderId) return false;
            if (where.return.referencePurchaseOrderId && parentReturn.referencePurchaseOrderId !== where.return.referencePurchaseOrderId) return false;
            if (where.return.id?.not && parentReturn.id === where.return.id.not) return false;
            return true;
          });
          const sum = matches.reduce((s, i) => s + Number(i.quantity), 0);
          return { _sum: { quantity: matches.length > 0 ? sum : null } };
        }),
      },
      salesOrderItem: {
        aggregate: jest.fn(async ({ where }: any) => {
          const matches = salesOrderItems.filter((i) => i.salesOrderId === where.salesOrderId && i.productId === where.productId);
          const sum = matches.reduce((s, i) => s + Number(i.quantity), 0);
          return { _sum: { quantity: matches.length > 0 ? sum : null } };
        }),
      },
      purchaseReceiptItem: {
        aggregate: jest.fn(async ({ where }: any) => {
          const matches = purchaseReceiptItems.filter(
            (i) => i.productId === where.productId && i.purchaseOrderId === where.purchaseReceipt.purchaseOrderId,
          );
          const sum = matches.reduce((s, i) => s + Number(i.quantityReceived), 0);
          return { _sum: { quantityReceived: matches.length > 0 ? sum : null } };
        }),
      },
            inventoryBalance: {
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const k = balKey(
            where.productId_warehouseId.productId,
            where.productId_warehouseId.warehouseId,
          );
          const existing = balances.get(k);

          if (!existing) {
            balances.set(k, {
              quantityOnHand: create.quantityOnHand,
              reservedQuantity: 0,
            });
          } else if (update.quantityOnHand?.increment !== undefined) {
            existing.quantityOnHand += update.quantityOnHand.increment;
          }
        }),

        updateMany: jest.fn(async ({ where, data }: any) => {
          const k = balKey(where.productId, where.warehouseId);
          const existing = balances.get(k);
          const current = existing?.quantityOnHand ?? 0;

          if (current < where.quantityOnHand.gte) {
            return { count: 0 };
          }

          if (existing && data.quantityOnHand?.decrement !== undefined) {
            existing.quantityOnHand -= data.quantityOnHand.decrement;
          }

          return { count: 1 };
        }),
      },

      inventoryTransaction: {
        create: jest.fn(async ({ data }: any) => {
          const t = {
            id: `txn-${inventoryTransactions.length + 1}`,
            ...data,
          };
          inventoryTransactions.push(t);
          return t;
        }),
      },

      approval: {
        create: jest.fn(async ({ data }: any) => ({
          id: `approval-${++idCounter}`,
          ...data,
        })),
      },
    };
    };

  const tx = sharedFns();
  const prisma = {
    ...sharedFns(),
    warehouse: { findUnique: jest.fn(async () => ({ id: 'w1', isActive: true })) },
    customer: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    supplier: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    product: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, isActive: true, nameAr: id }))) },
    salesOrder: {
      findUnique: jest.fn(async ({ where }: any) => salesOrders.get(where.id) ?? null),
    },
    purchaseOrder: {
      findUnique: jest.fn(async ({ where }: any) => purchaseOrders.get(where.id) ?? null),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  } as unknown as PrismaService;

  const realInventoryService = new InventoryService({} as PrismaService); // بلا NotificationsService — يطابق نمط اختبارات Step 3/4
  const fakeNotifications = { notifyRoleByCode: jest.fn(async () => null), create: jest.fn(async () => null) } as unknown as NotificationsService;
  const service = new ReturnsService(prisma, realInventoryService, fakeNotifications);

  return { service, returns, returnItems, salesOrders, salesOrderItems, purchaseOrders, purchaseReceiptItems, balances, inventoryTransactions };
}

describe('ReturnsService', () => {
  function seedDeliveredSalesOrder(db: ReturnType<typeof buildFakeDb>, originalQty = 10) {
    db.salesOrders.set('so-1', { id: 'so-1', customerId: 'cust-1', status: 'delivered' });
    db.salesOrderItems.push({ salesOrderId: 'so-1', productId: 'p1', quantity: originalQty });
  }

  function seedPurchaseOrderWithReceipt(db: ReturnType<typeof buildFakeDb>, receivedQty = 20) {
    db.purchaseOrders.set('po-1', { id: 'po-1', supplierId: 'sup-1' });
    db.purchaseReceiptItems.push({ purchaseOrderId: 'po-1', productId: 'p1', quantityReceived: receivedQty });
  }

  it('1) مرتجع عميل صحيح: الإنشاء → التقديم → القبول (محاكى) → الإتمام يزيد المخزون فعليًا', async () => {
    const db = buildFakeDb();
    seedDeliveredSalesOrder(db, 10);
    db.balances.set('p1::w1', { quantityOnHand: 0, reservedQuantity: 0 });

    const created = await db.service.create(
      {
        returnType: 'customer_return',
        customerId: 'cust-1',
        referenceSalesOrderId: 'so-1',
        warehouseId: 'w1',
        items: [{ productId: 'p1', quantity: 3, unitPrice: 50 }],
      } as any,
      'user-1',
    );
    expect(created.id).toBeDefined();

    await db.service.submit(created.id, 'user-1');
    expect(db.returns.get(created.id).status).toBe('pending_approval');

    // محاكاة قرار "موافقة" (بدل استدعاء ApprovalsService الحقيقي، الذي له اختباره الخاص)
    db.returns.get(created.id).status = 'approved';

    await db.service.complete(created.id, 'user-1');

    expect(db.returns.get(created.id).status).toBe('completed');
    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(3); // زاد فعليًا
    expect(db.inventoryTransactions).toHaveLength(1);
    expect(db.inventoryTransactions[0].quantity).toBe(3);
    expect(db.inventoryTransactions[0].transactionType).toBe('customer_return');
  });

  it('2) مرتجع يتجاوز الكمية المؤهَّلة (المُسلَّمة أصلًا) يُرفض عند الإنشاء', async () => {
    const db = buildFakeDb();
    seedDeliveredSalesOrder(db, 10);

    await expect(
      db.service.create(
        {
          returnType: 'customer_return',
          customerId: 'cust-1',
          referenceSalesOrderId: 'so-1',
          warehouseId: 'w1',
          items: [{ productId: 'p1', quantity: 15, unitPrice: 50 }], // أكبر من الأصل (10)
        } as any,
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE' } });
  });

  it('3) لا يمكن إتمام نفس المرتجع مرتين (Idempotency) — الأثر على المخزون لا يتكرر', async () => {
    const db = buildFakeDb();
    seedDeliveredSalesOrder(db, 10);
    db.balances.set('p1::w1', { quantityOnHand: 0, reservedQuantity: 0 });

    const created = await db.service.create(
      {
        returnType: 'customer_return',
        customerId: 'cust-1',
        referenceSalesOrderId: 'so-1',
        warehouseId: 'w1',
        items: [{ productId: 'p1', quantity: 3, unitPrice: 50 }],
      } as any,
      'user-1',
    );
    db.returns.get(created.id).status = 'approved'; // تخطي submit/decide لتبسيط الاختبار

    await db.service.complete(created.id, 'user-1'); // الإتمام الأول ينجح
    await expect(db.service.complete(created.id, 'user-1')).rejects.toThrow(ConflictException); // الثاني يُرفض

    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(3); // لم يتضاعف
    expect(db.inventoryTransactions).toHaveLength(1); // حركة واحدة فقط
  });

  it('4) مرتجع مورد صحيح ينقص المخزون فعليًا عند الإتمام', async () => {
    const db = buildFakeDb();
    seedPurchaseOrderWithReceipt(db, 20);
    db.balances.set('p1::w1', { quantityOnHand: 20, reservedQuantity: 0 });

    const created = await db.service.create(
      {
        returnType: 'supplier_return',
        supplierId: 'sup-1',
        referencePurchaseOrderId: 'po-1',
        warehouseId: 'w1',
        items: [{ productId: 'p1', quantity: 5, unitPrice: 40 }],
      } as any,
      'user-1',
    );
    db.returns.get(created.id).status = 'approved';

    await db.service.complete(created.id, 'user-1');

    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(15);
    expect(db.inventoryTransactions[0].transactionType).toBe('supplier_return');
    expect(db.inventoryTransactions[0].quantity).toBe(-5);
  });

  it('4ب) مرتجع مورد لا يمكن أن يجعل الرصيد سالبًا (يتحقق عبر applyInventoryChange نفسها)', async () => {
    const db = buildFakeDb();
    seedPurchaseOrderWithReceipt(db, 20);
    db.balances.set('p1::w1', { quantityOnHand: 2, reservedQuantity: 0 }); // رصيد فعلي أقل من المُراد إرجاعه

    const created = await db.service.create(
      {
        returnType: 'supplier_return',
        supplierId: 'sup-1',
        referencePurchaseOrderId: 'po-1',
        warehouseId: 'w1',
        items: [{ productId: 'p1', quantity: 5, unitPrice: 40 }], // مؤهَّل (5 <= 20) لكن لا يوجد رصيد فعلي كافٍ
      } as any,
      'user-1',
    );
    db.returns.get(created.id).status = 'approved';

    await expect(db.service.complete(created.id, 'user-1')).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_STOCK' },
    });
  });

  it('لا يمكن إتمام مرتجع لم يُعتمَد بعد (لا يزال draft)', async () => {
    const db = buildFakeDb();
    seedDeliveredSalesOrder(db, 10);

    const created = await db.service.create(
      {
        returnType: 'customer_return',
        customerId: 'cust-1',
        referenceSalesOrderId: 'so-1',
        warehouseId: 'w1',
        items: [{ productId: 'p1', quantity: 3, unitPrice: 50 }],
      } as any,
      'user-1',
    );

    await expect(db.service.complete(created.id, 'user-1')).rejects.toThrow(ConflictException);
  });

  it('لا يمكن إنشاء مرتجع عميل لطلب لم يُسلَّم بعد', async () => {
    const db = buildFakeDb();
    db.salesOrders.set('so-1', { id: 'so-1', customerId: 'cust-1', status: 'approved' }); // ليس delivered
    db.salesOrderItems.push({ salesOrderId: 'so-1', productId: 'p1', quantity: 10 });

    await expect(
      db.service.create(
        {
          returnType: 'customer_return',
          customerId: 'cust-1',
          referenceSalesOrderId: 'so-1',
          warehouseId: 'w1',
          items: [{ productId: 'p1', quantity: 3, unitPrice: 50 }],
        } as any,
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
