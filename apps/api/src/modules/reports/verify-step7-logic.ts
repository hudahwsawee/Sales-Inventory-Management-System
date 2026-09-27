/**
 * verify-step7-logic.ts — نفس منهجية verify-step3/4/5/6-logic.ts. ينسخ
 * حرفيًا خوارزميات ReportsService الجوهرية: فلترة الحالات الصحيحة، أثر
 * المرتجعات على صافي المبيعات وCOGS، حساب الربح الآمن من القسمة على صفر،
 * واستبعاد أوامر الشراء الملغاة.
 */
import * as assert from 'node:assert/strict';

const VALID_SALES_STATUSES = ['approved', 'delivered'];
const VALID_PURCHASE_STATUSES = ['completed', 'partially_received'];

interface SalesOrder { id: string; status: string; totalAmount: number; items: { productId: string; quantity: number; unitCostSnapshot: number; lineTotal: number }[]; }
interface ReturnRow { returnType: string; status: string; referenceSalesOrderId: string; items: { productId: string; quantity: number; unitPrice: number }[]; }
interface PurchaseOrder { status: string; items: { lineTotal: number }[]; }

// === نسخة طبق الأصل من computeSalesSummary (الجزء الجوهري) ===
function computeSalesSummary(orders: SalesOrder[], returns: ReturnRow[]) {
  const validOrders = orders.filter((o) => VALID_SALES_STATUSES.includes(o.status));
  const totalSales = validOrders.reduce((s, o) => s + o.totalAmount, 0);
  const orderCount = validOrders.length;

  const returnsValue = returns
    .filter((r) => r.returnType === 'customer_return' && r.status === 'completed')
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0), 0);

  const netSales = totalSales - returnsValue;
  const averageOrderValue = orderCount === 0 ? 0 : totalSales / orderCount;
  return { totalSales, netSales, orderCount, averageOrderValue, returnsValue };
}

// === نسخة طبق الأصل من computeProfitSummary + computeReturnsProfitImpact ===
function computeProfitSummary(orders: SalesOrder[], returns: ReturnRow[]) {
  const validOrders = orders.filter((o) => VALID_SALES_STATUSES.includes(o.status));
  const revenue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
  const cogsFromSales = validOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity * i.unitCostSnapshot, 0), 0);

  const orderIds = new Set(validOrders.map((o) => o.id));
  const costLookup = new Map<string, number>();
  for (const o of validOrders) for (const i of o.items) costLookup.set(`${o.id}::${i.productId}`, i.unitCostSnapshot);

  let revenueReduction = 0;
  let cogsReduction = 0;
  for (const ret of returns) {
    if (ret.returnType !== 'customer_return' || ret.status !== 'completed' || !orderIds.has(ret.referenceSalesOrderId)) continue;
    for (const item of ret.items) {
      revenueReduction += item.quantity * item.unitPrice;
      cogsReduction += item.quantity * (costLookup.get(`${ret.referenceSalesOrderId}::${item.productId}`) ?? 0);
    }
  }

  const netSales = revenue - revenueReduction;
  const cogs = cogsFromSales - cogsReduction;
  const grossProfit = netSales - cogs;
  const grossProfitMarginPercent = netSales === 0 ? 0 : (grossProfit / netSales) * 100; // === الحماية من القسمة على صفر ===
  return { revenue, netSales, cogs, grossProfit, grossProfitMarginPercent };
}

// === نسخة طبق الأصل من computePurchasesSummary ===
function computePurchasesSummary(orders: PurchaseOrder[]) {
  const validOrders = orders.filter((o) => VALID_PURCHASE_STATUSES.includes(o.status));
  const totalPurchases = validOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.lineTotal, 0), 0);
  return { totalPurchases, orderCount: validOrders.length };
}

// === نسخة طبق الأصل من "عند/فوق الحد الائتماني" (Decimal.gte محاكاة) ===
function countAtOrOverCreditLimit(customers: { currentBalance: number; creditLimit: number }[]): number {
  return customers.filter((c) => c.currentBalance >= c.creditLimit).length;
}

// === نسخة طبق الأصل من compare() — لا Infinity/NaN مضلِّلة أبدًا عند مقارنة الفترات ===
function compare(current: number, previous: number | null) {
  if (previous === null) return { current, previous: null, changeAmount: null, changePercent: null };
  const changeAmount = current - previous;
  const changePercent = previous === 0 ? null : (changeAmount / previous) * 100;
  return { current, previous, changeAmount, changePercent };
}

// === نسخة طبق الأصل من قاعدة "منخفض" المعتمدة في Step 6 (available_quantity، وليس quantity_on_hand فقط) ===
function isLowStock(quantityOnHand: number, reservedQuantity: number, minimumStock: number): boolean {
  return quantityOnHand - reservedQuantity <= minimumStock;
}

// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];
function test(name: string, fn: () => void) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: (e as Error).message }); }
}

test('1) المبيعات الملغاة/المرفوضة/المسودة لا تُحتسَب ضمن إجمالي المبيعات', () => {
  const orders: SalesOrder[] = [
    { id: 'so-1', status: 'approved', totalAmount: 1000, items: [] },
    { id: 'so-2', status: 'delivered', totalAmount: 2000, items: [] },
    { id: 'so-3', status: 'cancelled', totalAmount: 5000, items: [] },
    { id: 'so-4', status: 'draft', totalAmount: 9999, items: [] },
  ];
  const summary = computeSalesSummary(orders, []);
  assert.equal(summary.totalSales, 3000, 'يجب احتساب approved+delivered فقط (1000+2000)');
  assert.equal(summary.orderCount, 2);
});

test('2) المرتجعات المكتملة فقط تُخفِّض صافي المبيعات — الطلبات المعلَّقة/الملغاة لا تُحتسَب', () => {
  const orders: SalesOrder[] = [{ id: 'so-1', status: 'delivered', totalAmount: 10000, items: [] }];
  const returns: ReturnRow[] = [
    { returnType: 'customer_return', status: 'completed', referenceSalesOrderId: 'so-1', items: [{ productId: 'p1', quantity: 2, unitPrice: 500 }] },
    { returnType: 'customer_return', status: 'pending_approval', referenceSalesOrderId: 'so-1', items: [{ productId: 'p1', quantity: 100, unitPrice: 500 }] }, // لم يُكتمَل بعد — يُتجاهَل
  ];
  const summary = computeSalesSummary(orders, returns);
  assert.equal(summary.returnsValue, 1000);
  assert.equal(summary.netSales, 9000);
});

test('3) هامش الربح آمن تمامًا عند صفر مبيعات — لا NaN ولا Infinity', () => {
  const profit = computeProfitSummary([], []);
  assert.equal(profit.netSales, 0);
  assert.equal(profit.grossProfitMarginPercent, 0);
  assert.equal(Number.isFinite(profit.grossProfitMarginPercent), true);
  assert.equal(Number.isNaN(profit.grossProfitMarginPercent), false);
});

test('4) الربح = صافي المبيعات - COGS (باستخدام unit_cost_snapshot الفعلي وقت البيع)', () => {
  const orders: SalesOrder[] = [{ id: 'so-1', status: 'approved', totalAmount: 1000, items: [{ productId: 'p1', quantity: 10, unitCostSnapshot: 40, lineTotal: 1000 }] }];
  const profit = computeProfitSummary(orders, []);
  assert.equal(profit.revenue, 1000);
  assert.equal(profit.cogs, 400);
  assert.equal(profit.grossProfit, 600);
  assert.equal(Math.round(profit.grossProfitMarginPercent * 100) / 100, 60);
});

test('5) مرتجع مكتمل يُخفِّض الإيراد وCOGS معًا بمطابقة التكلفة الأصلية للبيع', () => {
  const orders: SalesOrder[] = [{ id: 'so-1', status: 'delivered', totalAmount: 1000, items: [{ productId: 'p1', quantity: 10, unitCostSnapshot: 40, lineTotal: 1000 }] }];
  const returns: ReturnRow[] = [{ returnType: 'customer_return', status: 'completed', referenceSalesOrderId: 'so-1', items: [{ productId: 'p1', quantity: 3, unitPrice: 100 }] }];
  const profit = computeProfitSummary(orders, returns);
  // الإيراد: 1000 - (3×100) = 700 | COGS: 400 - (3×40) = 280 | الربح: 420
  assert.equal(profit.netSales, 700);
  assert.equal(profit.cogs, 280);
  assert.equal(profit.grossProfit, 420);
});

test('6) أوامر الشراء الملغاة/غير المستلمة لا تُحتسَب ضمن إجمالي المشتريات المالي', () => {
  const orders: PurchaseOrder[] = [
    { status: 'completed', items: [{ lineTotal: 5000 }] },
    { status: 'partially_received', items: [{ lineTotal: 2000 }] },
    { status: 'cancelled', items: [{ lineTotal: 9999 }] },
    { status: 'draft', items: [{ lineTotal: 9999 }] },
    { status: 'pending', items: [{ lineTotal: 9999 }] },
  ];
  const summary = computePurchasesSummary(orders);
  assert.equal(summary.totalPurchases, 7000, 'فقط completed+partially_received (5000+2000)');
  assert.equal(summary.orderCount, 2);
});

test('7) عملاء عند/فوق الحد الائتماني يُحتسَبون بدقة (>=)، وليس فقط تجاوز صارم (>)', () => {
  const customers = [
    { currentBalance: 9999, creditLimit: 10000 }, // دون الحد
    { currentBalance: 10000, creditLimit: 10000 }, // عند الحد بالضبط — يُحتسَب
    { currentBalance: 15000, creditLimit: 10000 }, // تجاوز — يُحتسَب
  ];
  assert.equal(countAtOrOverCreditLimit(customers), 2);
});

test('8) مقارنة الفترات: لا نسبة تغيير مضلِّلة عندما تكون الفترة السابقة صفرًا', () => {
  const result = compare(500, 0);
  assert.equal(result.changePercent, null, 'يجب أن تكون null وليست Infinity');
  assert.equal(result.changeAmount, 500);
});

test('مقارنة الفترات: حساب صحيح عندما تكون الفترة السابقة أكبر من صفر', () => {
  const result = compare(1200, 1000);
  assert.equal(result.changePercent, 20);
});

test('9) قاعدة المخزون المنخفض تعتمد على الكمية المتاحة (بعد خصم المحجوز)، لا الكمية الفعلية فقط', () => {
  // كمية فعلية 50 (تبدو كافية) لكن 45 محجوزة → المتاح 5 فقط، الحد الأدنى 10
  assert.equal(isLowStock(50, 45, 10), true);
  // كمية فعلية 100، محجوز 10 → المتاح 90 > الحد الأدنى 10
  assert.equal(isLowStock(100, 10, 10), false);
});

console.log('\n=== نتائج التشغيل الفعلي (verify-step7-logic.ts) ===\n');
let passCount = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
  if (r.pass) passCount++;
}
console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);
if (passCount !== results.length) process.exit(1);
