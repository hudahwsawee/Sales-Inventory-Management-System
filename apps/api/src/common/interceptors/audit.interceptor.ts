import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_LOG_KEY, AuditLogMeta } from '../decorators/audit-log.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * AuditInterceptor — أساس نظام Audit Log (Foundation فقط في هذه المرحلة).
 *
 * أي Endpoint معلَّم بـ@AuditLog({action, entity}) يُسجَّل تلقائيًا بعد
 * نجاح تنفيذه، دون أن يستدعي الـController أو الـService خدمة الـAudit
 * يدويًا — هذا يقلل خطر نسيان تسجيل عملية مهمة (قرار معماري معتمد).
 *
 * ملاحظة نطاق هذه المرحلة: الالتقاط هنا عام (Endpoint-level)، ويسجل
 * old_value/new_value بالشكل الأساسي المتاح من جسم الطلب والاستجابة.
 * التقاط "القيمة القديمة" الدقيقة على مستوى الحقول (مثال: تغيّر قيمة طلب
 * من 25,000 إلى 22,000 تحديدًا) يحتاج منطقًا إضافيًا خاصًا بكل Module
 * (مقارنة قبل/بعد داخل الـService نفسه) — سيُبنى تدريجيًا مع كل Module
 * (Sales, Purchasing...) في مراحل التنفيذ القادمة، وليس جزءًا من هذا الأساس.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditLogMeta | undefined>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user: CurrentUserPayload | undefined = request.user;

    return next.handle().pipe(
      tap((responseBody) => {
        if (!user) return; // لا تسجيل بدون مستخدم معروف (مثال: عمليات نظام داخلية)

        const entityId =
          (responseBody as any)?.id ?? request.params?.id ?? 'unknown';

        void this.auditService.record({
          userId: user.userId,
          action: meta.action,
          entity: meta.entity,
          entityId: String(entityId),
          oldValue: request.body?.__auditOldValue ?? null,
          newValue: responseBody ?? request.body ?? null,
        });
      }),
    );
  }
}
