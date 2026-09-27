import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

@ApiTags('Suppliers — الموردون')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers.view')
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'عرض كل الموردين (النشطين فقط افتراضيًا)' })
  async findAll(@Query('include_inactive') includeInactive?: string) {
    return this.suppliersService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission('suppliers.view')
  @ApiOperation({ summary: 'تفاصيل مورد واحد' })
  async findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @RequirePermission('suppliers.manage')
  @AuditLog({ action: 'create', entity: 'suppliers' })
  @ApiOperation({ summary: 'إنشاء مورد جديد' })
  async create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('suppliers.manage')
  @AuditLog({ action: 'update', entity: 'suppliers' })
  @ApiOperation({ summary: 'تحديث مورد (بما في ذلك تفعيل/تعطيل)' })
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Get(':id/products')
  @RequirePermission('suppliers.view')
  @ApiOperation({ summary: 'عرض المنتجات المرتبطة بمورد معيّن' })
  async listProducts(@Param('id') id: string) {
    return this.suppliersService.listProducts(id);
  }

  @Post(':id/products')
  @RequirePermission('suppliers.manage')
  @AuditLog({ action: 'create', entity: 'supplier_products' })
  @ApiOperation({ summary: 'ربط منتج بمورد (مع سعره الخاص)، مع دعم تحديد المورد المفضّل' })
  async addProduct(@Param('id') id: string, @Body() dto: CreateSupplierProductDto) {
    return this.suppliersService.addProduct(id, dto);
  }
}
