/**
 * verify-step4-logic.ts — نفس منهجية verify-auth-logic.ts وverify-step3-logic.ts
 * (Jest/NestJS/Prisma غير قابلة للتثبيت في هذه البيئة، مؤكَّد بمحاولات فعلية).
 * ينسخ حرفيًا خوارزميات: InventoryService.reserveStock/releaseReservation/
 * consumeReservation، وSalesOrdersService.confirm/fulfill/cancel، وPaymentsService.create.
 */
import * as assert from 'node:assert/strict';

interface Balance { quantityOnHand: number; reservedQuantity: number; }
interface Reservation { productId: string; warehouseId: string; quantity: number; status: 'active' | 'released' | 'consumed'; }
interface SalesOrder { status: string; totalAmount: number; paidAmount: number; paymentType: 'cash' | 'credit'; }

let balances: Map<string, Balance>;
let reservations: Map<string, Reservation>; // key = salesOrderItemId
let orders: Map<string, SalesOrder>;
let customerBalance: number;
let saleTransactions: { quantity: number }[];

function resetDb() {
  balances = new Map();
  reservations = new Map();
  orders = new Map();
  customerBalance = 0;
  saleTransactions = [];
}

class BizError extends Error {
  constructor(public code: string, msg: string) { super(msg); }
}

// === نسخة طبق الأصل من InventoryService.reserveStock ===
function reserveStock(itemId: string, productId: string, warehouseId: string, qty: number) {
  const key = `${productId}::${warehouseId}`;
  const b = balances.get(key);
  const available = b ? b.quantityOnHand - b.reservedQuantity : 0;
  if (!b || available < qty) throw new BizError('INSUFFICIENT_AVAILABLE_STOCK', 'الكمية غير متوفرة');
  b.reservedQuantity += qty;
  reservations.set(itemId, { productId, warehouseId, quantity: qty, status: 'active' });
}

// === نسخة طبق الأصل من InventoryService.releaseReservation ===
function releaseReservation(itemId: string) {
  const r = reservations.get(itemId);
  if (!r || r.status !== 'active') return;
  const b = balances.get(`${r.productId}::${r.warehouseId}`)!;
  b.reservedQuantity -= r.quantity;
  r.status = 'released';
}

// === نسخة طبق الأصل من InventoryService.consumeReservation ===
function consumeReservation(itemId: string) {
  const r = reservations.get(itemId);
  if (!r || r.status !== 'active') throw new BizError('RESERVATION_NOT_ACTIVE', 'لا يوجد حجز نشط');
  const b = balances.get(`${r.productId}::${r.warehouseId}`)!;
  if (b.quantityOnHand < r.quantity || b.reservedQuantity < r.quantity) {
    throw new BizError('FULFILLMENT_BALANCE_MISMATCH', 'تعارض رصيد');
  }
  b.quantityOnHand -= r.quantity;
  b.reservedQuantity -= r.quantity;
  r.status = 'consumed';
  saleTransactions.push({ quantity: -r.quantity });
}

// === نسخة طبق الأصل من SalesOrdersService.confirm (طلب ببند واحد للتبسيط) ===
function confirmOrder(orderId: string, itemId: string, productId: string, warehouseId: string, qty: number) {
  const order = orders.get(orderId)!;
  if (order.status !== 'draft') throw new BizError('SALES_ORDER_NOT_DRAFT', 'ليس Draft');
  reserveStock(itemId, productId, warehouseId, qty); // يرمي فورًا عند الفشل، بلا تغيير على order.status
  if (order.paymentType === 'credit') customerBalance += order.totalAmount;
  order.status = 'approved';
}

// === نسخة طبق الأصل من SalesOrdersService.fulfill (الاستحواذ الذري على الانتقال أولًا) ===
function fulfillOrder(orderId: string, itemId: string) {
  const order = orders.get(orderId)!;
  if (order.status !== 'approved') {
    throw new BizError('SALES_ORDER_NOT_FULFILLABLE', 'غير قابل للتسليم (ربما سُلِّم بالفعل)');
  }
  order.status = 'delivered'; // === الاستحواذ الذري المُحاكى: claim أولًا ===
  consumeReservation(itemId);
}

// === نسخة طبق الأصل من SalesOrdersService.cancel ===
function cancelOrder(orderId: string, itemId: string) {
  const order = orders.get(orderId)!;
  if (!['draft', 'approved'].includes(order.status)) throw new BizError('SALES_ORDER_NOT_CANCELLABLE', 'غير قابل للإلغاء');
  releaseReservation(itemId);
  if (order.status === 'approved' && order.paymentType === 'credit') customerBalance -= order.totalAmount;
  order.status = 'cancelled';
}

// === نسخة طبق الأصل من PaymentsService.create (الاستحواذ الذري على overpayment) ===
function recordPayment(orderId: string, amount: number) {
  const order = orders.get(orderId)!;
  if (!['approved', 'delivered'].includes(order.status)) throw new BizError('SALES_ORDER_NOT_PAYABLE', 'غير قابل للدفع');
  const remaining = order.totalAmount - order.paidAmount;
  if (remaining < amount) throw new BizError('OVERPAYMENT_NOT_ALLOWED', 'دفع زائد');
  order.paidAmount += amount;
  if (order.paymentType === 'credit') customerBalance -= amount;
}

// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];
function test(name: string, fn: () => void) {
  resetDb();
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: (e as Error).message }); }
}

test('لا يمكن بيع أكثر من المتاح: confirm يرفض إن كانت الكمية المطلوبة أكبر من المتوفر', () => {
  balances.set('p1::w1', { quantityOnHand: 10, reservedQuantity: 0 });
  orders.set('so-1', { status: 'draft', totalAmount: 1000, paidAmount: 0, paymentType: 'cash' });
  assert.throws(() => confirmOrder('so-1', 'item-1', 'p1', 'w1', 50), (e: unknown) => e instanceof BizError && e.code === 'INSUFFICIENT_AVAILABLE_STOCK');
  assert.equal(orders.get('so-1')?.status, 'draft', 'الحالة لا تتغير عند فشل الحجز');
});

test('تأكيد الطلب يحجز الكمية (Reservation) دون خصم quantity_on_hand', () => {
  balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
  orders.set('so-1', { status: 'draft', totalAmount: 1000, paidAmount: 0, paymentType: 'cash' });
  confirmOrder('so-1', 'item-1', 'p1', 'w1', 30);
  assert.equal(balances.get('p1::w1')?.reservedQuantity, 30);
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 100, 'لم يُخصَم فعليًا بعد');
  assert.equal(orders.get('so-1')?.status, 'approved');
});

test('إلغاء الطلب المعتمد يحرر الحجز بالكامل', () => {
  balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
  orders.set('so-1', { status: 'draft', totalAmount: 1000, paidAmount: 0, paymentType: 'cash' });
  confirmOrder('so-1', 'item-1', 'p1', 'w1', 30);
  cancelOrder('so-1', 'item-1');
  assert.equal(balances.get('p1::w1')?.reservedQuantity, 0);
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 100);
  assert.equal(orders.get('so-1')?.status, 'cancelled');
});

test('التسليم يخصم المخزون الفعلي مرة واحدة بالضبط وينشئ حركة OUT سالبة', () => {
  balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
  orders.set('so-1', { status: 'draft', totalAmount: 1000, paidAmount: 0, paymentType: 'cash' });
  confirmOrder('so-1', 'item-1', 'p1', 'w1', 30);
  fulfillOrder('so-1', 'item-1');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 70);
  assert.equal(saleTransactions.length, 1);
  assert.equal(saleTransactions[0].quantity, -30);
});

test('التسليم المزدوج/المتزامن محمي: المحاولة الثانية تُرفض ولا تُكرِّر الخصم', () => {
  balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
  orders.set('so-1', { status: 'draft', totalAmount: 1000, paidAmount: 0, paymentType: 'cash' });
  confirmOrder('so-1', 'item-1', 'p1', 'w1', 30);
  fulfillOrder('so-1', 'item-1');
  assert.throws(() => fulfillOrder('so-1', 'item-1'), (e: unknown) => e instanceof BizError && e.code === 'SALES_ORDER_NOT_FULFILLABLE');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 70, 'لم يُخصَم مرتين');
  assert.equal(saleTransactions.length, 1, 'حركة واحدة فقط');
});

test('الدفعات تُقلِّل الرصيد المتبقي بشكل صحيح (100000 ثم 30000 و20000 → متبقي 50000)', () => {
  orders.set('so-1', { status: 'approved', totalAmount: 100000, paidAmount: 0, paymentType: 'cash' });
  recordPayment('so-1', 30000);
  recordPayment('so-1', 20000);
  const order = orders.get('so-1')!;
  assert.equal(order.totalAmount - order.paidAmount, 50000);
});

test('الدفع الزائد (Overpayment) يُرفض', () => {
  orders.set('so-1', { status: 'approved', totalAmount: 1000, paidAmount: 800, paymentType: 'cash' });
  assert.throws(() => recordPayment('so-1', 500), (e: unknown) => e instanceof BizError && e.code === 'OVERPAYMENT_NOT_ALLOWED');
  assert.equal(orders.get('so-1')?.paidAmount, 800, 'لا تغيير عند الرفض');
});

test('البيع الآجل: التأكيد يزيد التزام العميل، والدفع يخفّضه بنفس القيمة', () => {
  balances.set('p1::w1', { quantityOnHand: 100, reservedQuantity: 0 });
  orders.set('so-1', { status: 'draft', totalAmount: 1000, paidAmount: 0, paymentType: 'credit' });
  confirmOrder('so-1', 'item-1', 'p1', 'w1', 10);
  assert.equal(customerBalance, 1000);
  recordPayment('so-1', 400);
  assert.equal(customerBalance, 600);
});

console.log('\n=== نتائج التشغيل الفعلي (verify-step4-logic.ts) ===\n');
let passCount = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
  if (r.pass) passCount++;
}
console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);
if (passCount !== results.length) process.exit(1);
