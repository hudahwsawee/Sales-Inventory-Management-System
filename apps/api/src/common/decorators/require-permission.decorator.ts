import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/**
 * @RequirePermission('sales.create_order')
 * يُستخدم فوق أي Controller Method — يُقرأ لاحقًا في PermissionsGuard.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
