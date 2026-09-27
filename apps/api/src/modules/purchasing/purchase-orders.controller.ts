import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Purchasing — أوامر الشراء')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('purchasing.view')
  @ApiOperation({ summary: 'عرض أوامر الشراء مع فلترة/بحث/صفحات' })
  async findAll(@Query() query: QueryPurchaseOrdersDto) {
    return this.purchaseOrdersService.findAll(query);
  }

  // ملاحظة ترتيب المسارات (Step 6): /purchase-orders/overdue يجب أن يسبق
  // /purchase-orders/:id في التسجيل، وإلا سيحاول NestJS مطابقة "overdue"
  // كأنه :id — نفس الدرس المطبَّق سابقًا مع /products/barcode/:barcode.
  @Get('overdue')
  @RequirePermission('purchasing.view')
  @ApiOperation({ summary: 'أوامر الشراء المفتوحة المتأخرة عن تاريخ التوريد المتوقع (Step 6)' })
  async findOverdue() {
    return this.purchaseOrdersService.findOverdue();
  }

  @Get(':id')
  @RequirePermission('purchasing.view')
  @ApiOperation({ summary: 'تفاصيل أمر شراء (مع بنوده وإيصالات استلامه)' })
  async findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Post()
  @RequirePermission('purchasing.manage')
  @AuditLog({ action: 'create', entity: 'purchase_orders' })
  @ApiOperation({ summary: 'إنشاء أمر شراء جديد (لا يؤثر على المخزون إطلاقًا)' })
  async create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.purchaseOrdersService.create(dto, user.userId);
  }

  @Patch(':id')
  @RequirePermission('purchasing.manage')
  @AuditLog({ action: 'update', entity: 'purchase_orders' })
  @ApiOperation({ summary: 'تحديث بيانات عنوان أمر الشراء (تاريخ التوريد/الملاحظات فقط)' })
  async update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrdersService.update(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('purchasing.manage')
  @AuditLog({ action: 'status_change', entity: 'purchase_orders' })
  @ApiOperation({ summary: 'إلغاء أمر شراء (متاح فقط قبل بدء أي استلام)' })
  async cancel(@Param('id') id: string) {
    return this.purchaseOrdersService.cancel(id);
  }
}
