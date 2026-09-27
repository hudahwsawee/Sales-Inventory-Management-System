import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';

@ApiTags('Catalog — الفئات')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  @RequirePermission('catalog.view')
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'عرض كل الفئات (النشطة فقط افتراضيًا)' })
  async findAll(@Query('include_inactive') includeInactive?: string) {
    return this.categoriesService.findAll(includeInactive === 'true');
  }

  @Post()
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'create', entity: 'categories' })
  @ApiOperation({ summary: 'إنشاء فئة جديدة' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'update', entity: 'categories' })
  @ApiOperation({ summary: 'تحديث فئة (بما في ذلك تفعيل/تعطيل عبر isActive)' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }
}
