import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_LOG_KEY = 'audit_log_meta';

export interface AuditLogMeta {
  action: AuditAction;
  entity: string;
}

/**
 * @AuditLog({ action: 'create', entity: 'sales_orders' })
 * يُستخدم فوق أي Controller Method يجب أن يُسجَّل تلقائيًا في audit_logs
 * عبر AuditInterceptor — بدل استدعاء خدمة الـAudit يدويًا في كل مكان
 * (تفادي نسيان تسجيل عملية مهمة، وفق قرار Architecture المعتمد).
 */
export const AuditLog = (meta: AuditLogMeta) => SetMetadata(AUDIT_LOG_KEY, meta);
