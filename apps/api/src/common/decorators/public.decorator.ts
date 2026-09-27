import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

/**
 * @Public() فوق أي Endpoint لا يتطلب مصادقة (تسجيل الدخول، تحديث التوكن، health check).
 * يُقرأ في JwtAuthGuard العام لتخطي التحقق من التوكن.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
