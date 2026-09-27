import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';

@ApiTags('Catalog — العلامات التجارية')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  @Get()
  @RequirePermission('catalog.view')
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'عرض كل العلامات التجارية (النشطة فقط افتراضيًا)' })
  async findAll(@Query('include_inactive') includeInactive?: string) {
    return this.brandsService.findAll(includeInactive === 'true');
  }

  @Post()
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'create', entity: 'brands' })
  @ApiOperation({ summary: 'إنشاء علامة تجارية جديدة' })
  async create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'update', entity: 'brands' })
  @ApiOperation({ summary: 'تحديث علامة تجارية (بما في ذلك تفعيل/تعطيل)' })
  async update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }
}
