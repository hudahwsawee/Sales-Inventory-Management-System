import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasingModule } from '../purchasing/purchasing.module';

@Module({
  imports: [InventoryModule, PurchasingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
