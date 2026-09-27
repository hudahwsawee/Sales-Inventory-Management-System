import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ظ…ط­ط§ظƒط§ط© In-Memory ظ„ط¬ط¯ظˆظ„ inventory_balances طھظڈط·ط¨ظگظ‘ظ‚ **ظ†ظپط³ ط¯ظ„ط§ظ„ط§طھ
 * updateMany ط§ظ„ط°ط±ظٹط©** ط§ظ„طھظٹ ظٹط¹طھظ…ط¯ ط¹ظ„ظٹظ‡ط§ InventoryService.applyInventoryChange
 * ظپط¹ظ„ظٹظ‹ط§ (ط´ط±ط· WHERE ظٹظڈظ‚ظٹظژظ‘ظ… ط¹ظ†ط¯ ط§ظ„طھظ†ظپظٹط°طŒ ظˆظ„ظٹط³ ط¹ظ†ط¯ ظ‚ط±ط§ط،ط© ظ…ط³ط¨ظ‚ط©) â€” ظ‡ط°ط§ ط¶ط±ظˆط±ظٹ
 * ظ„ط§ط®طھط¨ط§ط± ط³ظ„ط§ظ…ط© ط§ظ„طھط²ط§ظ…ظ† (ط¨ظ†ط¯ 14) ط¨ظ…طµط¯ط§ظ‚ظٹط© ط¯ظˆظ† ظ‚ط§ط¹ط¯ط© ط¨ظٹط§ظ†ط§طھ ط­ظ‚ظٹظ‚ظٹط©طŒ ط¨ظ†ظپط³
 * ظ…ظ†ظ‡ط¬ظٹط© auth.service.spec.ts ط§ظ„ظ…ط¹طھظ…ط¯ط© ط³ط§ط¨ظ‚ظ‹ط§ ظپظٹ ط§ظ„ظ…ط´ط±ظˆط¹.
 */
function buildFakeTx() {
  const balances = new Map<string, { productId: string; warehouseId: string; quantityOnHand: number }>();
  const transactions: unknown[] = [];

  const key = (p: string, w: string) => `${p}::${w}`;

  const tx = {
    inventoryBalance: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where.productId_warehouseId.productId, where.productId_warehouseId.warehouseId);
        const existing = balances.get(k);
        if (!existing) {
          balances.set(k, {
            productId: where.productId_warehouseId.productId,
            warehouseId: where.productId_warehouseId.warehouseId,
            quantityOnHand: create.quantityOnHand,
          });
        } else if (update.quantityOnHand?.increment !== undefined) {
          existing.quantityOnHand += update.quantityOnHand.increment;
        }
        return balances.get(k);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const k = key(where.productId, where.warehouseId);
        const existing = balances.get(k);
        const currentQty = existing?.quantityOnHand ?? 0;
        if (currentQty < where.quantityOnHand.gte) {
          return { count: 0 };
        }
        if (existing && data.quantityOnHand?.decrement !== undefined) {
          existing.quantityOnHand -= data.quantityOnHand.decrement;
        }
        return { count: 1 };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const k = key(where.productId_warehouseId.productId, where.productId_warehouseId.warehouseId);
        return balances.get(k) ?? null;
      }),
    },
    inventoryTransaction: {
      create: jest.fn(async ({ data }: any) => {
        const record = { id: `txn-${transactions.length + 1}`, ...data };
        transactions.push(record);
        return record;
      }),
    },
  };

  return { tx, balances, transactions };
}

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService({} as PrismaService);
  });

  it('9) ADJUSTMENT_IN ظٹط²ظٹط¯ ط§ظ„ط±طµظٹط¯ ظˆظٹظ†ط´ط¦ ط­ط±ظƒط© ظ…ظˆط¬ط¨ط©', async () => {
    const { tx, balances } = buildFakeTx();

    await service.applyInventoryChange(tx as any, {
      productId: 'p1',
      warehouseId: 'w1',
      transactionType: 'adjustment',
      quantity: 10,
      referenceType: 'manual',
      userId: 'u1',
    });

    expect(balances.get('p1::w1')?.quantityOnHand).toBe(10);
  });

  it('10) ADJUSTMENT_OUT ظٹظ†ظ‚طµ ط§ظ„ط±طµظٹط¯ ظˆظٹظ†ط´ط¦ ط­ط±ظƒط© ط³ط§ظ„ط¨ط©', async () => {
    const { tx, balances } = buildFakeTx();

    await service.applyInventoryChange(tx as any, {
      productId: 'p1',
      warehouseId: 'w1',
      transactionType: 'adjustment',
      quantity: 20,
      referenceType: 'manual',
      userId: 'u1',
    });
    await service.applyInventoryChange(tx as any, {
      productId: 'p1',
      warehouseId: 'w1',
      transactionType: 'adjustment',
      quantity: -5,
      referenceType: 'manual',
      userId: 'u1',
    });

    expect(balances.get('p1::w1')?.quantityOnHand).toBe(15);
  });

  it('11) ظ„ط§ ظٹظ…ظƒظ† طھط³ظˆظٹط© OUT طھط¬ط¹ظ„ ط§ظ„ط±طµظٹط¯ ط³ط§ظ„ط¨ظ‹ط§ â€” ظٹظڈط±ظپط¶ ط¨ط±ط³ط§ظ„ط© "ط§ظ„ط±طµظٹط¯ ط؛ظٹط± ظƒط§ظپظچ"', async () => {
    const { tx } = buildFakeTx();

    await service.applyInventoryChange(tx as any, {
      productId: 'p1',
      warehouseId: 'w1',
      transactionType: 'adjustment',
      quantity: 5,
      referenceType: 'manual',
      userId: 'u1',
    });

    await expect(
      service.applyInventoryChange(tx as any, {
        productId: 'p1',
        warehouseId: 'w1',
        transactionType: 'adjustment',
        quantity: -10,
        referenceType: 'manual',
        userId: 'u1',
      }),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });
  });

  it('14) طھط­ط¯ظٹط«ط§ظ† ظ…طھط²ط§ظ…ظ†ط§ظ† ط¹ظ„ظ‰ ظ†ظپط³ ط§ظ„ط±طµظٹط¯ ظ„ط§ ظٹظپط³ط¯ط§ظ† ط§ظ„ط¨ظٹط§ظ†ط§طھ (ظ„ط§ Lost Update)', async () => {
    const { tx, balances } = buildFakeTx();

    await service.applyInventoryChange(tx as any, {
      productId: 'p1',
      warehouseId: 'w1',
      transactionType: 'adjustment',
      quantity: 100,
      referenceType: 'manual',
      userId: 'u1',
    });

    // 5 ط¹ظ…ظ„ظٹط§طھ ط®طµظ… ظ…طھط²ط§ظ…ظ†ط© ط¨ظ‚ظٹظ…ط© 10 ظ„ظƒظ„ ظ…ظ†ظ‡ط§ â€” ط§ظ„ظ†طھظٹط¬ط© ط§ظ„طµط­ظٹط­ط© ط§ظ„ظˆط­ظٹط¯ط©: 50
    await Promise.all(
      Array.from({ length: 5 }).map(() =>
        service.applyInventoryChange(tx as any, {
          productId: 'p1',
          warehouseId: 'w1',
          transactionType: 'adjustment',
          quantity: -10,
          referenceType: 'manual',
          userId: 'u1',
        }),
      ),
    );

    expect(balances.get('p1::w1')?.quantityOnHand).toBe(50);
  });

  it('ظٹط±ظپط¶ طھط·ط¨ظٹظ‚ طھط؛ظٹظٹط± ط¨ظƒظ…ظٹط© طµظپط±', async () => {
    const { tx } = buildFakeTx();
    await expect(
      service.applyInventoryChange(tx as any, {
        productId: 'p1',
        warehouseId: 'w1',
        transactionType: 'adjustment',
        quantity: 0,
        referenceType: 'manual',
        userId: 'u1',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

/**
 * === Step 4 â€” ط¯ظˆط±ط© ط­ظٹط§ط© ط§ظ„ط­ط¬ط² (Reservation Lifecycle) ===
 * ظ…ط­ط§ظƒط§ط© ط¥ط¶ط§ظپظٹط© طھط¯ط¹ظ… $executeRaw (Tagged Template) ظˆinventory_reservationsطŒ
 * ط¨ظ†ظپط³ ظپظ„ط³ظپط© buildFakeTx ط£ط¹ظ„ط§ظ‡: ط§ظ„ط´ط±ط· ظٹظڈظ‚ظٹظژظ‘ظ… ط¹ظ†ط¯ ط§ظ„طھظ†ظپظٹط° ط§ظ„ظپط¹ظ„ظٹطŒ ظˆظ„ظٹط³
 * ط¹ظ†ط¯ ظ‚ط±ط§ط،ط© ظ…ط³ط¨ظ‚ط© â€” ظ„ط§ط®طھط¨ط§ط± reserveStock/consumeReservation ط¨ظ…طµط¯ط§ظ‚ظٹط©.
 */
function buildFakeReservationTx() {
  const balances = new Map<string, { quantityOnHand: number; reservedQuantity: number }>();
  const reservations = new Map<string, any>();
  const transactions: any[] = [];
  const key = (p: string, w: string) => `${p}::${w}`;

  function setBalance(productId: string, warehouseId: string, onHand: number, reserved = 0) {
    balances.set(key(productId, warehouseId), { quantityOnHand: onHand, reservedQuantity: reserved });
  }

  // $executeRaw ظ…ط¨ط³ظژظ‘ط·: ظٹظ…ظٹظ‘ط² ظ†ظˆط¹ ط§ظ„ط§ط³طھط¹ظ„ط§ظ… ظ…ظ† ظ†طµ ط§ظ„ظ‚ط§ظ„ط¨ ظ†ظپط³ظ‡ (strings[0])
  const $executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: number[]) => {
    const sql = strings.join('|');
    if (sql.includes('reserved_quantity = reserved_quantity +')) {
      // reserveStock: [productId, warehouseId, quantity] ط¨طھط±طھظٹط¨ ط§ظ„ظ‚ط§ظ„ط¨
      const [quantity, productId, warehouseId] = values as unknown as [number, string, string];
      const b = balances.get(key(productId, warehouseId));
      const available = b ? b.quantityOnHand - b.reservedQuantity : 0;
      if (!b || available < quantity) return 0;
      b.reservedQuantity += quantity;
      return 1;
    }
    if (sql.includes('quantity_on_hand = quantity_on_hand -')) {
      // consumeReservation: [qty, productId, warehouseId, qty, qty]
      const [qty, _reservedQty, productId, warehouseId] = values as unknown as [number, number, string, string, number, number];
      const b = balances.get(key(productId, warehouseId));
      if (!b || b.quantityOnHand < qty || b.reservedQuantity < qty) return 0;
      b.quantityOnHand -= qty;
      b.reservedQuantity -= qty;
      return 1;
    }
    if (sql.includes('reserved_quantity = reserved_quantity -')) {
      // releaseReservation: [quantity, productId, warehouseId]
      const [quantity, productId, warehouseId] = values as unknown as [number, string, string];
      const b = balances.get(key(productId, warehouseId));
      if (b) b.reservedQuantity -= quantity;
      return 1;
    }
    return 0;
  });

  const tx = {
    $executeRaw,
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

  return { tx, balances, reservations, transactions, setBalance };
}

describe('InventoryService â€” Reservation Lifecycle (Step 4)', () => {
  let service: InventoryService;

  beforeEach(() => {
    service = new InventoryService({} as PrismaService);
  });

  it('reserveStock ظٹظ†ط¬ط­ ط¶ظ…ظ† ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…طھط§ط­ط© ظˆظٹظ†ط´ط¦ ط­ط¬ط²ظ‹ط§ ظ†ط´ط·ظ‹ط§', async () => {
    const db = buildFakeReservationTx();
    db.setBalance('p1', 'w1', 100);

    await service.reserveStock(db.tx as any, {
      salesOrderItemId: 'item-1',
      productId: 'p1',
      warehouseId: 'w1',
      quantity: 30,
    });

    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(30);
    expect(db.reservations.get('item-1')?.status).toBe('active');
  });

  it('ظ„ط§ ظٹظ…ظƒظ† ط­ط¬ط² ظƒظ…ظٹط© ط£ظƒط¨ط± ظ…ظ† ط§ظ„ظ…طھط§ط­ (Prevent selling more than available stock)', async () => {
    const db = buildFakeReservationTx();
    db.setBalance('p1', 'w1', 10);

    await expect(
      service.reserveStock(db.tx as any, { salesOrderItemId: 'item-1', productId: 'p1', warehouseId: 'w1', quantity: 20 }),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_AVAILABLE_STOCK' } });

    expect(db.reservations.size).toBe(0);
  });

  it('releaseReservation ظٹط­ط±ط± ط§ظ„ط­ط¬ط² ط¯ظˆظ† ط§ظ„طھط£ط«ظٹط± ط¹ظ„ظ‰ quantity_on_hand', async () => {
    const db = buildFakeReservationTx();
    db.setBalance('p1', 'w1', 100);
    await service.reserveStock(db.tx as any, { salesOrderItemId: 'item-1', productId: 'p1', warehouseId: 'w1', quantity: 30 });

    await service.releaseReservation(db.tx as any, 'item-1');

    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(0);
    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(100); // ظ„ظ… طھطھط£ط«ط± ط¥ط·ظ„ط§ظ‚ظ‹ط§
    expect(db.reservations.get('item-1')?.status).toBe('released');
  });

  it('consumeReservation ظٹط®طµظ… quantity_on_hand ظپط¹ظ„ظٹظ‹ط§ ظˆظٹظ†ط´ط¦ ط­ط±ظƒط© sale ط³ط§ظ„ط¨ط©', async () => {
    const db = buildFakeReservationTx();
    db.setBalance('p1', 'w1', 100);
    await service.reserveStock(db.tx as any, { salesOrderItemId: 'item-1', productId: 'p1', warehouseId: 'w1', quantity: 30 });

    await service.consumeReservation(db.tx as any, { salesOrderItemId: 'item-1', referenceId: 'so-1', userId: 'u1' });

    expect(db.balances.get('p1::w1')?.quantityOnHand).toBe(70);
    expect(db.balances.get('p1::w1')?.reservedQuantity).toBe(0);
    expect(db.reservations.get('item-1')?.status).toBe('consumed');
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0].quantity).toBe(-30);
    expect(db.transactions[0].transactionType).toBe('sale');
  });
});

/**
 * === Step 6 â€” notifyIfLowStock: ط§ظ„ظ‚ط§ط¹ط¯ط© ط§ظ„ظ…ط­ط¯ظژظ‘ط«ط© (available_quantity) +
 * ظ…ظ†ط¹ ط§ظ„طھظƒط±ط§ط± (Deduplication) ===
 * ظ‡ظ†ط§ (ظˆظ‡ظ†ط§ ظپظ‚ط·) ظ†ظڈط­ظ‚ظ† notificationsService ظˆظ‡ظ…ظٹظ‹ط§ ظپط¹ظ„ظٹظ‹ط§طŒ ظ„ط§ط®طھط¨ط§ط± ظ…ط³ط§ط±
 * ط§ظ„ط¥ط´ط¹ط§ط± ظ†ظپط³ظ‡ (ط¨ط¹ظƒط³ ط§ط®طھط¨ط§ط±ط§طھ ط§ظ„ظ‚ط³ظ…ظٹظ† ط£ط¹ظ„ط§ظ‡ ط§ظ„طھظٹ طھط¹طھظ…ط¯ ط¹ظ…ط¯ظ‹ط§ ط¹ظ„ظ‰ طھط±ظƒظ‡
 * undefined ظ„ط¥ط«ط¨ط§طھ ط¹ط¯ظ… ظƒط³ط± ظ…ط³ط§ط±ط§طھ Step 3/4 ط§ظ„ظ…ظڈط®طھط¨ظژط±ط©).
 */
function buildFakeLowStockTx() {
  const settings = new Map<string, { minimumStock: number; isActive: boolean }>();
  const balances = new Map<string, { quantityOnHand: number; reservedQuantity: number; id: string }>();
  const notifications: any[] = [];
  const key = (p: string, w: string) => `${p}::${w}`;

  const tx = {
    warehouseProductSetting: {
      findUnique: jest.fn(async ({ where }: any) => {
        const k = key(where.productId_warehouseId.productId, where.productId_warehouseId.warehouseId);
        return settings.get(k) ?? null;
      }),
    },
    inventoryBalance: {
      findUnique: jest.fn(async ({ where }: any) => {
        const k = key(where.productId_warehouseId.productId, where.productId_warehouseId.warehouseId);
        return balances.get(k) ?? null;
      }),
    },
    notification: {
      findFirst: jest.fn(async ({ where }: any) =>
        notifications.find((n) => n.referenceId === where.referenceId && n.type === where.type && n.isRead === where.isRead) ?? null,
      ),
    },
    product: { findUnique: jest.fn(async () => ({ nameAr: 'ظ…ظ†طھط¬ طھط¬ط±ظٹط¨ظٹ' })) },
    warehouse: { findUnique: jest.fn(async () => ({ name: 'ط§ظ„ظ…ط®ط²ظ† ط§ظ„ط±ط¦ظٹط³ظٹ' })) },
    role: { findUnique: jest.fn(async ({ where }: any) => ({ id: `role-${where.code}` })) },
  };

  const fakeNotificationsService = {
    notifyRoleByCode: jest.fn(async (_client: any, roleCode: string, params: any) => {
      const n = { id: `notif-${notifications.length + 1}`, type: params.type, referenceId: params.referenceId, isRead: false, roleCode };
      notifications.push(n);
      return n;
    }),
  };

  return {
    tx,
    settings,
    balances,
    notifications,
    fakeNotificationsService,
    setSetting: (p: string, w: string, minimumStock: number) => settings.set(key(p, w), { minimumStock, isActive: true }),
    setBalance: (p: string, w: string, onHand: number, reserved: number, id = 'bal-1') =>
      balances.set(key(p, w), { quantityOnHand: onHand, reservedQuantity: reserved, id }),
  };
}

describe('InventoryService.notifyIfLowStock â€” Step 6 (available_quantity + Dedup)', () => {
  it('ظٹظڈظ†ط´ط¦ طھظ†ط¨ظٹظ‡ظ‹ط§ ط¹ظ†ط¯ظ…ط§ طھظƒظˆظ† ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…طھط§ط­ط© (ظˆظ„ظٹط³ ط§ظ„ظپط¹ظ„ظٹط© ظپظ‚ط·) ط¹ظ†ط¯ ط§ظ„ط­ط¯ ط§ظ„ط£ط¯ظ†ظ‰ ط£ظˆ ط£ظ‚ظ„', async () => {
    const db = buildFakeLowStockTx();
    // ط§ظ„ظƒظ…ظٹط© ط§ظ„ظپط¹ظ„ظٹط© 50 (طھط¨ط¯ظˆ ظƒط§ظپظٹط©) ظ„ظƒظ† 45 ظ…ظ†ظ‡ط§ ظ…ط­ط¬ظˆط² â†’ ط§ظ„ظ…طھط§ط­ 5 ظپظ‚ط·طŒ ظˆط§ظ„ط­ط¯ ط§ظ„ط£ط¯ظ†ظ‰ 10
    db.setSetting('p1', 'w1', 10);
    db.setBalance('p1', 'w1', 50, 45);

    const service = new InventoryService({} as PrismaService, db.fakeNotificationsService as any);
    await service.notifyIfLowStock(db.tx as any, { productId: 'p1', warehouseId: 'w1' });

    expect(db.fakeNotificationsService.notifyRoleByCode).toHaveBeenCalled();
    expect(db.notifications).toHaveLength(2); // WAREHOUSE + PURCHASING
  });

  it('ظ„ط§ ظٹظڈظ†ط´ط¦ طھظ†ط¨ظٹظ‡ظ‹ط§ ط¥ظ† ظƒط§ظ†طھ ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…طھط§ط­ط© ط£ط¹ظ„ظ‰ ظ…ظ† ط§ظ„ط­ط¯ ط§ظ„ط£ط¯ظ†ظ‰طŒ ط­طھظ‰ ظ„ظˆ ظƒط§ظ† ط§ظ„ظ…ط­ط¬ظˆط² ظƒط¨ظٹط±ظ‹ط§', async () => {
    const db = buildFakeLowStockTx();
    db.setSetting('p1', 'w1', 10);
    db.setBalance('p1', 'w1', 100, 50); // ط§ظ„ظ…طھط§ط­ = 50 > 10

    const service = new InventoryService({} as PrismaService, db.fakeNotificationsService as any);
    await service.notifyIfLowStock(db.tx as any, { productId: 'p1', warehouseId: 'w1' });

    expect(db.fakeNotificationsService.notifyRoleByCode).not.toHaveBeenCalled();
  });

  it('ظ…ظ†ط¹ ط§ظ„طھظƒط±ط§ط±: ظ„ط§ ظٹظڈظ†ط´ط¦ طھظ†ط¨ظٹظ‡ظ‹ط§ ط«ط§ظ†ظٹظ‹ط§ ط¥ظ† ظˆظڈط¬ط¯ طھظ†ط¨ظٹظ‡ ظ†ط´ط· (ط؛ظٹط± ظ…ظ‚ط±ظˆط،) ط¨ط§ظ„ظپط¹ظ„ ظ„ظ†ظپط³ ط§ظ„ط±طµظٹط¯', async () => {
    const db = buildFakeLowStockTx();
    db.setSetting('p1', 'w1', 10);
    db.setBalance('p1', 'w1', 5, 0, 'bal-1');

    const service = new InventoryService({} as PrismaService, db.fakeNotificationsService as any);

    await service.notifyIfLowStock(db.tx as any, { productId: 'p1', warehouseId: 'w1' });
    const firstCallCount = db.fakeNotificationsService.notifyRoleByCode.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // ظ†ظپط³ ط§ظ„ط±طµظٹط¯ ظ„ط§ ظٹط²ط§ظ„ ظ…ظ†ط®ظپط¶ظ‹ط§طŒ ظˆط§ط³طھط¯ط¹ط§ط، ط«ط§ظ†ظچ (ظ…ط«ط§ظ„: ط¹ظ…ظ„ظٹط© ط¨ظٹط¹ ط£ط®ط±ظ‰ ط¨ط¹ط¯ظ‡ط§ ظ…ط¨ط§ط´ط±ط©)
    await service.notifyIfLowStock(db.tx as any, { productId: 'p1', warehouseId: 'w1' });

    expect(db.fakeNotificationsService.notifyRoleByCode.mock.calls.length).toBe(firstCallCount); // ظ„ظ… ظٹط²ط¯
  });
});



