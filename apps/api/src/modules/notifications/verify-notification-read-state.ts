/**
 * verify-notification-read-state.ts — نفس منهجية verify-step*-logic.ts.
 * ينسخ حرفيًا خوارزمية NotificationsService المُصلَحة: رؤية OR (شخصي +
 * دور + صلاحية تشغيلية) وحالة قراءة عبر NotificationRead المستقلة لكل مستخدم.
 */
import * as assert from 'node:assert/strict';

interface Notification { id: string; userId: string | null; roleId: string | null; type: string; }

const OPERATIONAL_ALERT_PERMISSION_MAP: Record<string, string> = {
  low_stock: 'inventory.view',
  approval_needed: 'approvals.view',
  credit_limit_exceeded: 'customers.view',
  po_delayed: 'purchasing.view',
};

let notifications: Map<string, Notification>;
let userRoles: Map<string, Set<string>>;
let reads: Set<string>; // `${notificationId}::${userId}`

function resetDb() {
  notifications = new Map();
  userRoles = new Map();
  reads = new Set();
}

// === نسخة طبق الأصل من NotificationsService.buildVisibilityOr + findAllForCurrentUser ===
function findVisibleFor(userId: string, permissions: string[]): (Notification & { isRead: boolean })[] {
  const roleIds = userRoles.get(userId) ?? new Set();
  const eligibleTypes = Object.entries(OPERATIONAL_ALERT_PERMISSION_MAP)
    .filter(([, perm]) => permissions.includes(perm))
    .map(([t]) => t);

  const visible = Array.from(notifications.values()).filter((n) => {
    if (n.userId === userId) return true;
    if (n.roleId && roleIds.has(n.roleId)) return true;
    if (n.roleId && eligibleTypes.includes(n.type)) return true; // === الإصلاح: رؤية عبر الصلاحية ===
    return false;
  });

  return visible.map((n) => ({ ...n, isRead: reads.has(`${n.id}::${userId}`) }));
}

function markRead(notificationId: string, userId: string) {
  reads.add(`${notificationId}::${userId}`);
}

function markAllRead(userId: string, permissions: string[]) {
  const visible = findVisibleFor(userId, permissions);
  for (const n of visible) reads.add(`${n.id}::${userId}`);
}

function getUnreadCount(userId: string, permissions: string[]): number {
  return findVisibleFor(userId, permissions).filter((n) => !n.isRead).length;
}

// ---------------------------------------------------------------------
type TestResult = { name: string; pass: boolean; error?: string };
const results: TestResult[] = [];
function test(name: string, fn: () => void) {
  resetDb();
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: (e as Error).message }); }
}

test('1) قراءة مستخدم واحد لإشعار دور مشترك لا تؤثر على مستخدم آخر في نفس الدور', () => {
  userRoles.set('u1', new Set(['SALES']));
  userRoles.set('u2', new Set(['SALES']));
  notifications.set('n1', { id: 'n1', userId: null, roleId: 'SALES', type: 'order_rejected' });

  markRead('n1', 'u1');

  assert.equal(findVisibleFor('u1', []).find((n) => n.id === 'n1')?.isRead, true);
  assert.equal(findVisibleFor('u2', []).find((n) => n.id === 'n1')?.isRead, false, 'المشكلة الأصلية: قراءة u1 كانت تُخفيه عن u2 خطأً');
});

test('2) unread count خاص بكل مستخدم على حدة', () => {
  userRoles.set('u1', new Set(['WAREHOUSE']));
  userRoles.set('u2', new Set(['WAREHOUSE']));
  notifications.set('n1', { id: 'n1', userId: null, roleId: 'WAREHOUSE', type: 'order_rejected' });

  assert.equal(getUnreadCount('u1', []), 1);
  assert.equal(getUnreadCount('u2', []), 1);

  markRead('n1', 'u1');

  assert.equal(getUnreadCount('u1', []), 0);
  assert.equal(getUnreadCount('u2', []), 1);
});

test('3) mark all read لمستخدم لا يؤثر على مستخدم آخر', () => {
  userRoles.set('u1', new Set(['WAREHOUSE']));
  userRoles.set('u2', new Set(['WAREHOUSE']));
  notifications.set('n1', { id: 'n1', userId: null, roleId: 'WAREHOUSE', type: 'order_rejected' });
  notifications.set('n2', { id: 'n2', userId: null, roleId: 'WAREHOUSE', type: 'order_rejected' });

  markAllRead('u1', []);

  assert.equal(getUnreadCount('u1', []), 0);
  assert.equal(getUnreadCount('u2', []), 2);
});

test('4) ADMIN يرى تنبيه low_stock الموجَّه لدور WAREHOUSE عبر صلاحية inventory.view دون عضوية في الدور', () => {
  userRoles.set('admin', new Set(['ADMIN'])); // ليس عضوًا في WAREHOUSE إطلاقًا
  notifications.set('n1', { id: 'n1', userId: null, roleId: 'WAREHOUSE', type: 'low_stock' });

  const visible = findVisibleFor('admin', ['inventory.view', 'approvals.view', 'customers.view', 'purchasing.view']);

  assert.ok(visible.some((n) => n.id === 'n1'), 'ADMIN يجب أن يرى التنبيه رغم عدم عضويته الحرفية في WAREHOUSE');
});

test('5) مستخدم بلا الصلاحية المناسبة لا يرى التنبيه التشغيلي — RBAC سليم', () => {
  userRoles.set('sales-user', new Set(['SALES']));
  notifications.set('n1', { id: 'n1', userId: null, roleId: 'WAREHOUSE', type: 'low_stock' });

  const visible = findVisibleFor('sales-user', ['sales.view', 'sales.manage']);

  assert.equal(visible.some((n) => n.id === 'n1'), false);
});

test('6) الإشعارات الأربعة التشغيلية جميعًا مرئية لمستخدم يملك كل الصلاحيات الأربع', () => {
  userRoles.set('admin', new Set([]));
  notifications.set('n1', { id: 'n1', userId: null, roleId: 'WAREHOUSE', type: 'low_stock' });
  notifications.set('n2', { id: 'n2', userId: null, roleId: 'ADMIN', type: 'approval_needed' });
  notifications.set('n3', { id: 'n3', userId: null, roleId: 'SALES', type: 'credit_limit_exceeded' });
  notifications.set('n4', { id: 'n4', userId: null, roleId: 'PURCHASING', type: 'po_delayed' });

  const visible = findVisibleFor('admin', ['inventory.view', 'approvals.view', 'customers.view', 'purchasing.view']);

  assert.deepEqual(visible.map((n) => n.id).sort(), ['n1', 'n2', 'n3', 'n4']);
});

test('7) إشعار شخصي (approval_decided) لا يُسرَّب لمستخدم آخر يملك approvals.view', () => {
  notifications.set('n1', { id: 'n1', userId: 'the-requester', roleId: null, type: 'approval_decided' });

  const visible = findVisibleFor('some-other-approver', ['approvals.view']);

  assert.equal(visible.some((n) => n.id === 'n1'), false, 'خصوصية الإشعار الشخصي يجب ألا تُخترق حتى بصلاحية عامة');
});

console.log('\n=== نتائج التشغيل الفعلي (verify-notification-read-state.ts) ===\n');
let passCount = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} — ${r.name}${r.error ? `\n        السبب: ${r.error}` : ''}`);
  if (r.pass) passCount++;
}
console.log(`\n${passCount}/${results.length} اختبارًا نجح فعليًا.\n`);
if (passCount !== results.length) process.exit(1);
