import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * فلتر أخطاء عام موحّد — كل خطأ يعود للواجهة بنفس الشكل:
 * { statusCode, code, message_ar, message_en?, path, timestamp }
 *
 * - أخطاء "عمل" متوقعة (HttpException برسالة واضحة) تُعرض كما هي.
 * - أخطاء غير متوقعة (استثناءات خام) تُسجَّل بالكامل في الـLogs،
 *   ويُعرض للمستخدم رسالة عامة فقط دون تفاصيل تقنية حساسة.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let messageAr = 'حدث خطأ غير متوقع، الرجاء المحاولة لاحقًا';
    let messageEn: string | undefined;
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const anyBody = body as Record<string, unknown>;
        messageAr = (anyBody.message_ar as string) ?? (anyBody.message as string) ?? messageAr;
        messageEn = anyBody.message as string;
        code = (anyBody.code as string) ?? exception.name;
      } else {
        messageAr = body as string;
      }
    } else {
      // خطأ غير متوقع — يُسجَّل كاملًا للتصحيح، ولا يُعرض تفصيله للمستخدم
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      code,
      message_ar: messageAr,
      ...(messageEn ? { message_en: messageEn } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
