import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { QuerySalesOrdersDto } from './dto/query-sales-orders.dto';
import { CancelSalesOrderDto } from './dto/cancel-sales-order.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Sales — أوامر البيع')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private salesOrdersService: SalesOrdersService) {}

  @Get()
  @RequirePermission('sales.view')
  @ApiOperation({ summary: 'عرض طلبات البيع مع فلترة/بحث/صفحات' })
  async findAll(@Query() query: QuerySalesOrdersDto) {
    return this.salesOrdersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('sales.view')
  @ApiOperation({ summary: 'تفاصيل طلب بيع (بنود، حجوزات، دفعات)' })
  async findOne(@Param('id') id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Post()
  @RequirePermission('sales.manage')
  @AuditLog({ action: 'create', entity: 'sales_orders' })
  @ApiOperation({ summary: 'إنشاء طلب بيع جديد (Draft — بدون حجز مخزون بعد)' })
  async create(@Body() dto: CreateSalesOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.salesOrdersService.create(dto, user.userId);
  }

  @Patch(':id')
  @RequirePermission('sales.manage')
  @AuditLog({ action: 'update', entity: 'sales_orders' })
  @ApiOperation({ summary: 'تحديث طلب بيع (متاح فقط بحالة Draft)' })
  async update(@Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.salesOrdersService.update(id, dto);
  }

  @Post(':id/confirm')
  @RequirePermission('sales.manage')
  @AuditLog({ action: 'status_change', entity: 'sales_orders' })
  @ApiOperation({ summary: 'تأكيد الطلب — حجز ذرّي لكل بنوده معًا (الكل أو لا شيء)' })
  async confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.salesOrdersService.confirm(id, user.userId);
  }

  @Post(':id/fulfill')
  @RequirePermission('sales.manage')
  @AuditLog({ action: 'status_change', entity: 'sales_orders' })
  @ApiOperation({ summary: 'تسليم الطلب فعليًا — يخصم المخزون الفعلي ويحرر الحجز' })
  async fulfill(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.salesOrdersService.fulfill(id, user.userId);
  }

  @Post(':id/cancel')
  @RequirePermission('sales.manage')
  @AuditLog({ action: 'status_change', entity: 'sales_orders' })
  @ApiOperation({ summary: 'إلغاء الطلب (متاح قبل التسليم فقط) — يحرر أي حجز نشط' })
  async cancel(@Param('id') id: string, @Body() dto: CancelSalesOrderDto) {
    return this.salesOrdersService.cancel(id, dto);
  }
}
