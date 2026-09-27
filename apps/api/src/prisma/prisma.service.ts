import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — نقطة الاتصال الوحيدة بقاعدة البيانات عبر Prisma.
 * تُحقن في أي Service آخر يحتاج وصولًا لقاعدة البيانات.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('تم الاتصال بقاعدة البيانات بنجاح');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
