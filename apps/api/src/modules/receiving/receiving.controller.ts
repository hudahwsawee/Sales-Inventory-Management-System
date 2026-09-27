import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReceivingService } from './receiving.service';
import { ConfirmReceiptDto } from './dto/confirm-receipt.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Receiving — استلام المشتريات')
@ApiBearerAuth()
@Controller('purchase-receipts')
export class ReceivingController {
  constructor(private receivingService: ReceivingService) {}

  @Get()
  @RequirePermission('receiving.view')
  @ApiOperation({ summary: 'عرض إيصالات الاستلام (فلترة اختيارية بأمر الشراء)' })
  async findAll(@Query('purchase_order_id') purchaseOrderId?: string) {
    return this.receivingService.findAll(purchaseOrderId);
  }

  @Get(':id')
  @RequirePermission('receiving.view')
  @ApiOperation({ summary: 'تفاصيل إيصال استلام واحد' })
  async findOne(@Param('id') id: string) {
    return this.receivingService.findOne(id);
  }

  @Post()
  @RequirePermission('receiving.manage')
  @AuditLog({ action: 'create', entity: 'purchase_receipts' })
  @ApiOperation({
    summary: 'تأكيد استلام (كامل أو جزئي) — هذا هو الحدث الوحيد الذي يزيد المخزون فعليًا',
  })
  async confirmReceipt(@Body() dto: ConfirmReceiptDto, @CurrentUser() user: CurrentUserPayload) {
    return this.receivingService.confirmReceipt(dto, user.userId);
  }
}
