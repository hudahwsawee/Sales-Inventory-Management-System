/**
 * verify-step6-logic.ts — نفس منهجية verify-step3/4/5-logic.ts. ينسخ
 * حرفيًا خوارزميات: InventoryService.notifyIfLowStock (available_quantity
 * + Dedup)، SalesOrdersService.checkCreditLimitAndNotify، وPurchaseOrdersService.checkOverdueAndNotify.
 */
import * as assert from 'node:assert/strict';

interface Balance { quantityOnHand: number; reservedQuantity: number; }
interface Setting { minimumStock: number; }

let balances: Map<string, Balance>;
let settings: Map<string, Setting>;
let notifications: { type: string; referenceId: string; isRead: boolean }[];

function resetDb() {
  balances = new Map();
  settings = new Map();
  notifications = [];
}

// === نسخة طبق الأصل من InventoryService.notifyIfLowStock (بعد تحديث Step 6) ===
function notifyIfLowStock(productId: string, warehouseId: string) {
  const key = `${productId}::${warehouseId}`;
  const setting = settings.get(key);
  if (!setting) return;

  const balance = balances.get(key);
  if (!balance) return;

  const availableQuantity = balance.quantityOnHand - balance.reservedQuantity;
  if (availableQuantity > setting.minimumStock) return; // القاعدة: available_quantity <= minimum_stock

  const existingActiveAlert = notifications.find((n) => n.type === 'low_stock' && n.referenceId === key && !n.isRead);
  if (existingActiveAlert) return; // منع التكرار

  notifications.push({ type: 'low_stock', referenceId: key, isRead: false });
}

// === نسخة طبق الأصل من SalesOrdersService.checkCreditLimitAndNotify ===
// (يُحاكي Prisma.Decimal.gte عبر دالة مقارنة صريحة، بلا تحويل float ضمني)
function decimalGte(a: number, b: number): boolean {
  return a >= b; // في الكود الحقيقي: Prisma.Decimal.gte() — هنا محاكاة مبسَّطة للمقارنة نفسها فقط
}

function checkCreditLimitAndNotify(customerId: string, currentBalance: number, creditLimit: number) {
  if (!decimalGte(currentBalance, creditLimit)) return;

  const existingActiveAlert = notifications.find((n) => n.type === 'credit_limit_exceeded' && n.referenceId === customerId && !n.isRead);
  if (existingActiveAlert) return; // منع التكرار

  notifications.push({ type: 'credit_limit_exceeded', referenceId: customerId, isRead: false });
}

// === نسخة طبق الأصل من PurchaseOrdersService.checkOverdueAndNotify ===
function checkOverdueAndNotify(pos: { id: string; status: string; expectedDeliveryDate: Date }[], now: Date) {
  const openStatuses = ['draft', 'pending', 'partially_received'];
  const overdue = pos.filter((po) => openStatuses.includes(po.status) && po.expectedDeliveryDate.getTime() < now.getTime());

  for (const po of overdue) {
    const existingActiveAlert = notifications.find((n) => n.type === 'po_delayed' && n.referenceId === po.id && !n.isRead);
    if (existingActiveAlert) continue; // منع التكرار
    notifications.push({ type: 'po_delayed', referenceId: po.id, isRead: false });
  }
  return overdue;
}

// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];
function test(name: string, fn: () => void) {
  resetDb();
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: (e as Error).message }); }
}

test('1) اكتشاف المخزون المنخفض يعتمد على available_quantity وليس quantity_on_hand فقط', () => {
  // كمية فعلية 50 (تبدو كافية) لكن 45 محجوزة → المتاح 5 فقط، الحد الأدنى 10
  settings.set('p1::w1', { minimumStock: 10 });
  balances.set('p1::w1', { quantityOnHand: 50, reservedQuantity: 45 });

  notifyIfLowStock('p1', 'w1');

  assert.equal(notifications.length, 1, 'يجب أن يُنشأ تنبيه رغم أن quantity_on_hand (50) أعلى بكثير من الحد الأدنى');
});

test('لا تنبيه إن كانت الكمية المتاحة أعلى من الحد الأدنى، حتى مع حجز كبير', () => {
  settings.set('p1::w1', { minimumStock: 10 });
  balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 50 }); // المتاح = 50 > 10

  notifyIfLowStock('p1', 'w1');

  assert.equal(notifications.length, 0);
});

test('2) منع التكرار: استدعاءان متتاليان لنفس الرصيد المنخفض يُنتجان تنبيهًا واحدًا فقط', () => {
  settings.set('p1::w1', { minimumStock: 10 });
  balances.set('p1::w1', { quantityOnHand: 5, reservedQuantity: 0 });

  notifyIfLowStock('p1', 'w1'); // مثال: عملية بيع أولى
  notifyIfLowStock('p1', 'w1'); // مثال: عملية بيع ثانية قبل معالجة التنبيه الأول
  notifyIfLowStock('p1', 'w1'); // وثالثة

  assert.equal(notifications.length, 1, 'تكرار الاستدعاء لا يجب أن يُنتج أكثر من تنبيه نشط واحد');
});

test('3) قاعدة الحد الائتماني: تنبيه عند الوصول للحد أو تجاوزه', () => {
  checkCreditLimitAndNotify('cust-1', 10000, 10000); // عند الحد بالضبط
  assert.equal(notifications.length, 1);

  resetDb();
  checkCreditLimitAndNotify('cust-2', 15000, 10000); // تجاوز
  assert.equal(notifications.length, 1);

  resetDb();
  checkCreditLimitAndNotify('cust-3', 9999, 10000); // دون الحد
  assert.equal(notifications.length, 0);
});

test('منع تكرار تنبيه الحد الائتماني لنفس العميل', () => {
  checkCreditLimitAndNotify('cust-1', 12000, 10000);
  checkCreditLimitAndNotify('cust-1', 13000, 10000); // طلب آجل آخر لاحقًا، لا يزال متجاوزًا
  assert.equal(notifications.length, 1);
});

test('4) اكتشاف أوامر الشراء المتأخرة: أمر مفتوح تجاوز تاريخ التوريد المتوقع', () => {
  const now = new Date('2026-01-20');
  const pos = [
    { id: 'po-1', status: 'pending', expectedDeliveryDate: new Date('2026-01-15') }, // متأخر 5 أيام
    { id: 'po-2', status: 'completed', expectedDeliveryDate: new Date('2026-01-10') }, // مكتمل — لا يُحتسَب
    { id: 'po-3', status: 'pending', expectedDeliveryDate: new Date('2026-01-25') }, // لم يحن موعده بعد
  ];

  const overdue = checkOverdueAndNotify(pos, now);

  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].id, 'po-1');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].referenceId, 'po-1');
});

test('منع تكرار تنبيه أمر الشراء المتأخر عبر استدعاءات متتالية', () => {
  const now = new Date('2026-01-20');
  const pos = [{ id: 'po-1', status: 'pending', expectedDeliveryDate: new Date('2026-01-15') }];

  checkOverdueAndNotify(pos, now); // فحص أول (مثال: تحميل Dashboard مرة)
  checkOverdueAndNotify(pos, now); // فحص ثانٍ (تحميل Dashboard مرة أخرى قبل قراءة التنبيه الأول)

  assert.equal(notifications.length, 1, 'لا يجب أن يتكرر تنبيه نفس أمر الشراء المتأخر مع كل تحميل للوحة');
});

console.log('\n=== نتائج التشغيل الفعلي (verify-step6-logic.ts) ===\n');
let passCount = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
  if (r.pass) passCount++;
}
console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);
if (passCount !== results.length) process.exit(1);
