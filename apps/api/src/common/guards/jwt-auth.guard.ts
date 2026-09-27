import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — يُطبَّق كـGlobal Guard على كل الـEndpoints افتراضيًا.
 * أي Endpoint يجب أن يتطلب Access Token صالحًا، ما لم يُعلَّم صراحة بـ@Public().
 *
 * هذا يحقق مبدأ "الرفض الافتراضي" (Secure by Default) — بدل أن يحتاج كل
 * Endpoint جديد تذكّر إضافة الحماية يدويًا، الحماية مفعّلة تلقائيًا،
 * والاستثناء (Public) هو ما يحتاج تصريحًا صريحًا.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
