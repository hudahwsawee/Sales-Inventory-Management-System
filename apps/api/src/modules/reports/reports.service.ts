import { Injectable } from '@nestjs/common';
import { Prisma, SalesOrderStatus, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryReportsDto } from './dto/query-reports.dto';

/**
 * ============================================================================
 * قواعد العمل المعتمدة لكل تقرير (Step 7) — موثَّقة هنا صراحة تطبيقًا
 * للمتطلب رقم 33: "Financial analytics must be traceable... status rules
 * explicit". هذه القواعد مبنية على التصميم الفعلي المعتمد من Steps 1-6،
 * وليست اختراعًا جديدًا.
 * ============================================================================
 *
 * VALID_SALES_STATUSES = ['approved', 'delivered']
 *   في التصميم الفعلي المعتمد (Step 4)، تدفق أمر البيع المُنفَّذ فعليًا هو:
 *   draft → confirm → approved → fulfill → delivered (+ cancelled). لم
 *   يُستخدَم pending_approval/preparing/ready_for_delivery/rejected فعليًا
 *   في أي مسار منفَّذ (مُعرَّفة في enum لتوسّع مستقبلي فقط). "مبيعات صحيحة"
 *   إذن = أي أمر تجاوز مرحلة "مسودة" ولم يُلغَ: approved أو delivered.
 *   draft مُستبعَد (لم يُؤكَّد أصلًا، بلا حجز حتى)، cancelled/rejected مُستبعَدان صراحة.
 *
 * VALID_PURCHASE_STATUSES (للمقاييس المالية) = ['completed', 'partially_received']
 *   "المشتريات" كقيمة مالية فعلية تعني بضاعة استُلمت فعليًا أو جزئيًا —
 *   draft/pending لم يحدث فيهما أي استلام بعد (التزام مستقبلي فقط، ليس
 *   تكلفة مُتكبَّدة)، وcancelled مُستبعَد صراحة (متطلب 9 والمتطلب رقم 33).
 *
 * COGS (تكلفة البضاعة المباعة) = Σ (sales_order_items.quantity ×
 *   sales_order_items.unit_cost_snapshot) لكل أوامر البيع الصحيحة —
 *   unit_cost_snapshot هو نفسه آلية التكلفة المعتمدة أصلًا من Step 4 (نسخة
 *   من average_cost وقت إنشاء بند الطلب، ثابتة لا تتأثر بتغيّر التكلفة
 *   لاحقًا). **لم تُخترَع طريقة تكلفة جديدة** — هذا الحقل موجود ومُستخدَم
 *   بالضبط لهذا الغرض في التصميم الأصلي.
 *
 * أثر المرتجعات على الأرباح: مرتجع عميل **مكتمل فقط** (completed) يُنقِص
 *   Net Sales بقيمة (quantity × unit_price) من بنوده، **ويُخفِّض COGS
 *   أيضًا** بمطابقة كل بند مرتجع مع بند طلب البيع الأصلي (نفس المنتج ضمن
 *   نفس referenceSalesOrderId) لاسترجاع unit_cost_snapshot الحقيقي —
 *   بيانات المطابقة متوفرة فعليًا في المخطط (Return.referenceSalesOrderId)،
 *   فلم تُهمَل رغم تعقيدها الإضافي.
 *
 * قيمة المخزون الحالية = Σ (quantity_on_hand × product.average_cost) —
 *   نفس منهجية التكلفة المرجّحة المعتمدة، وليست بالضرورة قيمة بيع.
 *
 * تحديد "نقص المخزون" هنا يطابق تمامًا قاعدة Step 6 المعتمدة: available_quantity
 *   (quantity_on_hand - reserved_quantity) <= minimum_stock، وليس quantity_on_hand فقط.
 *
 * قيد معروف (Known Limitation — موثَّق صراحة وليس اختراعًا): "Accounts
 *   Receivable Aging" الحقيقي (تصنيف حسب عمر الفاتورة: 30/60/90 يومًا)
 *   **غير قابل للحساب بدقة** بالمخطط الحالي — Payment مرتبط بـ sales_order
 *   ككل (دفعة على إجمالي الطلب)، وليس بتاريخ استحقاق فاتورة فردي أو بنود
 *   محدَّدة. البديل الدقيق المُقدَّم بدلًا من الاختراع: "الرصيد المستحق
 *   الحالي" لكل عميل (currentBalance) + توزيع نشط/آجل/نقدي فقط.
 * ============================================================================
 */

const VALID_SALES_STATUSES: SalesOrderStatus[] = ['approved', 'delivered'];
const VALID_PURCHASE_STATUSES_FOR_FINANCE: PurchaseOrderStatus[] = ['completed', 'partially_received'];

export interface PeriodComparison {
  current: number;
  previous: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ==========================================================================
  // مساعدات مشتركة
  // ==========================================================================

  private buildDateRange(dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date } | undefined {
    if (!dateFrom && !dateTo) return undefined;
    return {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  /** الفترة السابقة المكافئة لنفس طول الفترة الحالية مباشرة قبلها — لمقارنة الاتجاه */
  private getPreviousPeriod(dateFrom?: string, dateTo?: string): { gte: Date; lte: Date } | null {
    if (!dateFrom || !dateTo) return null;
    const from = new Date(dateFrom);
    const to = new Date(`${dateTo}T23:59:59.999Z`);
    const durationMs = to.getTime() - from.getTime();
    if (durationMs <= 0) return null;
    return { gte: new Date(from.getTime() - durationMs - 1), lte: new Date(from.getTime() - 1) };
  }

  /** مقارنة آمنة تمامًا من القسمة على صفر/NaN/Infinity (متطلب 14 و25 صراحة) */
  private compare(current: number, previous: number | null): PeriodComparison {
    if (previous === null) return { current, previous: null, changeAmount: null, changePercent: null };
    const changeAmount = current - previous;
    const changePercent = previous === 0 ? null : (changeAmount / previous) * 100; // null بدل Infinity/NaN المضلِّلة
    return { current, previous, changeAmount, changePercent };
  }

  private safeDiv(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // ==========================================================================
  // 1) نظرة عامة (Executive Overview)
  // ==========================================================================
  async getOverview(query: QueryReportsDto) {
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const compareEnabled = query.compare === 'true';
    const prevRange = compareEnabled ? this.getPreviousPeriod(query.dateFrom, query.dateTo) : null;

    const currentSales = await this.computeSalesSummary(dateRange, query.warehouseId);
    const currentProfit = await this.computeProfitSummary(dateRange, query.warehouseId);
    const currentPurchases = await this.computePurchasesSummary(dateRange, query.warehouseId);

    const previousSales = prevRange ? await this.computeSalesSummary(prevRange, query.warehouseId) : null;
    const previousProfit = prevRange ? await this.computeProfitSummary(prevRange, query.warehouseId) : null;
    const previousPurchases = prevRange ? await this.computePurchasesSummary(prevRange, query.warehouseId) : null;

    const [inventoryValue, customersCount, receivables] = await Promise.all([
      this.computeInventoryValue(query.warehouseId),
      this.prisma.customer.count({ where: { isActive: true } }),
      this.computeTotalReceivables(),
    ]);

    return {
      totalSales: this.compare(currentSales.totalSales, previousSales?.totalSales ?? null),
      netSales: this.compare(currentSales.netSales, previousSales?.netSales ?? null),
      grossProfit: this.compare(currentProfit.grossProfit, previousProfit?.grossProfit ?? null),
      grossProfitMarginPercent: currentProfit.grossProfitMarginPercent,
      orderCount: this.compare(currentSales.orderCount, previousSales?.orderCount ?? null),
      averageOrderValue: currentSales.averageOrderValue,
      totalPurchases: this.compare(currentPurchases.totalPurchases, previousPurchases?.totalPurchases ?? null),
      currentInventoryValue: inventoryValue,
      activeCustomersCount: customersCount,
      totalReceivables: receivables,
    };
  }

  // ==========================================================================
  // 2) المبيعات (Sales Analytics)
  // ==========================================================================
  async getSalesReport(query: QueryReportsDto) {
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const where: Prisma.SalesOrderWhereInput = {
      status: { in: VALID_SALES_STATUSES },
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };

    const allStatusesWhere: Prisma.SalesOrderWhereInput = {
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };

    const summary = await this.computeSalesSummary(dateRange, query.warehouseId, query.customerId);

    const [byStatus, byPaymentType, byWarehouse, trend, topProducts, topCustomers] = await Promise.all([
      this.prisma.salesOrder.groupBy({ by: ['status'], where: allStatusesWhere, _count: { _all: true } }),
      this.prisma.salesOrder.groupBy({ by: ['paymentType'], where, _sum: { totalAmount: true }, _count: { _all: true } }),
      this.prisma.salesOrder.groupBy({ by: ['warehouseId'], where, _sum: { totalAmount: true }, _count: { _all: true } }),
      this.getSalesTrend(where, query.groupBy ?? 'day'),
      this.getTopProductsBySales(where, 10),
      this.getTopCustomersBySales(where, 10),
    ]);

    const warehouses = await this.prisma.warehouse.findMany({ where: { id: { in: byWarehouse.map((w) => w.warehouseId) } } });
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));

    return {
      summary,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      byPaymentType: byPaymentType.map((p) => ({
        paymentType: p.paymentType,
        totalAmount: Number(p._sum.totalAmount ?? 0),
        count: p._count._all,
      })),
      byWarehouse: byWarehouse.map((w) => ({
        warehouseId: w.warehouseId,
        warehouseName: warehouseMap.get(w.warehouseId) ?? w.warehouseId,
        totalAmount: Number(w._sum.totalAmount ?? 0),
        count: w._count._all,
      })),
      trend,
      topProducts,
      topCustomers,
    };
  }

  private async computeSalesSummary(dateRange: { gte?: Date; lte?: Date } | undefined, warehouseId?: string, customerId?: string) {
    const where: Prisma.SalesOrderWhereInput = {
      status: { in: VALID_SALES_STATUSES },
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const agg = await this.prisma.salesOrder.aggregate({ where, _sum: { totalAmount: true }, _count: { _all: true } });
    const totalSales = Number(agg._sum.totalAmount ?? 0);
    const orderCount = agg._count._all;

    const returnsValue = await this.computeCompletedCustomerReturnsValue(dateRange, warehouseId);
    const netSales = totalSales - returnsValue;
    const averageOrderValue = this.safeDiv(totalSales, orderCount);

    return { totalSales, netSales, orderCount, averageOrderValue, returnsValue };
  }

  private async computeCompletedCustomerReturnsValue(dateRange: { gte?: Date; lte?: Date } | undefined, warehouseId?: string): Promise<number> {
    const returns = await this.prisma.return.findMany({
      where: {
        returnType: 'customer_return',
        status: 'completed',
        ...(dateRange ? { returnDate: dateRange } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { items: true },
    });
    return returns.reduce((sum, ret) => sum + ret.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0), 0);
  }

  private async getSalesTrend(where: Prisma.SalesOrderWhereInput, groupBy: 'day' | 'week' | 'month' | 'year') {
    // Prisma لا يدعم DATE_TRUNC تصريحيًا عبر groupBy القياسي بدقة يوم/أسبوع/شهر
    // لحقل DateTime، فنجلب فقط الحقلين المطلوبين (لا سجلات كاملة) ونُجمِّع في
    // التطبيق — مقبول لحجم بيانات مؤسسة متوسطة، وموثَّق كخيار عملي هنا.
    const orders = await this.prisma.salesOrder.findMany({ where, select: { orderDate: true, totalAmount: true } });
    return this.groupByPeriod(orders.map((o) => ({ date: o.orderDate, amount: Number(o.totalAmount) })), groupBy);
  }

  private groupByPeriod(rows: { date: Date; amount: number }[], groupBy: 'day' | 'week' | 'month' | 'year') {
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const key = this.periodKey(row.date, groupBy);
      buckets.set(key, (buckets.get(key) ?? 0) + row.amount);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, amount]) => ({ period, amount }));
  }

  private periodKey(date: Date, groupBy: 'day' | 'week' | 'month' | 'year'): string {
    const d = new Date(date);
    if (groupBy === 'year') return `${d.getUTCFullYear()}`;
    if (groupBy === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (groupBy === 'week') {
      const firstDayOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNumber = Math.ceil(((d.getTime() - firstDayOfYear.getTime()) / 86400000 + firstDayOfYear.getUTCDay() + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
    }
    return d.toISOString().slice(0, 10); // day
  }

  private async getTopProductsBySales(where: Prisma.SalesOrderWhereInput, limit: number) {
    const orders = await this.prisma.salesOrder.findMany({ where, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) return [];

    const grouped = await this.prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: { salesOrderId: { in: orderIds } },
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: limit,
    });

    const products = await this.prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return grouped.map((g) => ({
      productId: g.productId,
      productName: productMap.get(g.productId)?.nameAr ?? g.productId,
      productCode: productMap.get(g.productId)?.code ?? '',
      totalSales: Number(g._sum.lineTotal ?? 0),
      quantitySold: Number(g._sum.quantity ?? 0),
    }));
  }

  private async getTopCustomersBySales(where: Prisma.SalesOrderWhereInput, limit: number) {
    const grouped = await this.prisma.salesOrder.groupBy({
      by: ['customerId'],
      where,
      _sum: { totalAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    });

    const customers = await this.prisma.customer.findMany({ where: { id: { in: grouped.map((g) => g.customerId) } } });
    const customerMap = new Map(customers.map((c) => [c.id, c.name]));

    return grouped.map((g) => ({
      customerId: g.customerId,
      customerName: customerMap.get(g.customerId) ?? g.customerId,
      totalSales: Number(g._sum.totalAmount ?? 0),
      orderCount: g._count._all,
    }));
  }

  // ==========================================================================
  // 3) الأرباح (Profit Analytics)
  // ==========================================================================
  async getProfitReport(query: QueryReportsDto) {
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const summary = await this.computeProfitSummary(dateRange, query.warehouseId, query.productId);

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        status: { in: VALID_SALES_STATUSES },
        ...(dateRange ? { orderDate: dateRange } : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      },
      select: {
        orderDate: true,
        totalAmount: true,
        items: { select: { quantity: true, unitCostSnapshot: true } },
      },
    });

    const trendRows = orders.map((o) => ({
      date: o.orderDate,
      revenue: Number(o.totalAmount),
      cogs: o.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCostSnapshot), 0),
    }));
    const revenueTrend = this.groupByPeriod(trendRows.map((r) => ({ date: r.date, amount: r.revenue })), query.groupBy ?? 'day');
    const cogsTrend = this.groupByPeriod(trendRows.map((r) => ({ date: r.date, amount: r.cogs })), query.groupBy ?? 'day');
    const profitTrend = revenueTrend.map((r, idx) => ({ period: r.period, profit: r.amount - (cogsTrend[idx]?.amount ?? 0) }));

    return { summary, profitTrend };
  }

  private async computeProfitSummary(dateRange: { gte?: Date; lte?: Date } | undefined, warehouseId?: string, productId?: string) {
    const orderWhere: Prisma.SalesOrderWhereInput = {
      status: { in: VALID_SALES_STATUSES },
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(warehouseId ? { warehouseId } : {}),
    };

    const orders = await this.prisma.salesOrder.findMany({
      where: orderWhere,
      select: {
        id: true,
        totalAmount: true,
        items: { select: { productId: true, quantity: true, unitCostSnapshot: true, lineTotal: true } },
      },
    });

    const relevantOrders = productId ? orders.filter((o) => o.items.some((i) => i.productId === productId)) : orders;

    const revenue = relevantOrders.reduce((sum, o) => {
      if (!productId) return sum + Number(o.totalAmount);
      return sum + o.items.filter((i) => i.productId === productId).reduce((s, i) => s + Number(i.lineTotal), 0);
    }, 0);

    const cogsFromSales = relevantOrders.reduce(
      (sum, o) =>
        sum +
        o.items
          .filter((i) => !productId || i.productId === productId)
          .reduce((s, i) => s + Number(i.quantity) * Number(i.unitCostSnapshot), 0),
      0,
    );

    // === أثر المرتجعات المكتملة: تخفيض الإيراد وCOGS معًا (راجعوا التوثيق أعلى الملف) ===
    const orderIds = relevantOrders.map((o) => o.id);
    const { revenueReduction, cogsReduction } = await this.computeReturnsProfitImpact(orderIds, dateRange, warehouseId, productId);

    const netSales = revenue - revenueReduction;
    const cogs = cogsFromSales - cogsReduction;
    const grossProfit = netSales - cogs;
    const grossProfitMarginPercent = netSales === 0 ? 0 : (grossProfit / netSales) * 100;

    return { revenue, netSales, cogs, grossProfit, grossProfitMarginPercent };
  }

  private async computeReturnsProfitImpact(
    relevantSalesOrderIds: string[],
    dateRange: { gte?: Date; lte?: Date } | undefined,
    warehouseId?: string,
    productId?: string,
  ): Promise<{ revenueReduction: number; cogsReduction: number }> {
    if (relevantSalesOrderIds.length === 0) return { revenueReduction: 0, cogsReduction: 0 };

    const returns = await this.prisma.return.findMany({
      where: {
        returnType: 'customer_return',
        status: 'completed',
        referenceSalesOrderId: { in: relevantSalesOrderIds },
        ...(dateRange ? { returnDate: dateRange } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { items: true },
    });
    if (returns.length === 0) return { revenueReduction: 0, cogsReduction: 0 };

    // جلب دفعي واحد لكل بنود أوامر البيع الأصلية المعنية (لا N+1) للمطابقة على unit_cost_snapshot
    const originalItems = await this.prisma.salesOrderItem.findMany({
      where: { salesOrderId: { in: returns.map((r) => r.referenceSalesOrderId!) } },
      select: { salesOrderId: true, productId: true, unitCostSnapshot: true },
    });
    const costLookup = new Map(originalItems.map((i) => [`${i.salesOrderId}::${i.productId}`, Number(i.unitCostSnapshot)]));

    let revenueReduction = 0;
    let cogsReduction = 0;
    for (const ret of returns) {
      for (const item of ret.items) {
        if (productId && item.productId !== productId) continue;
        revenueReduction += Number(item.quantity) * Number(item.unitPrice);
        const originalCost = costLookup.get(`${ret.referenceSalesOrderId}::${item.productId}`) ?? 0;
        cogsReduction += Number(item.quantity) * originalCost;
      }
    }
    return { revenueReduction, cogsReduction };
  }

  // ==========================================================================
  // 4) المخزون (Inventory Reports)
  // ==========================================================================
  async getInventoryReport(query: QueryReportsDto) {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
      include: { product: { include: { category: true, brand: true } }, warehouse: true },
    });

    const settings = await this.prisma.warehouseProductSetting.findMany({
      where: { isActive: true, ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
    });
    const settingMap = new Map(settings.map((s) => [`${s.productId}::${s.warehouseId}`, s.minimumStock]));

    let totalValue = 0;
    let belowMinimumCount = 0;
    let outOfStockCount = 0;

    const rows = balances.map((b) => {
      const quantityOnHand = Number(b.quantityOnHand);
      const reservedQuantity = Number(b.reservedQuantity);
      const availableQuantity = quantityOnHand - reservedQuantity;
      const averageCost = Number(b.product.averageCost);
      const value = quantityOnHand * averageCost;
      totalValue += value;

      const minimumStock = settingMap.get(`${b.productId}::${b.warehouseId}`);
      const isBelowMinimum = minimumStock !== undefined && availableQuantity <= minimumStock;
      if (isBelowMinimum) belowMinimumCount++;
      if (quantityOnHand <= 0) outOfStockCount++;

      return {
        productId: b.productId,
        productCode: b.product.code,
        productName: b.product.nameAr,
        categoryName: b.product.category?.nameAr ?? null,
        brandName: b.product.brand?.nameAr ?? null,
        warehouseId: b.warehouseId,
        warehouseName: b.warehouse.name,
        quantityOnHand,
        reservedQuantity,
        availableQuantity,
        averageCost,
        value,
        minimumStock: minimumStock ?? null,
        isBelowMinimum,
        isOutOfStock: quantityOnHand <= 0,
      };
    });

    const byWarehouseMap = new Map<string, { warehouseName: string; value: number; itemCount: number }>();
    for (const r of rows) {
      const entry = byWarehouseMap.get(r.warehouseId) ?? { warehouseName: r.warehouseName, value: 0, itemCount: 0 };
      entry.value += r.value;
      entry.itemCount += 1;
      byWarehouseMap.set(r.warehouseId, entry);
    }

    return {
      summary: { totalValue, totalItems: rows.length, belowMinimumCount, outOfStockCount },
      byWarehouse: Array.from(byWarehouseMap.entries()).map(([warehouseId, v]) => ({ warehouseId, ...v })),
      belowMinimumProducts: rows.filter((r) => r.isBelowMinimum),
      outOfStockProducts: rows.filter((r) => r.isOutOfStock),
      items: rows,
    };
  }

  private async computeInventoryValue(warehouseId?: string): Promise<number> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { ...(warehouseId ? { warehouseId } : {}) },
      select: { quantityOnHand: true, product: { select: { averageCost: true } } },
    });
    return balances.reduce((sum, b) => sum + Number(b.quantityOnHand) * Number(b.product.averageCost), 0);
  }

  /**
   * getInventoryMovements — Stock Movement Report، مُصفَّح (Backend Pagination
   * إلزامي — متطلب 16/22 صراحة). الأنواع المعروضة هي **فقط** الأنواع الحقيقية
   * الموجودة في InventoryTransactionType (purchase_receipt/sale/customer_return/
   * supplier_return/adjustment) — لا "RESERVE"/"RELEASE" لأنهما ليسا حركة
   * فعلية في دفتر المخزون بالتصميم المعتمد (الحجز يُغيِّر reserved_quantity فقط
   * دون قيد دفتر — راجعوا InventoryReservation، وليس InventoryTransaction).
   */
  async getInventoryMovements(query: QueryReportsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);

    const where: Prisma.InventoryTransactionWhereInput = {
      ...(dateRange ? { transactionDate: dateRange } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: { product: true, warehouse: true, user: { select: { fullName: true } } },
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        productName: t.product.nameAr,
        productCode: t.product.code,
        warehouseName: t.warehouse.name,
        transactionType: t.transactionType,
        quantity: Number(t.quantity),
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        userName: t.user.fullName,
        notes: t.notes,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==========================================================================
  // 5) المشتريات (Purchase Reports)
  // ==========================================================================
  async getPurchasesReport(query: QueryReportsDto) {
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const financeWhere: Prisma.PurchaseOrderWhereInput = {
      status: { in: VALID_PURCHASE_STATUSES_FOR_FINANCE },
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };
    const allStatusesWhere: Prisma.PurchaseOrderWhereInput = {
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };

    const summary = await this.computePurchasesSummary(dateRange, query.warehouseId, query.supplierId);

    const [byStatus, bySupplier, trend, overdue] = await Promise.all([
      this.prisma.purchaseOrder.groupBy({ by: ['status'], where: allStatusesWhere, _count: { _all: true } }),
      this.getPurchasesBySupplier(financeWhere, 10),
      this.getPurchasesTrend(financeWhere, query.groupBy ?? 'day'),
      this.getOverduePurchaseOrdersCount(),
    ]);

    return { summary, byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })), bySupplier, trend, overduePurchaseOrdersCount: overdue };
  }

  private async computePurchasesSummary(dateRange: { gte?: Date; lte?: Date } | undefined, warehouseId?: string, supplierId?: string) {
    const where: Prisma.PurchaseOrderWhereInput = {
      status: { in: VALID_PURCHASE_STATUSES_FOR_FINANCE },
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(supplierId ? { supplierId } : {}),
    };

    const orders = await this.prisma.purchaseOrder.findMany({ where, select: { id: true, items: { select: { lineTotal: true } } } });
    const totalPurchases = orders.reduce((sum, po) => sum + po.items.reduce((s, i) => s + Number(i.lineTotal), 0), 0);
    const orderCount = orders.length;
    const averageOrderValue = this.safeDiv(totalPurchases, orderCount);

    return { totalPurchases, orderCount, averageOrderValue };
  }

  private async getPurchasesBySupplier(where: Prisma.PurchaseOrderWhereInput, limit: number) {
    const orders = await this.prisma.purchaseOrder.findMany({ where, select: { supplierId: true, items: { select: { lineTotal: true } } } });
    const bySupplier = new Map<string, { totalValue: number; orderCount: number }>();
    for (const po of orders) {
      const entry = bySupplier.get(po.supplierId) ?? { totalValue: 0, orderCount: 0 };
      entry.totalValue += po.items.reduce((s, i) => s + Number(i.lineTotal), 0);
      entry.orderCount += 1;
      bySupplier.set(po.supplierId, entry);
    }
    const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: Array.from(bySupplier.keys()) } } });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    return Array.from(bySupplier.entries())
      .map(([supplierId, v]) => ({ supplierId, supplierName: supplierMap.get(supplierId) ?? supplierId, ...v }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  }

  private async getPurchasesTrend(where: Prisma.PurchaseOrderWhereInput, groupBy: 'day' | 'week' | 'month' | 'year') {
    const orders = await this.prisma.purchaseOrder.findMany({ where, select: { orderDate: true, items: { select: { lineTotal: true } } } });
    const rows = orders.map((po) => ({ date: po.orderDate, amount: po.items.reduce((s, i) => s + Number(i.lineTotal), 0) }));
    return this.groupByPeriod(rows, groupBy);
  }

  private async getOverduePurchaseOrdersCount(): Promise<number> {
    return this.prisma.purchaseOrder.count({
      where: { status: { in: ['draft', 'pending', 'partially_received'] }, expectedDeliveryDate: { lt: new Date() } },
    });
  }

  // ==========================================================================
  // 6) العملاء (Customer Reports)
  // ==========================================================================
  async getCustomersReport(query: QueryReportsDto) {
    const [totalCustomers, activeCustomers, cashCustomers, creditCustomers, allCreditCustomers] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.customer.count({ where: { customerType: 'cash', isActive: true } }),
      this.prisma.customer.count({ where: { customerType: 'credit', isActive: true } }),
      this.prisma.customer.findMany({ where: { customerType: 'credit', isActive: true }, select: { currentBalance: true, creditLimit: true } }),
    ]);

    const atOrOverLimitCount = allCreditCustomers.filter((c) => c.currentBalance.gte(c.creditLimit)).length;
    const totalReceivables = await this.computeTotalReceivables();

    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const salesWhere: Prisma.SalesOrderWhereInput = {
      status: { in: VALID_SALES_STATUSES },
      ...(dateRange ? { orderDate: dateRange } : {}),
    };
    const topCustomers = await this.getTopCustomersBySales(salesWhere, 10);

    return {
      summary: { totalCustomers, activeCustomers, cashCustomers, creditCustomers, atOrOverLimitCount, totalReceivables },
      topCustomers,
      accountsReceivableNote:
        'تنبيه دقيق ومتعمَّد: لا يدعم المخطط الحالي "تقادم الفواتير" الحقيقي (تصنيف حسب عمر الفاتورة) لأن الدفعات تُسجَّل على إجمالي الطلب لا على فواتير/بنود مؤرَّخة مستقلة. المعروض هنا هو الرصيد المستحق الحالي الدقيق لكل عميل، وليس تقادمًا مُخترَعًا.',
    };
  }

  private async computeTotalReceivables(): Promise<number> {
    const creditCustomers = await this.prisma.customer.findMany({ where: { customerType: 'credit' }, select: { currentBalance: true } });
    return creditCustomers.reduce((sum, c) => sum + Number(c.currentBalance), 0);
  }

  // ==========================================================================
  // 7) الموردون (Supplier Reports)
  // ==========================================================================
  async getSuppliersReport(query: QueryReportsDto) {
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const where: Prisma.PurchaseOrderWhereInput = {
      status: { in: VALID_PURCHASE_STATUSES_FOR_FINANCE },
      ...(dateRange ? { orderDate: dateRange } : {}),
    };

    const [totalSuppliers, topSuppliers] = await Promise.all([
      this.prisma.supplier.count({ where: { isActive: true } }),
      this.getPurchasesBySupplier(where, 10),
    ]);

    return {
      summary: { totalSuppliers },
      topSuppliers,
      note: 'لا يتتبَّع المخطط الحالي "رصيد مستحق للمورد" (Accounts Payable) — لا يوجد حقل مماثل لـ customers.current_balance على جانب الموردين، فلم يُعرَض لتفادي اختراع بيانات غير موجودة.',
    };
  }

  // ==========================================================================
  // 8) المنتجات (Product Analytics)
  // ==========================================================================
  async getProductsReport(query: QueryReportsDto) {
    const dateRange = this.buildDateRange(query.dateFrom, query.dateTo);
    const salesWhere: Prisma.SalesOrderWhereInput = {
      status: { in: VALID_SALES_STATUSES },
      ...(dateRange ? { orderDate: dateRange } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    };

    const orders = await this.prisma.salesOrder.findMany({
      where: salesWhere,
      select: { items: { select: { productId: true, quantity: true, lineTotal: true, unitCostSnapshot: true } } },
    });

    const byProduct = new Map<string, { quantitySold: number; salesValue: number; cogs: number }>();
    for (const o of orders) {
      for (const item of o.items) {
        const entry = byProduct.get(item.productId) ?? { quantitySold: 0, salesValue: 0, cogs: 0 };
        entry.quantitySold += Number(item.quantity);
        entry.salesValue += Number(item.lineTotal);
        entry.cogs += Number(item.quantity) * Number(item.unitCostSnapshot);
        byProduct.set(item.productId, entry);
      }
    }

    const productFilter: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
    };
    const products = await this.prisma.product.findMany({
      where: Object.keys(productFilter).length > 0 ? productFilter : { id: { in: Array.from(byProduct.keys()) } },
      include: { category: true, brand: true },
    });

    const balances = await this.prisma.inventoryBalance.findMany({
      where: { productId: { in: products.map((p) => p.id) }, ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
    });
    const stockByProduct = new Map<string, { onHand: number; available: number }>();
    for (const b of balances) {
      const entry = stockByProduct.get(b.productId) ?? { onHand: 0, available: 0 };
      entry.onHand += Number(b.quantityOnHand);
      entry.available += Number(b.quantityOnHand) - Number(b.reservedQuantity);
      stockByProduct.set(b.productId, entry);
    }

    // نفس قاعدة "منخفض" المعتمدة في Step 6 بالضبط (available_quantity <=
    // minimum_stock الحقيقي لكل منتج×مخزن) — وليس رقمًا ثابتًا مُخترَعًا
    const settings = await this.prisma.warehouseProductSetting.findMany({
      where: { productId: { in: products.map((p) => p.id) }, isActive: true, ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
    });
    const minStockByProduct = new Map<string, number>();
    for (const s of settings) {
      const current = minStockByProduct.get(s.productId);
      minStockByProduct.set(s.productId, current === undefined ? s.minimumStock : Math.min(current, s.minimumStock));
    }

    const rows = products.map((p) => {
      const sales = byProduct.get(p.id) ?? { quantitySold: 0, salesValue: 0, cogs: 0 };
      const stock = stockByProduct.get(p.id) ?? { onHand: 0, available: 0 };
      const grossProfit = sales.salesValue - sales.cogs;
      const minimumStock = minStockByProduct.get(p.id);
      const isBelowMinimum = minimumStock !== undefined && stock.available <= minimumStock;
      return {
        productId: p.id,
        productCode: p.code,
        productName: p.nameAr,
        categoryName: p.category?.nameAr ?? null,
        brandName: p.brand?.nameAr ?? null,
        quantitySold: sales.quantitySold,
        salesValue: sales.salesValue,
        grossProfit,
        profitMarginPercent: sales.salesValue === 0 ? 0 : (grossProfit / sales.salesValue) * 100,
        currentStock: stock.onHand,
        availableStock: stock.available,
        inventoryValue: stock.onHand * Number(p.averageCost),
        minimumStock: minimumStock ?? null,
        isBelowMinimum,
        isOutOfStock: stock.onHand <= 0,
      };
    });

    return {
      topSelling: [...rows].sort((a, b) => b.salesValue - a.salesValue).slice(0, 10),
      lowStock: rows.filter((r) => r.isBelowMinimum),
      outOfStock: rows.filter((r) => r.isOutOfStock),
      items: rows,
    };
  }

  // ==========================================================================
  // التصدير (Export) — Step 7 §17. يُعيد استخدام نفس دوال التقارير أعلاه
  // بنفس الفلاتر بالضبط (QueryReportsDto نفسه) — لا مسار بيانات منفصل قد
  // يتباعد عن الشاشة المعروضة، ولا خطر تصدير بيانات غير مطابقة للفلاتر
  // المختارة فعليًا في الواجهة (متطلب 17 صراحة).
  // ==========================================================================

  private static readonly EXPORTABLE_TYPES = [
    'sales-trend',
    'sales-top-products',
    'sales-top-customers',
    'profit-trend',
    'inventory-items',
    'inventory-movements',
    'purchases-by-supplier',
    'customers-top',
    'suppliers-top',
    'products-items',
  ] as const;

  static get exportableTypes(): readonly string[] {
    return ReportsService.EXPORTABLE_TYPES;
  }

  async getExportRows(type: string, query: QueryReportsDto): Promise<{ rows: Record<string, unknown>[]; filename: string }> {
    switch (type) {
      case 'sales-trend': {
        const report = await this.getSalesReport(query);
        return { rows: report.trend, filename: 'sales-trend' };
      }
      case 'sales-top-products': {
        const report = await this.getSalesReport(query);
        return { rows: report.topProducts, filename: 'sales-top-products' };
      }
      case 'sales-top-customers': {
        const report = await this.getSalesReport(query);
        return { rows: report.topCustomers, filename: 'sales-top-customers' };
      }
      case 'profit-trend': {
        const report = await this.getProfitReport(query);
        return { rows: report.profitTrend, filename: 'profit-trend' };
      }
      case 'inventory-items': {
        const report = await this.getInventoryReport(query);
        return { rows: report.items, filename: 'inventory-items' };
      }
      case 'inventory-movements': {
        // بلا Pagination هنا عمدًا — التصدير يُصدِّر كل النتائج المطابقة للفلتر
        // (حتى حد أقصى معقول)، بعكس شاشة العرض التفاعلية التي تُصفَّح دائمًا
        const report = await this.getInventoryMovements({ ...query, page: 1, limit: 1000 });
        return { rows: report.items, filename: 'inventory-movements' };
      }
      case 'purchases-by-supplier': {
        const report = await this.getPurchasesReport(query);
        return { rows: report.bySupplier, filename: 'purchases-by-supplier' };
      }
      case 'customers-top': {
        const report = await this.getCustomersReport(query);
        return { rows: report.topCustomers, filename: 'customers-top' };
      }
      case 'suppliers-top': {
        const report = await this.getSuppliersReport(query);
        return { rows: report.topSuppliers, filename: 'suppliers-top' };
      }
      case 'products-items': {
        const report = await this.getProductsReport(query);
        return { rows: report.items, filename: 'products-items' };
      }
      default:
        return { rows: [], filename: 'export' };
    }
  }
}

/** toCsv — تحويل مصفوفة كائنات مسطَّحة إلى نص CSV، مع تهريب آمن للفواصل/الاقتباسات/الأسطر الجديدة */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))];
  return '\uFEFF' + lines.join('\r\n'); // BOM لضمان عرض صحيح للعربية في Excel
}
