import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule], // Step 5 — يُتيح NotificationsService لـ notifyIfLowStock الاختيارية
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService], // يُستخدم من ReceivingModule/SalesModule/ReturnsModule
})
export class InventoryModule {}
