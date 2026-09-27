/**
 * verify-step5-logic.ts — نفس منهجية verify-step3-logic.ts وverify-step4-logic.ts.
 * ينسخ حرفيًا خوارزميات: ReturnsService.create/submit/complete وgetEligibleQuantity،
 * وApprovalsService.decide بما فيها حارس RETURN_NO_LONGER_PENDING.
 */
import * as assert from 'node:assert/strict';

interface Balance { quantityOnHand: number; }
interface ReturnRow { id: string; returnType: 'customer_return' | 'supplier_return'; status: string; referenceOrderId: string; items: { productId: string; quantity: number }[]; }

let balances: Map<string, Balance>;
let returns: Map<string, ReturnRow>;
let salesOrderQty: Map<string, number>; // key = orderId::productId
let purchaseReceivedQty: Map<string, number>;
let transactions: { quantity: number; type: string }[];

function resetDb() {
  balances = new Map();
  returns = new Map();
  salesOrderQty = new Map();
  purchaseReceivedQty = new Map();
  transactions = [];
}

class BizError extends Error {
  constructor(public code: string, msg: string) { super(msg); }
}

// === نسخة طبق الأصل من ReturnsService.getEligibleQuantity ===
function getEligibleQuantity(returnType: 'customer_return' | 'supplier_return', productId: string, referenceOrderId: string, excludeReturnId?: string): number {
  const originalQty =
    returnType === 'customer_return'
      ? salesOrderQty.get(`${referenceOrderId}::${productId}`) ?? 0
      : purchaseReceivedQty.get(`${referenceOrderId}::${productId}`) ?? 0;

  let alreadyReturned = 0;
  for (const r of returns.values()) {
    if (r.returnType !== returnType || r.status !== 'completed' || r.referenceOrderId !== referenceOrderId) continue;
    if (excludeReturnId && r.id === excludeReturnId) continue;
    for (const item of r.items) {
      if (item.productId === productId) alreadyReturned += item.quantity;
    }
  }
  return originalQty - alreadyReturned;
}

// === نسخة طبق الأصل من ReturnsService.create (تبسيط: بند واحد) ===
function createReturn(id: string, returnType: 'customer_return' | 'supplier_return', referenceOrderId: string, productId: string, quantity: number) {
  const eligible = getEligibleQuantity(returnType, productId, referenceOrderId);
  if (quantity > eligible) throw new BizError('RETURN_QUANTITY_EXCEEDS_ELIGIBLE', 'يتجاوز الكمية المؤهَّلة');
  returns.set(id, { id, returnType, status: 'draft', referenceOrderId, items: [{ productId, quantity }] });
}

// === نسخة طبق الأصل من ReturnsService.submit ===
function submitReturn(id: string) {
  const r = returns.get(id)!;
  if (r.status !== 'draft') throw new BizError('RETURN_NOT_DRAFT', 'ليس Draft');
  r.status = 'pending_approval';
}

// === نسخة طبق الأصل من ApprovalsService.decide (مبسَّطة لسياق المرتجعات فقط) ===
function decideApproval(returnId: string, decision: 'approved' | 'rejected') {
  const r = returns.get(returnId)!;
  // === حارس الأمان المطابق تمامًا لـ ApprovalsService.decide ===
  if (r.status !== 'pending_approval') {
    throw new BizError('RETURN_NO_LONGER_PENDING', 'حالة المرتجع تغيّرت منذ تقديم طلب الموافقة');
  }
  r.status = decision === 'approved' ? 'approved' : 'cancelled';
}

// === نسخة طبق الأصل من InventoryService.applyInventoryChange (الجزء ذو الصلة) ===
function applyInventoryChange(productId: string, warehouseId: string, quantity: number) {
  const key = `${productId}::${warehouseId}`;
  if (quantity > 0) {
    const b = balances.get(key) ?? { quantityOnHand: 0 };
    b.quantityOnHand += quantity;
    balances.set(key, b);
  } else {
    const decrementAmount = Math.abs(quantity);
    const b = balances.get(key);
    if (!b || b.quantityOnHand < decrementAmount) throw new BizError('INSUFFICIENT_STOCK', 'الرصيد غير كافٍ');
    b.quantityOnHand -= decrementAmount;
  }
}

// === نسخة طبق الأصل من ReturnsService.complete (الاستحواذ الذري أولًا) ===
function completeReturn(id: string, warehouseId: string) {
  const r = returns.get(id)!;
  if (r.status !== 'approved') throw new BizError('RETURN_NOT_COMPLETABLE', 'غير قابل للإتمام');
  r.status = 'completed'; // === الاستحواذ الذري المُحاكى: claim أولًا، قبل أي أثر فعلي ===

  for (const item of r.items) {
    // إعادة تحقق دفاعية عند الإتمام، تستثني هذا المرتجع نفسه
    const eligible = getEligibleQuantity(r.returnType, item.productId, r.referenceOrderId, r.id);
    if (item.quantity > eligible) throw new BizError('RETURN_QUANTITY_EXCEEDS_ELIGIBLE', 'تغيّرت الأهلية منذ الإنشاء');

    if (r.returnType === 'customer_return') {
      applyInventoryChange(item.productId, warehouseId, item.quantity);
      transactions.push({ quantity: item.quantity, type: 'customer_return' });
    } else {
      applyInventoryChange(item.productId, warehouseId, -item.quantity);
      transactions.push({ quantity: -item.quantity, type: 'supplier_return' });
    }
  }
}

// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];
function test(name: string, fn: () => void) {
  resetDb();
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: (e as Error).message }); }
}

test('مرتجع عميل صحيح: الإنشاء → التقديم → الموافقة → الإتمام يزيد المخزون فعليًا', () => {
  salesOrderQty.set('so-1::p1', 10);
  createReturn('ret-1', 'customer_return', 'so-1', 'p1', 3);
  submitReturn('ret-1');
  decideApproval('ret-1', 'approved');
  completeReturn('ret-1', 'w1');

  assert.equal(returns.get('ret-1')?.status, 'completed');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 3);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].type, 'customer_return');
});

test('مرتجع يتجاوز الكمية المؤهَّلة (المُسلَّمة أصلًا) يُرفض عند الإنشاء', () => {
  salesOrderQty.set('so-1::p1', 10);
  assert.throws(() => createReturn('ret-1', 'customer_return', 'so-1', 'p1', 15), (e: unknown) => e instanceof BizError && e.code === 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE');
});

test('لا يمكن إتمام نفس المرتجع مرتين — الأثر على المخزون لا يتكرر', () => {
  salesOrderQty.set('so-1::p1', 10);
  createReturn('ret-1', 'customer_return', 'so-1', 'p1', 3);
  returns.get('ret-1')!.status = 'approved'; // تخطي submit/decide لتبسيط الاختبار
  completeReturn('ret-1', 'w1');
  assert.throws(() => completeReturn('ret-1', 'w1'), (e: unknown) => e instanceof BizError && e.code === 'RETURN_NOT_COMPLETABLE');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 3, 'لم يتضاعف');
  assert.equal(transactions.length, 1, 'حركة واحدة فقط');
});

test('مرتجع مورد صحيح ينقص المخزون فعليًا عند الإتمام', () => {
  purchaseReceivedQty.set('po-1::p1', 20);
  balances.set('p1::w1', { quantityOnHand: 20 });
  createReturn('ret-1', 'supplier_return', 'po-1', 'p1', 5);
  returns.get('ret-1')!.status = 'approved';
  completeReturn('ret-1', 'w1');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 15);
  assert.equal(transactions[0].type, 'supplier_return');
  assert.equal(transactions[0].quantity, -5);
});

test('مرتجع مورد لا يمكن أن يجعل الرصيد سالبًا', () => {
  purchaseReceivedQty.set('po-1::p1', 20);
  balances.set('p1::w1', { quantityOnHand: 2 }); // رصيد فعلي أقل من المُراد إرجاعه رغم أنه مؤهَّل نظريًا
  createReturn('ret-1', 'supplier_return', 'po-1', 'p1', 5);
  returns.get('ret-1')!.status = 'approved';
  assert.throws(() => completeReturn('ret-1', 'w1'), (e: unknown) => e instanceof BizError && e.code === 'INSUFFICIENT_STOCK');
});

test('حارس الموافقة: مرتجع أُلغي مباشرة أثناء انتظار الموافقة لا يُعاد إحياؤه بقرار متأخر', () => {
  salesOrderQty.set('so-1::p1', 10);
  createReturn('ret-1', 'customer_return', 'so-1', 'p1', 3);
  submitReturn('ret-1');
  returns.get('ret-1')!.status = 'cancelled'; // إلغاء مباشر بينما طلب الموافقة لا يزال معلَّقًا
  assert.throws(() => decideApproval('ret-1', 'approved'), (e: unknown) => e instanceof BizError && e.code === 'RETURN_NO_LONGER_PENDING');
  assert.equal(returns.get('ret-1')?.status, 'cancelled', 'لم يتحول إلى approved خطأً');
});

test('مرتجعان متتاليان: الثاني يُحسَب بشكل صحيح على أساس المتبقي بعد الأول', () => {
  salesOrderQty.set('so-1::p1', 10);
  createReturn('ret-1', 'customer_return', 'so-1', 'p1', 6);
  returns.get('ret-1')!.status = 'approved';
  completeReturn('ret-1', 'w1');

  // المتبقي المؤهَّل الآن = 10 - 6 = 4
  assert.throws(() => createReturn('ret-2', 'customer_return', 'so-1', 'p1', 5), (e: unknown) => e instanceof BizError && e.code === 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE');
  createReturn('ret-2', 'customer_return', 'so-1', 'p1', 4); // يساوي المتبقي بالضبط — يجب أن ينجح
  assert.ok(returns.has('ret-2'));
});

console.log('\n=== نتائج التشغيل الفعلي (verify-step5-logic.ts) ===\n');
let passCount = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
  if (r.pass) passCount++;
}
console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);
if (passCount !== results.length) process.exit(1);
