import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // API Versioning — كل الـEndpoints تحت /api/v1 (قرار معتمد صراحة)
  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api/v1'));

  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:5173'),
    credentials: true, // إلزامي لإرسال/استقبال httpOnly Cookie الخاص بـRefresh Token
  });

  // Validation Pipe عام — يفرض DTOs على كل Endpoint، يرفض أي حقل غير معرَّف صراحة
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );

  // Swagger / API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('نظام إدارة المبيعات والمخزون — API')
    .setDescription(
      'توثيق الـAPI الرسمي. المرحلة الحالية: Foundation (Auth + RBAC + Audit فقط). ' +
        'باقي الوحدات (Sales, Purchasing, Inventory...) ستُضاف في مراحل التنفيذ القادمة.',
    )
    .setVersion('0.1.0-foundation')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 API يعمل على: http://localhost:${port}/${config.get('API_PREFIX', 'api/v1')}`);
  // eslint-disable-next-line no-console
  console.log(`📘 Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
