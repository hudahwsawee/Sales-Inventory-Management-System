import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';

@ApiTags('Catalog — الوحدات')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get()
  @RequirePermission('catalog.view')
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'عرض كل الوحدات (النشطة فقط افتراضيًا)' })
  async findAll(@Query('include_inactive') includeInactive?: string) {
    return this.unitsService.findAll(includeInactive === 'true');
  }

  @Post()
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'create', entity: 'units' })
  @ApiOperation({ summary: 'إنشاء وحدة قياس جديدة' })
  async create(@Body() dto: CreateUnitDto) {
    return this.unitsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'update', entity: 'units' })
  @ApiOperation({ summary: 'تحديث وحدة قياس (بما في ذلك تفعيل/تعطيل)' })
  async update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(id, dto);
  }
}
