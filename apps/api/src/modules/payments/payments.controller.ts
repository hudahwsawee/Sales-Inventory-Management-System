import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Payments — المدفوعات')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get()
  @RequirePermission('payments.view')
  @ApiOperation({ summary: 'سجل المدفوعات (فلترة بطلب بيع أو عميل)' })
  async findAll(@Query() query: QueryPaymentsDto) {
    return this.paymentsService.findAll(query);
  }

  @Post()
  @RequirePermission('payments.manage')
  @AuditLog({ action: 'create', entity: 'payments' })
  @ApiOperation({ summary: 'تسجيل دفعة على طلب بيع (يمنع تجاوز المتبقي)' })
  async create(@Body() dto: CreatePaymentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.create(dto, user.userId);
  }
}
