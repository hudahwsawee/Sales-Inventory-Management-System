import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService], // تستخدمه ApprovalsModule وReturnsModule وInventoryModule (تنبيه نقص المخزون)
})
export class NotificationsModule {}
