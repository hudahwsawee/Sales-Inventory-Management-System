import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';

describe('DashboardService — Step 6 (RBAC visibility)', () => {
  function buildService() {
    const prisma = {
      approval: { count: jest.fn(async () => 3) },
      customer: {
        findMany: jest.fn(async () => [
          { currentBalance: new Prisma.Decimal(9000), creditLimit: new Prisma.Decimal(10000) }, // دون الحد
          { currentBalance: new Prisma.Decimal(10000), creditLimit: new Prisma.Decimal(10000) }, // عند الحد بالضبط
          { currentBalance: new Prisma.Decimal(15000), creditLimit: new Prisma.Decimal(10000) }, // تجاوز الحد
        ]),
      },
    } as unknown as PrismaService;

    const inventoryService = { findLowStock: jest.fn(async () => [{ id: '1' }, { id: '2' }]) } as unknown as InventoryService;
    const purchaseOrdersService = {
      checkOverdueAndNotify: jest.fn(async () => undefined),
      findOverdue: jest.fn(async () => [{ id: 'po-1' }]),
    } as unknown as PurchaseOrdersService;

    return { service: new DashboardService(prisma, inventoryService, purchaseOrdersService), prisma, inventoryService, purchaseOrdersService };
  }

  it('ADMIN (كل الصلاحيات) يرى الأربعة عدّادات جميعًا', async () => {
    const { service } = buildService();
    const allPermissions = ['inventory.view', 'approvals.view', 'customers.view', 'purchasing.view'];

    const result = await service.getAlertsSummary(allPermissions);

    expect(result.lowStock).toBe(2);
    expect(result.pendingApprovals).toBe(3);
    expect(result.creditLimitCustomers).toBe(2); // عند الحد بالضبط + تجاوز = 2 (وليس 3)
    expect(result.overduePurchaseOrders).toBe(1);
  });

  it('مستخدم بصلاحية inventory.view فقط لا يرى إلا عدّاد المخزون المنخفض', async () => {
    const { service } = buildService();

    const result = await service.getAlertsSummary(['inventory.view']);

    expect(result.lowStock).toBe(2);
    expect(result.pendingApprovals).toBeUndefined();
    expect(result.creditLimitCustomers).toBeUndefined();
    expect(result.overduePurchaseOrders).toBeUndefined();
  });

  it('مستخدم بلا أي صلاحية ذات صلة لا يرى أي عدّاد إطلاقًا', async () => {
    const { service, inventoryService } = buildService();

    const result = await service.getAlertsSummary(['sales.view']); // صلاحية غير مرتبطة بأي عدّاد هنا

    expect(Object.keys(result)).toHaveLength(0);
    expect(inventoryService.findLowStock).not.toHaveBeenCalled(); // لم يُستعلَم حتى — ليس فقط "أُخفي في الواجهة"
  });
});
