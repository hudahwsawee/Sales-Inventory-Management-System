import { ConflictException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

function buildFakeDb() {
  const approvals = new Map<string, any>();
  const returns = new Map<string, any>();

  const tx = {
    approval: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const a = approvals.get(where.id);
        if (!a || a.status !== where.status) return { count: 0 };
        Object.assign(a, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const a = approvals.get(where.id);
        if (!a) throw new Error('NotFound');
        return a;
      }),
    },
    return: {
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const r = returns.get(where.id);
        if (!r) throw new Error('NotFound');
        return r;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(returns.get(where.id), data);
        return returns.get(where.id);
      }),
    },
  };

  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as unknown as PrismaService;
  const notifications = { create: jest.fn(async () => null) } as unknown as NotificationsService;
  const service = new ApprovalsService(prisma, notifications);

  return { service, approvals, returns, notifications };
}

describe('ApprovalsService', () => {
  it('الموافقة تنقل المرتجع المرتبط إلى approved', async () => {
    const db = buildFakeDb();
    db.approvals.set('app-1', { id: 'app-1', approvalType: 'return_approval', returnId: 'ret-1', status: 'pending', requestedBy: 'user-req' });
    db.returns.set('ret-1', { id: 'ret-1', status: 'pending_approval' });

    await db.service.decide('app-1', { decision: 'approved' }, 'approver-1');

    expect(db.approvals.get('app-1').status).toBe('approved');
    expect(db.returns.get('ret-1').status).toBe('approved');
    expect(db.notifications.create).toHaveBeenCalled(); // إشعار مقدّم الطلب
  });

  it('الرفض ينقل المرتجع المرتبط إلى cancelled ويسجّل السبب', async () => {
    const db = buildFakeDb();
    db.approvals.set('app-1', { id: 'app-1', approvalType: 'return_approval', returnId: 'ret-1', status: 'pending', requestedBy: 'user-req' });
    db.returns.set('ret-1', { id: 'ret-1', status: 'pending_approval' });

    await db.service.decide('app-1', { decision: 'rejected', reason: 'كمية غير مطابقة للفاتورة' }, 'approver-1');

    expect(db.approvals.get('app-1').status).toBe('rejected');
    expect(db.approvals.get('app-1').reason).toBe('كمية غير مطابقة للفاتورة');
    expect(db.returns.get('ret-1').status).toBe('cancelled');
  });

  it('لا يمكن اتخاذ قرار مرتين على نفس الطلب (استحواذ ذرّي)', async () => {
    const db = buildFakeDb();
    db.approvals.set('app-1', { id: 'app-1', approvalType: 'return_approval', returnId: 'ret-1', status: 'pending', requestedBy: 'user-req' });
    db.returns.set('ret-1', { id: 'ret-1', status: 'pending_approval' });

    await db.service.decide('app-1', { decision: 'approved' }, 'approver-1');
    await expect(db.service.decide('app-1', { decision: 'rejected', reason: 'x' }, 'approver-2')).rejects.toThrow(ConflictException);
  });

  it('حارس الأمان: قرار متأخر على مرتجع أُلغي مباشرة أثناء الانتظار يُرفض ولا يُعيد إحياءه', async () => {
    const db = buildFakeDb();
    db.approvals.set('app-1', { id: 'app-1', approvalType: 'return_approval', returnId: 'ret-1', status: 'pending', requestedBy: 'user-req' });
    // المرتجع أُلغي مباشرة (Cancel) بعد تقديم طلب الموافقة، دون علم الموافق
    db.returns.set('ret-1', { id: 'ret-1', status: 'cancelled' });

    await expect(db.service.decide('app-1', { decision: 'approved' }, 'approver-1')).rejects.toMatchObject({
      response: { code: 'RETURN_NO_LONGER_PENDING' },
    });

    expect(db.returns.get('ret-1').status).toBe('cancelled'); // لم يتغيّر إلى approved خطأً
  });
});
