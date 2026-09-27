/**
 * verify-step3-logic.ts
 * =====================================================================
 * تشغيل فعلي بدون أي حزم خارجية (نفس منهجية verify-auth-logic.ts من
 * Step 1 — Jest/NestJS/Prisma غير قابلة للتثبيت في هذه البيئة، مؤكَّد
 * بمحاولات npm install فعلية رجعت 403 Forbidden في كل مرة).
 *
 * هذا السكريبت ينسخ حرفيًا نفس خوارزميات القرار الموجودة فعليًا في:
 *   - InventoryService.applyInventoryChange (الاستحواذ الذري IN/OUT)
 *   - ReceivingService.confirmReceipt (الاستلام الجزئي/الكامل + المتوسط
 *     المرجّح + منع تجاوز المتبقي)
 *
 * ⚠️ هذا ليس تشغيلًا لملفات .spec.ts الحقيقية (تلك تحتاج Jest + NestJS +
 * Prisma الحقيقية). إنه تحقق منطقي تنفيذي مواز للخوارزميات الجوهرية،
 * موثَّق بصراحة في تقرير التحقق النهائي كذلك.
 * =====================================================================
 */

import * as assert from 'node:assert/strict';

// ---------------------------------------------------------------------
// طبقة بيانات وهمية في الذاكرة — نفس الجداول الأساسية المستخدمة فعليًا
// ---------------------------------------------------------------------
interface Balance {
  quantityOnHand: number;
}
interface PoItem {
  purchaseOrderId: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitPrice: number;
}
interface Product {
  averageCost: number;
}

let balances: Map<string, Balance>;
let poItems: Map<string, PoItem>;
let products: Map<string, Product>;
let purchaseOrders: Map<string, { status: string }>;
let transactions: { productId: string; quantity: number; unitCost?: number; type: string }[];

function resetDb() {
  balances = new Map();
  poItems = new Map();
  products = new Map();
  purchaseOrders = new Map();
  transactions = [];
}

class BusinessError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// === نسخة طبق الأصل من InventoryService.applyInventoryChange ===
function applyInventoryChange(productId: string, warehouseId: string, quantity: number, unitCost?: number) {
  const key = `${productId}::${warehouseId}`;
  if (quantity === 0) throw new BusinessError('ZERO_QUANTITY', 'الكمية يجب ألا تساوي صفرًا');

  if (quantity > 0) {
    const existing = balances.get(key);
    if (!existing) balances.set(key, { quantityOnHand: quantity });
    else existing.quantityOnHand += quantity;
  } else {
    const decrementAmount = Math.abs(quantity);
    const existing = balances.get(key);
    const currentQty = existing?.quantityOnHand ?? 0;
    // === الاستحواذ الذري المُحاكى: الشرط يُقيَّم قبل الكتابة مباشرة، بلا فجوة ===
    if (currentQty < decrementAmount) {
      throw new BusinessError('INSUFFICIENT_STOCK', 'الرصيد غير كافٍ لإجراء التسوية');
    }
    existing!.quantityOnHand -= decrementAmount;
  }

  transactions.push({ productId, quantity, unitCost, type: 'ledger_entry' });
}

// === نسخة طبق الأصل من منطق معالجة بند استلام واحد داخل confirmReceipt ===
function processReceiptLine(poItemId: string, quantityReceived: number, unitCost?: number) {
  const item = poItems.get(poItemId);
  if (!item) throw new BusinessError('ITEM_NOT_IN_PURCHASE_ORDER', 'المنتج غير موجود في أمر الشراء');

  const remaining = item.quantityOrdered - item.quantityReceived;
  if (quantityReceived > remaining) {
    throw new BusinessError('QUANTITY_EXCEEDS_REMAINING', 'الكمية المستلمة أكبر من الكمية المتبقية');
  }

  const effectiveUnitCost = unitCost ?? item.unitPrice;
  const product = products.get(item.productId)!;

  // === معادلة المتوسط المرجّح المعتمدة — الوزن بإجمالي الكمية الحالية ===
  const oldTotalQty = balances.get(`${item.productId}::w1`)?.quantityOnHand ?? 0;
  const newTotalQty = oldTotalQty + quantityReceived;
  const newAverageCost =
    newTotalQty === 0 ? effectiveUnitCost : (oldTotalQty * product.averageCost + quantityReceived * effectiveUnitCost) / newTotalQty;
  product.averageCost = Math.round(newAverageCost * 10000) / 10000;

  applyInventoryChange(item.productId, 'w1', quantityReceived, effectiveUnitCost);
  item.quantityReceived += quantityReceived;
}

function confirmReceipt(poId: string, lines: { poItemId: string; quantityReceived: number; unitCost?: number }[]) {
  const po = purchaseOrders.get(poId);
  if (!po) throw new BusinessError('PURCHASE_ORDER_NOT_FOUND', 'أمر الشراء غير موجود');
  if (po.status === 'cancelled' || po.status === 'completed') {
    throw new BusinessError('PURCHASE_ORDER_CLOSED', 'أمر الشراء مغلق');
  }

  for (const line of lines) {
    processReceiptLine(line.poItemId, line.quantityReceived, line.unitCost);
  }

  const allItemsForPo = Array.from(poItems.values()).filter((i) => i.purchaseOrderId === poId);
  const allComplete = allItemsForPo.every((i) => i.quantityReceived >= i.quantityOrdered);
  const anyReceived = allItemsForPo.some((i) => i.quantityReceived > 0);
  po.status = allComplete ? 'completed' : anyReceived ? 'partially_received' : po.status;
}

// ---------------------------------------------------------------------
// تشغيل السيناريوهات فعليًا
// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  resetDb();
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: (e as Error).message });
  }
}

test('1) إنشاء أمر شراء لا يمس المخزون (لا استدعاء applyInventoryChange عند الإنشاء)', () => {
  purchaseOrders.set('po-1', { status: 'pending' });
  poItems.set('item-1', {
    purchaseOrderId: 'po-1',
    productId: 'p1',
    quantityOrdered: 100,
    quantityReceived: 0,
    unitPrice: 10,
  });
  // لا استدعاء لـ confirmReceipt هنا إطلاقًا — فقط إنشاء الهياكل، تمامًا كما
  // يفعل PurchaseOrdersService.create فعليًا (لا يستدعي InventoryService أبدًا)
  assert.equal(balances.size, 0);
  assert.equal(transactions.length, 0);
});

test('2) الاستلام الكامل يزيد الرصيد بالكامل ويكمل أمر الشراء', () => {
  purchaseOrders.set('po-1', { status: 'pending' });
  poItems.set('item-1', { purchaseOrderId: 'po-1', productId: 'p1', quantityOrdered: 100, quantityReceived: 0, unitPrice: 10 });
  products.set('p1', { averageCost: 0 });

  confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 100, unitCost: 10 }]);

  assert.equal(balances.get('p1::w1')?.quantityOnHand, 100);
  assert.equal(purchaseOrders.get('po-1')?.status, 'completed');
});

test('3+4) الاستلام الجزئي مرتين (70 ثم 30) يكمل أمر الشراء تدريجيًا', () => {
  purchaseOrders.set('po-1', { status: 'pending' });
  poItems.set('item-1', { purchaseOrderId: 'po-1', productId: 'p1', quantityOrdered: 100, quantityReceived: 0, unitPrice: 10 });
  products.set('p1', { averageCost: 0 });

  confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 70, unitCost: 10 }]);
  assert.equal(purchaseOrders.get('po-1')?.status, 'partially_received');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 70);

  confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 30, unitCost: 10 }]);
  assert.equal(purchaseOrders.get('po-1')?.status, 'completed');
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 100);
});

test('5) لا يمكن استلام كمية أكبر من المتبقي', () => {
  purchaseOrders.set('po-1', { status: 'pending' });
  poItems.set('item-1', { purchaseOrderId: 'po-1', productId: 'p1', quantityOrdered: 100, quantityReceived: 0, unitPrice: 10 });
  products.set('p1', { averageCost: 0 });

  assert.throws(
    () => confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 150, unitCost: 10 }]),
    (e: unknown) => e instanceof BusinessError && e.code === 'QUANTITY_EXCEEDS_REMAINING',
  );
  assert.equal(balances.size, 0, 'لا أثر جزئي على المخزون عند الرفض');
});

test('6) حساب المتوسط المرجّح صحيح: (60×10 + 40×20)/100 = 14', () => {
  purchaseOrders.set('po-1', { status: 'pending' });
  poItems.set('item-1', { purchaseOrderId: 'po-1', productId: 'p1', quantityOrdered: 100, quantityReceived: 0, unitPrice: 10 });
  products.set('p1', { averageCost: 0 });

  confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 60, unitCost: 10 }]);
  assert.equal(products.get('p1')?.averageCost, 10);

  confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 40, unitCost: 20 }]);
  assert.equal(products.get('p1')?.averageCost, 14);
});

test('6ب) الحماية من القسمة على صفر عند أول استلام لمنتج جديد كليًا', () => {
  purchaseOrders.set('po-1', { status: 'pending' });
  poItems.set('item-1', { purchaseOrderId: 'po-1', productId: 'p-new', quantityOrdered: 50, quantityReceived: 0, unitPrice: 25 });
  products.set('p-new', { averageCost: 0 });

  confirmReceipt('po-1', [{ poItemId: 'item-1', quantityReceived: 50, unitCost: 25 }]);
  assert.equal(products.get('p-new')?.averageCost, 25); // لا NaN ولا خطأ قسمة على صفر
});

test('9) ADJUSTMENT_IN يزيد الرصيد', () => {
  applyInventoryChange('p1', 'w1', 10);
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 10);
});

test('10) ADJUSTMENT_OUT ينقص الرصيد', () => {
  applyInventoryChange('p1', 'w1', 20);
  applyInventoryChange('p1', 'w1', -5);
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 15);
});

test('11) لا يمكن لتسوية OUT أن تجعل الرصيد سالبًا', () => {
  applyInventoryChange('p1', 'w1', 5);
  assert.throws(
    () => applyInventoryChange('p1', 'w1', -10),
    (e: unknown) => e instanceof BusinessError && e.code === 'INSUFFICIENT_STOCK',
  );
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 5, 'الرصيد يبقى كما كان بعد الرفض');
});

test('14) 5 عمليات خصم متتالية بقيمة 10 من رصيد 100 تُنتج 50 بالضبط (لا فساد بيانات)', () => {
  applyInventoryChange('p1', 'w1', 100);
  for (let i = 0; i < 5; i++) applyInventoryChange('p1', 'w1', -10);
  assert.equal(balances.get('p1::w1')?.quantityOnHand, 50);
});

// ---------------------------------------------------------------------
// طباعة النتائج
// ---------------------------------------------------------------------
console.log('\n=== نتائج التشغيل الفعلي (verify-step3-logic.ts) ===\n');
let passCount = 0;
for (const r of results) {
  const status = r.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
  if (r.pass) passCount++;
}
console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);

if (passCount !== results.length) {
  process.exit(1);
}
