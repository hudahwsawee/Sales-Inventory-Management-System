import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ظ…ط­ط§ظƒط§ط© ظ…ط¨ط³ظژظ‘ط·ط© ظ„ظ€ PrismaService â€” طھط؛ط·ظٹ ظپظ‚ط· ط§ظ„ط§ط³طھط¹ظ„ط§ظ…ط§طھ ط§ظ„طھظٹ طھط³طھط¯ط¹ظٹظ‡ط§
 * ReportsService ظپط¹ظ„ظٹظ‹ط§ ظ„ظƒظ„ ط§ط®طھط¨ط§ط± ط¹ظ„ظ‰ ط­ط¯ط© (Mocks ظ…ط­ط¯ظژظ‘ط¯ط© ظ„ظƒظ„ ط­ط§ظ„ط© ط¨ط¯ظ„
 * ظ…ط­ط§ظƒط§ط© ط¹ط§ظ…ط© ط¶ط®ظ…ط©طŒ ظ„ظˆط¶ظˆط­ ط£ظƒط¨ط± ظˆط±ط¨ط· ظ…ط¨ط§ط´ط± ط¨ظٹظ† ظƒظ„ ط§ط®طھط¨ط§ط± ظˆظ…ط§ ظٹطھط­ظ‚ظ‚ ظ…ظ†ظ‡).
 */
function buildPrismaMock(overrides: Partial<Record<string, unknown>> = {}): PrismaService {
  return {
    salesOrder: { aggregate: jest.fn(async () => ({ _sum: { totalAmount: 0 }, _count: { _all: 0 } })), findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
    salesOrderItem: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
    return: { findMany: jest.fn(async () => []) },
    purchaseOrder: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []), count: jest.fn(async () => 0) },
    customer: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    supplier: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    inventoryBalance: { findMany: jest.fn(async () => []) },
    warehouseProductSetting: { findMany: jest.fn(async () => []) },
    inventoryTransaction: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    warehouse: { findMany: jest.fn(async () => []) },
    product: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (queries: unknown[]) => Promise.all(queries as Promise<unknown>[])),
    ...overrides,
  } as unknown as PrismaService;
}

describe('ReportsService â€” ظ‚ظˆط§ط¹ط¯ ط§ظ„ط¹ظ…ظ„ ط§ظ„ظ…ط§ظ„ظٹط© ط§ظ„ط­ط±ط¬ط©', () => {
  it('1) ط§ظ„ظ…ط¨ظٹط¹ط§طھ ط§ظ„ظ…ظ„ط؛ط§ط©/ط§ظ„ظ…ط±ظپظˆط¶ط© ظ„ط§ طھظڈط­طھط³ظژط¨ â€” ط§ظ„ظپظ„طھط± status:{in:[approved,delivered]} ظپظ‚ط·', async () => {
    const aggregate = jest.fn(async ({ where }: any) => {
      // ظ†طھط­ظ‚ظ‚ ط£ظ† ط§ظ„ظپظ„طھط± ط§ظ„ظ…ظڈط±ط³ظژظ„ ظپط¹ظ„ظٹظ‹ط§ ظٹط³طھط¨ط¹ط¯ cancelled/rejected/draft
      expect(where.status.in).toEqual(['approved', 'delivered']);
      return { _sum: { totalAmount: 5000 }, _count: { _all: 2 } };
    });
    const prisma = buildPrismaMock({ salesOrder: { aggregate, findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) } });
    const service = new ReportsService(prisma);

    const report = await service.getSalesReport({ page: 1, limit: 50 } as any);

    expect(report.summary.totalSales).toBe(5000);
    expect(aggregate).toHaveBeenCalled();
  });

  it('2) ط§ظ„ظ…ط±طھط¬ط¹ط§طھ ط§ظ„ظ…ظƒطھظ…ظ„ط© طھظڈط®ظپظگظ‘ط¶ طµط§ظپظٹ ط§ظ„ظ…ط¨ظٹط¹ط§طھ (Net Sales) ط¨ط¯ظ‚ط©', async () => {
    const prisma = buildPrismaMock({
      salesOrder: {
        aggregate: jest.fn(async () => ({ _sum: { totalAmount: 10000 }, _count: { _all: 1 } })),
        findMany: jest.fn(async () => []),
        groupBy: jest.fn(async () => []),
      },
      return: {
        findMany: jest.fn(async ({ where }: any) => {
          expect(where.status).toBe('completed'); // ظپظ‚ط· ط§ظ„ظ…ظƒطھظ…ظ„ط©طŒ ظˆظ„ظٹط³ draft/pending_approval
          expect(where.returnType).toBe('customer_return');
          return [{ items: [{ quantity: 2, unitPrice: 500 }] }]; // = 1000 ظ…ط±طھط¬ط¹
        }),
      },
    });
    const service = new ReportsService(prisma);

    const report = await service.getSalesReport({ page: 1, limit: 50 } as any);

    expect(report.summary.totalSales).toBe(10000);
    expect(report.summary.netSales).toBe(9000); // 10000 - 1000
  });

  it('3) ظ‡ط§ظ…ط´ ط§ظ„ط±ط¨ط­ ظ„ط§ ظٹظڈطµط¨ط­ NaN/Infinity ط¹ظ†ط¯ طµظپط± ظ…ط¨ظٹط¹ط§طھ â€” ظٹظڈط±ط¬ط¹ 0 ط¨ط£ظ…ط§ظ†', async () => {
    const prisma = buildPrismaMock(); // ظƒظ„ ط´ظٹط، طµظپط±ظٹ ط§ظپطھط±ط§ط¶ظٹظ‹ط§
    const service = new ReportsService(prisma);

    const report = await service.getProfitReport({ page: 1, limit: 50 } as any);

    expect(report.summary.netSales).toBe(0);
    expect(report.summary.grossProfitMarginPercent).toBe(0);
    expect(Number.isFinite(report.summary.grossProfitMarginPercent)).toBe(true);
    expect(Number.isNaN(report.summary.grossProfitMarginPercent)).toBe(false);
  });

  it('4) ط§ظ„ط±ط¨ط­ = طµط§ظپظٹ ط§ظ„ظ…ط¨ظٹط¹ط§طھ - COGS (ط¨ط§ط³طھط®ط¯ط§ظ… unit_cost_snapshot ط§ظ„ظپط¹ظ„ظٹطŒ ظˆظ„ظٹط³ ظ…طھظˆط³ط· ط§ظ„طھظƒظ„ظپط© ط§ظ„ط­ط§ظ„ظٹ)', async () => {
    const prisma = buildPrismaMock({
      salesOrder: {
        aggregate: jest.fn(async () => ({ _sum: { totalAmount: 0 }, _count: { _all: 0 } })),
        groupBy: jest.fn(async () => []),
        findMany: jest.fn(async () => [
          {
            id: 'so-1',
                      orderDate: new Date('2026-01-15T00:00:00.000Z'),
            totalAmount: 1000,
            items: [{ productId: 'p1', quantity: 10, unitCostSnapshot: 40, lineTotal: 1000 }], // ط¨ظٹط¹ 10أ—100=1000طŒ طھظƒظ„ظپط© 10أ—40=400
          },
        ]),
      },
    });
    const service = new ReportsService(prisma);

    const report = await service.getProfitReport({ page: 1, limit: 50 } as any);

    expect(report.summary.revenue).toBe(1000);
    expect(report.summary.cogs).toBe(400);
    expect(report.summary.grossProfit).toBe(600);
    expect(report.summary.grossProfitMarginPercent).toBeCloseTo(60, 5);
  });

  it('5) ط£ظˆط§ظ…ط± ط§ظ„ط´ط±ط§ط، ط§ظ„ظ…ظ„ط؛ط§ط© ظ„ط§ طھظڈط­طھط³ظژط¨ ط¶ظ…ظ† "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط´طھط±ظٹط§طھ" â€” ظپظ‚ط· completed/partially_received', async () => {
    const findMany = jest.fn(async ({ where }: any) => {
      expect(where.status.in).toEqual(['completed', 'partially_received']);
      return [{ id: 'po-1', orderDate: new Date('2026-01-15T00:00:00.000Z'), items: [{ lineTotal: 2000 }] }];
    });
    const prisma = buildPrismaMock({ purchaseOrder: { findMany, groupBy: jest.fn(async () => []), count: jest.fn(async () => 0) } });
    const service = new ReportsService(prisma);

    const report = await service.getPurchasesReport({ page: 1, limit: 50 } as any);

    expect(report.summary.totalPurchases).toBe(2000);
  });

  it('6) ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§ط، ط¹ظ†ط¯/ظپظˆظ‚ ط§ظ„ط­ط¯ ط§ظ„ط§ط¦طھظ…ط§ظ†ظٹ ظٹط³طھط®ط¯ظ… ظ…ظ‚ط§ط±ظ†ط© Decimal-Safe (.gte) ظˆظ„ظٹط³ Number', async () => {
    const gte1 = jest.fn(() => true); // 10000 >= 10000
    const gte2 = jest.fn(() => false); // 5000 >= 10000
    const prisma = buildPrismaMock({
      customer: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => [
          { currentBalance: { gte: gte1 }, creditLimit: 10000 },
          { currentBalance: { gte: gte2 }, creditLimit: 10000 },
        ]),
      },
    });
    const service = new ReportsService(prisma);

    const report = await service.getCustomersReport({ page: 1, limit: 50 } as any);

    expect(gte1).toHaveBeenCalled();
    expect(gte2).toHaveBeenCalled();
    expect(report.summary.atOrOverLimitCount).toBe(1);
  });

  it('7) ظپظ„طھط± ط§ظ„طھط§ط±ظٹط® ظٹظڈظ…ط±ظژظ‘ط± ظپط¹ظ„ظٹظ‹ط§ ظ„ط§ط³طھط¹ظ„ط§ظ… ط§ظ„ظ…ط®ط²ظˆظ†/ط§ظ„ط­ط±ظƒط§طھ (Backend Pagination) â€” ظ„ط§ ظٹظڈط­ظ…ظژظ‘ظ„ ظƒظ„ ط§ظ„ط³ط¬ظ„ط§طھ', async () => {
    const findMany = jest.fn(async (_args: any) => []);
    const count = jest.fn(async () => 0);
    const prisma = buildPrismaMock({
      inventoryTransaction: { findMany, count },
      $transaction: jest.fn(async (queries: any[]) => Promise.all(queries)),
    });
    const service = new ReportsService(prisma);

    const result = await service.getInventoryMovements({ dateFrom: '2026-01-01', dateTo: '2026-01-31', page: 2, limit: 10 } as any);

    const callArg = findMany.mock.calls[0][0];
    expect(callArg.skip).toBe(10); // طµظپط­ط© 2 ط¨ط­ط¬ظ… 10
    expect(callArg.take).toBe(10);
    expect(callArg.where.transactionDate).toBeDefined();
    expect(result.pagination.page).toBe(2);
  });

  it('8) ظپظ„طھط± ط§ظ„ظ…ط®ط²ظ† ظٹظڈظ…ط±ظژظ‘ط± ظپط¹ظ„ظٹظ‹ط§ ظ„ظ…ظ„ط®طµ ط§ظ„ظ…ط¨ظٹط¹ط§طھ', async () => {
    const aggregate = jest.fn(async ({ where }: any) => {
      expect(where.warehouseId).toBe('wh-main');
      return { _sum: { totalAmount: 0 }, _count: { _all: 0 } };
    });
    const prisma = buildPrismaMock({ salesOrder: { aggregate, findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) } });
    const service = new ReportsService(prisma);

    await service.getSalesReport({ warehouseId: 'wh-main', page: 1, limit: 50 } as any);

    expect(aggregate).toHaveBeenCalled();
  });
});



