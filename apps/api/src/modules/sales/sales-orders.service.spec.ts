import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SalesOrdersService } from './sales-orders.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ظ…ط­ط§ظƒط§ط© In-Memory ظƒط§ظ…ظ„ط© ظ„ط¯ظˆط±ط© ط­ظٹط§ط© ط£ظ…ط± ط§ظ„ط¨ظٹط¹طŒ طھط³طھط®ط¯ظ… InventoryService
 * **ط§ظ„ط­ظ‚ظٹظ‚ظٹ** (ظˆظ„ظٹط³ Mock) ظ„ط¶ظ…ط§ظ† ط§ط®طھط¨ط§ط± ط§ظ„طھظƒط§ظ…ظ„ ط§ظ„ظپط¹ظ„ظٹ ط¨ظٹظ† ط§ظ„ط®ط¯ظ…طھظٹظ† â€”
 * ط¨ظ†ظپط³ ظ…ظ†ظ‡ط¬ظٹط© receiving.service.spec.ts ط§ظ„ظ…ط¹طھظ…ط¯ط© ط³ط§ط¨ظ‚ظ‹ط§ ظپظٹ ط§ظ„ظ…ط´ط±ظˆط¹.
 */
function buildFakeDb() {
  const salesOrders = new Map<string, any>();
  const salesOrderItems = new Map<string, any>();
  const customers = new Map<string, any>();
  const balances = new Map<string, { quantityOnHand: number; reservedQuantity: number }>();
  const reservations = new Map<string, any>();
  const transactions: any[] = [];

  const balKey = (p: string, w: string) => `${p}::${w}`;

  const $executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: number[]) => {
    const sql = strings.join('|');
    if (sql.includes('reserved_quantity = reserved_quantity +')) {
      const [quantity, productId, warehouseId] = values as unknown as [number, string, string, number];
      const b = balances.get(balKey(productId, warehouseId));
      const available = b ? b.quantityOnHand - b.reservedQuantity : 0;
      if (!b || available < quantity) return 0;
      b.reservedQuantity += quantity;
      return 1;
    }
    if (sql.includes('quantity_on_hand = quantity_on_hand -')) {
      const [qty, _reservedQty, productId, warehouseId] = values as unknown as [number, number, string, string, number, number];
      const b = balances.get(balKey(productId, warehouseId));
      if (!b || b.quantityOnHand < qty || b.reservedQuantity < qty) return 0;
      b.quantityOnHand -= qty;
      b.reservedQuantity -= qty;
      return 1;
    }
    if (sql.includes('reserved_quantity = reserved_quantity -')) {
      const [quantity, productId, warehouseId] = values as unknown as [number, string, string];
      const b = balances.get(balKey(productId, warehouseId));
      if (b) b.reservedQuantity -= quantity;
      return 1;
    }
    return 0;
  });

  const tx = {
    $executeRaw,
    salesOrder: {
      findUnique: jest.fn(async ({ where }: any) => {
        const order = salesOrders.get(where.id);
        if (!order) return null;
        return { ...order, items: Array.from(salesOrderItems.values()).filter((i) => i.salesOrderId === where.id) };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const order = salesOrders.get(where.id);
        if (!order) throw new Error('NotFound');
        return { ...order, items: Array.from(salesOrderItems.values()).filter((i) => i.salesOrderId === where.id) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(salesOrders.get(where.id), data);
        return salesOrders.get(where.id);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const order = salesOrders.get(where.id);
        if (!order || order.status !== where.status) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      }),
    },
    customer: {
      update: jest.fn(async ({ where, data }: any) => {
        const c = customers.get(where.id);
        if (data.currentBalance?.increment !== undefined) c.currentBalance += data.currentBalance.increment;
        if (data.currentBalance?.decrement !== undefined) c.currentBalance -= data.currentBalance.decrement;
        return c;
      }),
    },
    inventoryReservation: {
      create: jest.fn(async ({ data }: any) => {
        const r = { id: `res-${reservations.size + 1}`, resolvedAt: null, ...data };
        reservations.set(data.salesOrderItemId, r);
        return r;
      }),
      findUnique: jest.fn(async ({ where }: any) => reservations.get(where.salesOrderItemId) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const r = Array.from(reservations.values()).find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      }),
    },
    inventoryTransaction: {
      create: jest.fn(async ({ data }: any) => {
        const t = { id: `txn-${transactions.length + 1}`, ...data };
        transactions.push(t);
        return t;
      }),
    },
  };

  const realInventoryService = new InventoryService({} as PrismaService);
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as unknown as PrismaService;
  const service = new SalesOrdersService(prisma, realInventoryService);

  return { service, salesOrders, salesOrderItems, customers, balances, reservations, transactions };
}

describe('SalesOrdersService', () => {
  function seedOrderWithOneItem(db: ReturnType<typeof buildFakeDb>, quantity = 10, paymentType: 'cash' | 'credit' = 'cash') {
    db.customers.set('cust-1', { id: 'cust-1', currentBalance: 0 });
    db.salesOrders.set('so-1', {
      id: 'so-1',
      customerId: 'cust-1',
      warehouseId: 'w1',
      status: 'draft',
      paymentType,
      totalAmount: 1000,
      paidAmount: 0,
    });
    db.salesOrderItems.set('item-1', {
      id: 'item-1',
      salesOrderId: 'so-1',
      productId: 'p1',
      quantity,
      unitPrice: 100,
    });
  }

  it('طھط£ظƒظٹط¯ ط§ظ„ط·ظ„ط¨ (confirm) ظٹط­ط¬ط² ط§ظ„ظƒظ…ظٹط© ظپط¹ظ„ظٹظ‹ط§ (Reservation)', async () => {
    const db = buildFakeDb();
    seedOrderWithOneItem(db, 10);
    db.balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });

    await db.service.confirm('so-1', 'user-1');

    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(10);
    expect(db.salesOrders.get('so-1').status).toBe('approved');
  });

  it('ظ„ط§ ظٹظ…ظƒظ† ط¨ظٹط¹/ط­ط¬ط² ظƒظ…ظٹط© ط£ظƒط¨ط± ظ…ظ† ط§ظ„ظ…طھط§ط­ â€” ط§ظ„طھط£ظƒظٹط¯ ظٹظڈط±ظپط¶ ط¨ط§ظ„ظƒط§ظ…ظ„', async () => {
    const db = buildFakeDb();
    seedOrderWithOneItem(db, 50);
    db.balances.set('p1::w1', { quantityOnHand: 10, reservedQuantity: 0 });

    await expect(db.service.confirm('so-1', 'user-1')).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_AVAILABLE_STOCK' },
    });

    expect(db.salesOrders.get('so-1').status).toBe('draft'); // ظ„ظ… ظٹطھط؛ظٹظ‘ط± â€” Rollback ظƒط§ظ…ظ„
    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(0); // ظ„ط§ ط­ط¬ط² ط¬ط²ط¦ظٹ
  });

  it('ط§ظ„ط¨ظٹط¹ ط§ظ„ط¢ط¬ظ„ ظٹط²ظٹط¯ ط§ظ„طھط²ط§ظ… ط§ظ„ط¹ظ…ظٹظ„ ط§ظ„ط§ط¦طھظ…ط§ظ†ظٹ ط¹ظ†ط¯ ط§ظ„طھط£ظƒظٹط¯', async () => {
    const db = buildFakeDb();
    seedOrderWithOneItem(db, 10, 'credit');
    db.balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });

    await db.service.confirm('so-1', 'user-1');

    expect(db.customers.get('cust-1').currentBalance).toBe(1000);
  });

  it('ط¥ظ„ط؛ط§ط، ط§ظ„ط·ظ„ط¨ ط§ظ„ظ…ط¹طھظ…ط¯ ظٹط­ط±ط± ط§ظ„ط­ط¬ط² (Cancellation releases reservation)', async () => {
    const db = buildFakeDb();
    seedOrderWithOneItem(db, 10);
    db.balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
    await db.service.confirm('so-1', 'user-1');

    await db.service.cancel('so-1', {});

    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(0);
    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(100); // ظ„ظ… ظٹظڈط®طµظژظ… ظپط¹ظ„ظٹظ‹ط§ ط£ط¨ط¯ظ‹ط§
    expect(db.salesOrders.get('so-1').status).toBe('cancelled');
  });

  it('ط§ظ„طھط³ظ„ظٹظ… (fulfill) ظٹط®طµظ… ط§ظ„ظ…ط®ط²ظˆظ† ط§ظ„ظپط¹ظ„ظٹ ظ…ط±ط© ظˆط§ط­ط¯ط© ط¨ط§ظ„ط¶ط¨ط·طŒ ظˆظٹظڈظ†ط´ط¦ ط­ط±ظƒط© sale', async () => {
    const db = buildFakeDb();
    seedOrderWithOneItem(db, 10);
    db.balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
    await db.service.confirm('so-1', 'user-1');

    await db.service.fulfill('so-1', 'user-1');

    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(90);
    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(0);
    expect(db.salesOrders.get('so-1').status).toBe('delivered');
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0].quantity).toBe(-10);
  });

  it('ط§ظ„طھط³ظ„ظٹظ… ط§ظ„ظ…ط²ط¯ظˆط¬/ط§ظ„ظ…طھط²ط§ظ…ظ† ظ…ط­ظ…ظٹ â€” ط§ظ„ظ…ط­ط§ظˆظ„ط© ط§ظ„ط«ط§ظ†ظٹط© طھظڈط±ظپط¶ ظˆظ„ط§ طھظڈظƒط±ظگظ‘ط± ط®طµظ… ط§ظ„ظ…ط®ط²ظˆظ†', async () => {
    const db = buildFakeDb();
    seedOrderWithOneItem(db, 10);
    db.balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
    await db.service.confirm('so-1', 'user-1');

    await db.service.fulfill('so-1', 'user-1'); // ط§ظ„ط£ظˆظ„ ظٹظ†ط¬ط­
    await expect(db.service.fulfill('so-1', 'user-1')).rejects.toThrow(ConflictException); // ط§ظ„ط«ط§ظ†ظٹ ظٹظڈط±ظپط¶

    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(90); // ظ„ظ… ظٹظڈط®طµظژظ… ظ…ط±طھظٹظ†
    expect(db.transactions).toHaveLength(1); // ط­ط±ظƒط© ظˆط§ط­ط¯ط© ظپظ‚ط·
  });
});

/**
 * === Step 6 â€” طھظ†ط¨ظٹظ‡ طھط¬ط§ظˆط² ط§ظ„ط­ط¯ ط§ظ„ط§ط¦طھظ…ط§ظ†ظٹ (Customer Credit Limit Alert) ===
 * ط¥ط¹ط¯ط§ط¯ ظ…ظ†ظپطµظ„ ظٹظڈط­ظ‚ظ† notificationsService ظˆظ‡ظ…ظٹظ‹ط§ ظپط¹ظ„ظٹظ‹ط§ (ط¨ط¹ظƒط³ ظƒظ„ ط§ظ„ط§ط®طھط¨ط§ط±ط§طھ
 * ط£ط¹ظ„ط§ظ‡ ط§ظ„طھظٹ طھط¹طھظ…ط¯ ط¹ظ…ط¯ظ‹ط§ ط¹ظ„ظ‰ طھط±ظƒظ‡ undefined). ظٹط³طھط®ط¯ظ… Prisma.Decimal
 * ط§ظ„ط­ظ‚ظٹظ‚ظٹ (ظˆظ„ظٹط³ ط£ط±ظ‚ط§ظ… JavaScript ط¹ط§ط¯ظٹط©) ظ„ظ„ظ…ظ‚ط§ط±ظ†ط© ط§ظ„ظ…ط§ظ„ظٹط©طŒ طھظ…ط§ظ…ظ‹ط§ ظƒظ…ط§
 * ظٹظپط¹ظ„ ط§ظ„ظƒظˆط¯ ط§ظ„ظپط¹ظ„ظٹ â€” ظ„ط§ floating point ظ„ظ„ط£ظ…ظˆط§ظ„.
 */

function buildFakeDbWithNotifications() {
  const salesOrders = new Map<string, any>();
  const salesOrderItems = new Map<string, any>();
  const customers = new Map<string, any>();
  const balances = new Map<string, { quantityOnHand: number; reservedQuantity: number }>();
  const notifications: any[] = [];

  const $executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: number[]) => {
    const sql = strings.join('|');
    if (sql.includes('reserved_quantity = reserved_quantity +')) {
      const [quantity, productId, warehouseId] = values as unknown as [number, string, string, number];
      const b = balances.get(`${productId}::${warehouseId}`);
      const available = b ? b.quantityOnHand - b.reservedQuantity : 0;
      if (!b || available < quantity) return 0;
      b.reservedQuantity += quantity;
      return 1;
    }
    return 0;
  });

  const tx = {
    $executeRaw,
    salesOrder: {
      findUnique: jest.fn(async ({ where }: any) => {
        const order = salesOrders.get(where.id);
        if (!order) return null;
        return { ...order, items: Array.from(salesOrderItems.values()).filter((i) => i.salesOrderId === where.id) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(salesOrders.get(where.id), data);
        return salesOrders.get(where.id);
      }),
    },
    customer: {
      update: jest.fn(async ({ where, data }: any) => {
        const c = customers.get(where.id);
        if (data.currentBalance?.increment !== undefined) {
          c.currentBalance = c.currentBalance.add(data.currentBalance.increment);
        }
        return c;
      }),
    },
    inventoryReservation: {
      create: jest.fn(async ({ data }: any) => ({ id: 'res-1', ...data })),
    },
    notification: {
      findFirst: jest.fn(async ({ where }: any) => notifications.find((n) => n.referenceId === where.referenceId && n.isRead === false) ?? null),
    },
    role: { findUnique: jest.fn(async ({ where }: any) => ({ id: `role-${where.code}` })) },
  };

  const fakeNotificationsService = {
    notifyRoleByCode: jest.fn(async (_c: any, roleCode: string, params: any) => {
      const n = { id: `notif-${notifications.length + 1}`, roleCode, referenceId: params.referenceId, isRead: false };
      notifications.push(n);
      return n;
    }),
  };

  const realInventoryService = new InventoryService({} as PrismaService);
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as unknown as PrismaService;
  const service = new SalesOrdersService(prisma, realInventoryService, fakeNotificationsService as any);

  return { service, salesOrders, salesOrderItems, customers, balances, notifications, fakeNotificationsService };
}

describe('SalesOrdersService â€” Step 6 (Customer Credit Limit Alert)', () => {
  function seedCreditOrder(db: ReturnType<typeof buildFakeDbWithNotifications>, currentBalance: number, creditLimit: number, totalAmount: number) {
    db.customers.set('cust-1', {
      id: 'cust-1',
      name: 'ط¹ظ…ظٹظ„ طھط¬ط±ظٹط¨ظٹ',
      currentBalance: new Prisma.Decimal(currentBalance),
      creditLimit: new Prisma.Decimal(creditLimit),
    });
    db.salesOrders.set('so-1', { id: 'so-1', customerId: 'cust-1', warehouseId: 'w1', status: 'draft', paymentType: 'credit', totalAmount, paidAmount: 0 });
    db.salesOrderItems.set('item-1', { id: 'item-1', salesOrderId: 'so-1', productId: 'p1', quantity: 1 });
    db.balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
  }

  it('ظٹظڈظ†ط´ط¦ طھظ†ط¨ظٹظ‡ظ‹ط§ ط¹ظ†ط¯ ظˆطµظˆظ„ ط±طµظٹط¯ ط§ظ„ط¹ظ…ظٹظ„ ط¥ظ„ظ‰ ط§ظ„ط­ط¯ ط§ظ„ط§ط¦طھظ…ط§ظ†ظٹ ط£ظˆ طھط¬ط§ظˆط²ظ‡ ط¨ط¹ط¯ ط§ظ„طھط£ظƒظٹط¯', async () => {
    const db = buildFakeDbWithNotifications();
    seedCreditOrder(db, 8000, 10000, 3000); // 8000 + 3000 = 11000 >= 10000

    await db.service.confirm('so-1', 'user-1');

    expect(db.fakeNotificationsService.notifyRoleByCode).toHaveBeenCalledWith(
      expect.anything(),
      'SALES',
      expect.objectContaining({ type: 'credit_limit_exceeded' }),
    );
    // ط§ظ„طھط£ظƒظٹط¯ ط§ظ„ط­ط§ط³ظ…: ط§ظ„ط¹ظ…ظ„ظٹط© ظ„ظ… طھظڈظ…ظ†ظژط¹ (ظ„ط§ Business Rule ط­ط§ظ„ظٹط© طھظپط±ط¶ ط°ظ„ظƒ) â€” ط§ظ„ط·ظ„ط¨ ط§ط¹طھظڈظ…ظگط¯ ظپط¹ظ„ظٹظ‹ط§
    expect(db.salesOrders.get('so-1').status).toBe('approved');
  });

  it('ظ„ط§ ظٹظڈظ†ط´ط¦ طھظ†ط¨ظٹظ‡ظ‹ط§ ط¥ظ† ط¨ظ‚ظٹ ط§ظ„ط±طµظٹط¯ ط¯ظˆظ† ط§ظ„ط­ط¯ ط§ظ„ط§ط¦طھظ…ط§ظ†ظٹ', async () => {
    const db = buildFakeDbWithNotifications();
    seedCreditOrder(db, 1000, 10000, 500); // 1500 < 10000

    await db.service.confirm('so-1', 'user-1');

    expect(db.fakeNotificationsService.notifyRoleByCode).not.toHaveBeenCalled();
  });

  it('ظ…ظ†ط¹ ط§ظ„طھظƒط±ط§ط±: ظ„ط§ ظٹظڈظ†ط´ط¦ طھظ†ط¨ظٹظ‡ظ‹ط§ ط«ط§ظ†ظٹظ‹ط§ ط¥ظ† ظˆظڈط¬ط¯ طھظ†ط¨ظٹظ‡ ظ†ط´ط· ط¨ط§ظ„ظپط¹ظ„ ظ„ظ†ظپط³ ط§ظ„ط¹ظ…ظٹظ„', async () => {
    const db = buildFakeDbWithNotifications();
    seedCreditOrder(db, 9500, 10000, 1000);
    db.notifications.push({ id: 'existing', referenceId: 'cust-1', isRead: false });

    await db.service.confirm('so-1', 'user-1');

    expect(db.fakeNotificationsService.notifyRoleByCode).not.toHaveBeenCalled();
  });
});




