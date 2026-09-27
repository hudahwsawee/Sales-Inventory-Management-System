import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { QueryInventoryBalancesDto } from './dto/query-inventory-balances.dto';
import { QueryInventoryTransactionsDto } from './dto/query-inventory-transactions.dto';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory — المخزون')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('balances')
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'عرض أرصدة المخزون (الكمية الفعلية/المحجوزة/المتاحة) لكل منتج×مخزن' })
  async findBalances(@Query() query: QueryInventoryBalancesDto) {
    return this.inventoryService.findBalances(query);
  }

  @Get('transactions')
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'عرض سجل حركات المخزون الكامل (Append-only)' })
  async findTransactions(@Query() query: QueryInventoryTransactionsDto) {
    return this.inventoryService.findTransactions(query);
  }

  @Get('low-stock')
  @RequirePermission('inventory.view')
  @ApiQuery({ name: 'warehouse_id', required: false })
  @ApiOperation({
    summary:
      'عرض المنتجات تحت الحد الأدنى (quantity_on_hand <= minimum_stock) — راجع التوثيق في InventoryService',
  })
  async findLowStock(@Query('warehouse_id') warehouseId?: string) {
    return this.inventoryService.findLowStock(warehouseId);
  }

  @Post('adjustments')
  @RequirePermission('inventory.adjust')
  @AuditLog({ action: 'update', entity: 'inventory_transactions' })
  @ApiOperation({ summary: 'تسوية يدوية للمخزون (زيادة/نقص) مع سبب إلزامي' })
  async createAdjustment(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.inventoryService.createAdjustment(dto, user.userId);
  }
}
