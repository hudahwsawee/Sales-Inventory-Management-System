import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * محاكاة In-Memory كاملة تُطبِّق فعليًا دلالات `reads: { none: { userId } } }`
 * (فلتر العلاقة السلبي المستخدَم في الخدمة الحقيقية)، لاختبار جوهر
 * الإصلاح: استقلالية حالة القراءة بين المستخدمين لإشعار مشترك واحد.
 */
function buildFakeDb() {
  const userRoles = new Map<string, Set<string>>(); // userId -> roleIds
  const notifications = new Map<string, any>();
  const reads = new Set<string>(); // `${notificationId}::${userId}`
  let idCounter = 0;

  function matchesOr(n: any, orBranches: any[], userId: string): boolean {
    return orBranches.some((branch) => {
      if (branch.userId !== undefined) return n.userId === branch.userId;
      if (branch.roleId?.in) return branch.roleId.in.includes(n.roleId);
      if (branch.type?.in) return branch.type.in.includes(n.type) && n.roleId !== null && n.roleId !== undefined;
      return false;
    });
  }

  function isUnreadFor(notificationId: string, userId: string): boolean {
    return !reads.has(`${notificationId}::${userId}`);
  }

  const prisma = {
    userRole: {
      findMany: jest.fn(async ({ where }: any) =>
        Array.from(userRoles.get(where.userId) ?? []).map((roleId) => ({ roleId })),
      ),
    },
    notification: {
      findMany: jest.fn(async ({ where, take }: any) => {
        // نحتاج userId الحالي لتفسير reads.none — نستخرجه من أول فرع OR (userId) دائمًا موجود بهذا الترتيب فعليًا
        const currentUserId = where.OR.find((b: any) => b.userId !== undefined)?.userId;
        let results = Array.from(notifications.values()).filter((n) => matchesOr(n, where.OR, currentUserId));
        if (where.reads?.none) results = results.filter((n) => isUnreadFor(n.id, where.reads.none.userId));
        if (where.type) results = results.filter((n) => n.type === where.type);
        if (take) results = results.slice(0, take);
        return results.map((n) => ({
          ...n,
          reads: isUnreadFor(n.id, currentUserId) ? [] : [{ notificationId: n.id, userId: currentUserId }],
        }));
      }),
      count: jest.fn(async ({ where }: any) => {
        const currentUserId = where.OR.find((b: any) => b.userId !== undefined)?.userId;
        let results = Array.from(notifications.values()).filter((n) => matchesOr(n, where.OR, currentUserId));
        if (where.reads?.none) results = results.filter((n) => isUnreadFor(n.id, where.reads.none.userId));
        return results.length;
      }),
      findUnique: jest.fn(async ({ where }: any) => notifications.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(notifications.get(where.id), data);
        return notifications.get(where.id);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const ids: string[] = where.id.in;
        for (const id of ids) Object.assign(notifications.get(id), data);
        return { count: ids.length };
      }),
    },
    notificationRead: {
      upsert: jest.fn(async ({ where }: any) => {
        reads.add(`${where.notificationId_userId.notificationId}::${where.notificationId_userId.userId}`);
        return { id: `read-${++idCounter}` };
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const row of data) reads.add(`${row.notificationId}::${row.userId}`);
        return { count: data.length };
      }),
    },
  } as unknown as PrismaService;

  const service = new NotificationsService(prisma);

  function seedNotification(id: string, opts: { userId?: string; roleId?: string; type: string }) {
    notifications.set(id, { id, userId: opts.userId ?? null, roleId: opts.roleId ?? null, type: opts.type, isRead: false, createdAt: new Date() });
  }

  return { service, userRoles, notifications, reads, seedNotification };
}

describe('NotificationsService — إصلاح Read State المستقل لكل مستخدم', () => {
  it('قراءة مستخدم لإشعار موجَّه لدور لا تجعله مقروءًا لعضو آخر في نفس الدور', async () => {
    const db = buildFakeDb();
    db.userRoles.set('sales-user-1', new Set(['role-sales']));
    db.userRoles.set('sales-user-2', new Set(['role-sales']));
    db.seedNotification('notif-1', { roleId: 'role-sales', type: 'order_rejected' });

    await db.service.markRead('notif-1', 'sales-user-1', []);

    const listForUser1 = await db.service.findAllForCurrentUser('sales-user-1', []);
    const listForUser2 = await db.service.findAllForCurrentUser('sales-user-2', []);

    expect(listForUser1.find((n) => n.id === 'notif-1')?.isRead).toBe(true);
    expect(listForUser2.find((n) => n.id === 'notif-1')?.isRead).toBe(false); // === جوهر الإصلاح ===
  });

  it('unread count خاص بكل مستخدم على حدة لنفس الإشعار المشترك', async () => {
    const db = buildFakeDb();
    db.userRoles.set('user-a', new Set(['role-warehouse']));
    db.userRoles.set('user-b', new Set(['role-warehouse']));
    db.seedNotification('notif-1', { roleId: 'role-warehouse', type: 'order_rejected' });

    expect(await db.service.getUnreadCount('user-a', [])).toBe(1);
    expect(await db.service.getUnreadCount('user-b', [])).toBe(1);

    await db.service.markRead('notif-1', 'user-a', []);

    expect(await db.service.getUnreadCount('user-a', [])).toBe(0);
    expect(await db.service.getUnreadCount('user-b', [])).toBe(1); // لم يتأثر
  });

  it('mark all as read لمستخدم لا يؤثر على قائمة مستخدم آخر', async () => {
    const db = buildFakeDb();
    db.userRoles.set('user-a', new Set(['role-warehouse']));
    db.userRoles.set('user-b', new Set(['role-warehouse']));
    db.seedNotification('notif-1', { roleId: 'role-warehouse', type: 'order_rejected' });
    db.seedNotification('notif-2', { roleId: 'role-warehouse', type: 'order_rejected' });

    await db.service.markAllRead('user-a', []);

    expect(await db.service.getUnreadCount('user-a', [])).toBe(0);
    expect(await db.service.getUnreadCount('user-b', [])).toBe(2); // لم يتأثر إطلاقًا
  });

  it('لا يمكن لمستخدم تعليم إشعار شخصي لمستخدم آخر كمقروء', async () => {
    const db = buildFakeDb();
    db.seedNotification('notif-1', { userId: 'user-owner', type: 'approval_decided' });

    await expect(db.service.markRead('notif-1', 'someone-else', [])).rejects.toThrow(ForbiddenException);
  });
});

describe('NotificationsService — رؤية ADMIN للتنبيهات التشغيلية (Step 6.1، دون كسر RBAC)', () => {
  it('ADMIN يرى تنبيه low_stock (موجَّه لدور WAREHOUSE) لأنه يملك صلاحية inventory.view، رغم عدم عضويته في WAREHOUSE', async () => {
    const db = buildFakeDb();
    db.userRoles.set('admin-user', new Set(['role-admin'])); // ليس عضوًا في WAREHOUSE إطلاقًا
    db.seedNotification('notif-low-stock', { roleId: 'role-warehouse', type: 'low_stock' });

    const adminPermissions = ['inventory.view', 'approvals.view', 'customers.view', 'purchasing.view'];
    const list = await db.service.findAllForCurrentUser('admin-user', adminPermissions);

    expect(list.some((n) => n.id === 'notif-low-stock')).toBe(true);
  });

  it('مستخدم عادي بلا صلاحية inventory.view لا يرى تنبيه low_stock — RBAC لم ينكسر', async () => {
    const db = buildFakeDb();
    db.userRoles.set('sales-only-user', new Set(['role-sales']));
    db.seedNotification('notif-low-stock', { roleId: 'role-warehouse', type: 'low_stock' });

    const list = await db.service.findAllForCurrentUser('sales-only-user', ['sales.view', 'sales.manage']);

    expect(list.some((n) => n.id === 'notif-low-stock')).toBe(false);
  });

  it('التنبيهات الأربعة التشغيلية جميعًا مرئية لـADMIN بكل صلاحياته', async () => {
    const db = buildFakeDb();
    db.userRoles.set('admin-user', new Set([]));
    db.seedNotification('n1', { roleId: 'role-warehouse', type: 'low_stock' });
    db.seedNotification('n2', { roleId: 'role-admin', type: 'approval_needed' });
    db.seedNotification('n3', { roleId: 'role-sales', type: 'credit_limit_exceeded' });
    db.seedNotification('n4', { roleId: 'role-purchasing', type: 'po_delayed' });

    const adminPermissions = ['inventory.view', 'approvals.view', 'customers.view', 'purchasing.view'];
    const list = await db.service.findAllForCurrentUser('admin-user', adminPermissions);

    expect(list.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('إشعار شخصي (approval_decided) لا يُسرَّب لمستخدم آخر يملك approvals.view (استثناء الخصوصية المتعمَّد)', async () => {
    const db = buildFakeDb();
    db.seedNotification('notif-personal', { userId: 'the-requester', type: 'approval_decided' });

    const otherUserWithPermission = await db.service.findAllForCurrentUser('some-approver', ['approvals.view']);

    expect(otherUserWithPermission.some((n) => n.id === 'notif-personal')).toBe(false);
  });
});
