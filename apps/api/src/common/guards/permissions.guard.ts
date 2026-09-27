import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * PermissionsGuard — الطبقة الثانية بعد JwtAuthGuard.
 * يقرأ الصلاحيات المطلوبة من @RequirePermission(...) ويقارنها بصلاحيات
 * المستخدم المضمَّنة في الـJWT Payload نفسه (وليس باستعلام قاعدة بيانات
 * إضافي في كل طلب — قرار معماري معتمد لتسريع الفحص).
 *
 * Backend هو مصدر القرار النهائي دائمًا (قرار معتمد صراحة في Architecture) —
 * هذا الـGuard لا يثق بأي شيء يصل من الواجهة، فقط بمحتوى الـJWT الموقَّع.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Endpoint بدون @RequirePermission = يكفي تسجيل الدخول (JwtAuthGuard) فقط
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: CurrentUserPayload = request.user;

    if (!user || !Array.isArray(user.permissions)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_NO_PERMISSIONS',
        message_ar: 'لا تملك صلاحية الوصول لهذا الإجراء',
      });
    }

    const hasPermission = requiredPermissions.every((p) => user.permissions.includes(p));

    if (!hasPermission) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_INSUFFICIENT_PERMISSION',
        message_ar: 'لا تملك الصلاحية الكافية لتنفيذ هذا الإجراء',
      });
    }

    return true;
  }
}
