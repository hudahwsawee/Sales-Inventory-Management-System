import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService], // يُستخدم من AuditInterceptor العام
})
export class AuditModule {}
