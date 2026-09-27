import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  userId: string;
  username: string;
  permissions: string[];
}

/**
 * @CurrentUser() في أي Controller — يُرجع بيانات المستخدم المستخرجة من الـJWT
 * (مضافة إلى request.user عبر JwtStrategy).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
