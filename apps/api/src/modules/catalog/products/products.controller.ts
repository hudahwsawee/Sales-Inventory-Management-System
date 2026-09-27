import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../../common/decorators/audit-log.decorator';

@ApiTags('Catalog — المنتجات')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @RequirePermission('catalog.view')
  @ApiOperation({ summary: 'عرض المنتجات مع بحث/فلترة/صفحات' })
  async findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  // ملاحظة ترتيب المسارات: /products/barcode/:barcode يجب أن يسبق /products/:id
  // في تسجيل الـRoutes، وإلا سيحاول NestJS مطابقة "barcode" كأنه :id.
  @Get('barcode/:barcode')
  @RequirePermission('catalog.view')
  @ApiOperation({ summary: 'البحث عن منتج بالباركود (لاستخدام قارئ الباركود لاحقًا في الاستلام/التجهيز)' })
  async findByBarcode(@Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }

  @Get(':id')
  @RequirePermission('catalog.view')
  @ApiOperation({ summary: 'تفاصيل منتج واحد' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'create', entity: 'products' })
  @ApiOperation({ summary: 'إنشاء منتج جديد' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.manage')
  @AuditLog({ action: 'update', entity: 'products' })
  @ApiOperation({ summary: 'تحديث منتج (بما في ذلك تفعيل/تعطيل)' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }
}
