import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * اختبار RBAC (بند 12 من المتطلبات): مستخدم بصلاحيات Step 3 غير كافية
 * (مثال: دور SALES الذي لا يملك أي صلاحية مشتريات حسب القرار المعتمد)
 * يجب أن يُرفض فعليًا عند محاولة الوصول لـEndpoint يتطلب `purchasing.manage`.
 */
function buildContext(userPermissions: string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: userPermissions ? { userId: 'u1', permissions: userPermissions } : undefined }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard (RBAC) — سيناريو Step 3', () => {
  it('12) مستخدم بدور SALES (بلا صلاحيات مشتريات) يُرفض عند محاولة إدارة أمر شراء', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['purchasing.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    // صلاحيات دور SALES الفعلية حسب seed.ts المعتمد — لا شيء من purchasing/receiving/inventory
    const salesUserPermissions = ['sales.view_price'];

    expect(() => guard.canActivate(buildContext(salesUserPermissions))).toThrow(ForbiddenException);
  });

  it('مستخدم بدور PURCHASING (يملك purchasing.manage فعليًا) يُقبَل', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['purchasing.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    const purchasingUserPermissions = ['purchasing.view', 'purchasing.manage', 'receiving.view'];

    expect(guard.canActivate(buildContext(purchasingUserPermissions))).toBe(true);
  });

  it('طلب بلا مستخدم مصادَق عليه إطلاقًا يُرفض', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['inventory.adjust']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
