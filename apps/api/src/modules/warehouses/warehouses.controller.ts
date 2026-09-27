import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { BulkUpsertWarehouseProductSettingsDto } from './dto/upsert-warehouse-product-settings.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

@ApiTags('Warehouses — المخازن')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private warehousesService: WarehousesService) {}

  @Get()
  @RequirePermission('warehouses.view')
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'عرض كل المخازن (النشطة فقط افتراضيًا)' })
  async findAll(@Query('include_inactive') includeInactive?: string) {
    return this.warehousesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission('warehouses.view')
  @ApiOperation({ summary: 'تفاصيل مخزن واحد' })
  async findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Post()
  @RequirePermission('warehouses.manage')
  @AuditLog({ action: 'create', entity: 'warehouses' })
  @ApiOperation({ summary: 'إنشاء مخزن جديد' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('warehouses.manage')
  @AuditLog({ action: 'update', entity: 'warehouses' })
  @ApiOperation({ summary: 'تحديث مخزن (بما في ذلك تفعيل/تعطيل)' })
  async update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(id, dto);
  }

  @Get(':id/product-settings')
  @RequirePermission('warehouses.view')
  @ApiOperation({ summary: 'عرض إعدادات الحد الأدنى لكل منتج في هذا المخزن' })
  async listProductSettings(@Param('id') id: string) {
    return this.warehousesService.listProductSettings(id);
  }

  @Put(':id/product-settings')
  @RequirePermission('warehouses.manage')
  @AuditLog({ action: 'update', entity: 'warehouse_product_settings' })
  @ApiOperation({ summary: 'تحديث/إنشاء إعدادات الحد الأدنى لعدة منتجات دفعة واحدة (Bulk Upsert)' })
  async upsertProductSettings(
    @Param('id') id: string,
    @Body() dto: BulkUpsertWarehouseProductSettingsDto,
  ) {
    return this.warehousesService.upsertProductSettings(id, dto);
  }
}
