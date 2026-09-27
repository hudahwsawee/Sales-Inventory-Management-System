import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryReturnsDto } from './dto/query-returns.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Returns — المرتجعات')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private returnsService: ReturnsService) {}

  @Get()
  @RequirePermission('returns.view')
  @ApiOperation({ summary: 'عرض المرتجعات مع فلترة/صفحات' })
  async findAll(@Query() query: QueryReturnsDto) {
    return this.returnsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('returns.view')
  @ApiOperation({ summary: 'تفاصيل مرتجع (بنوده، سجل الموافقات)' })
  async findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Post()
  @RequirePermission('returns.manage')
  @AuditLog({ action: 'create', entity: 'returns' })
  @ApiOperation({ summary: 'إنشاء مرتجع جديد (Draft) — بدون أي أثر على المخزون بعد' })
  async create(@Body() dto: CreateReturnDto, @CurrentUser() user: CurrentUserPayload) {
    return this.returnsService.create(dto, user.userId);
  }

  @Post(':id/submit')
  @RequirePermission('returns.manage')
  @AuditLog({ action: 'status_change', entity: 'returns' })
  @ApiOperation({ summary: 'تقديم المرتجع للموافقة' })
  async submit(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.returnsService.submit(id, user.userId);
  }

  @Post(':id/complete')
  @RequirePermission('returns.manage')
  @AuditLog({ action: 'status_change', entity: 'returns' })
  @ApiOperation({ summary: 'إتمام المرتجع — الأثر الفعلي الوحيد على المخزون (بعد الموافقة فقط)' })
  async complete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.returnsService.complete(id, user.userId);
  }

  @Post(':id/cancel')
  @RequirePermission('returns.manage')
  @AuditLog({ action: 'status_change', entity: 'returns' })
  @ApiOperation({ summary: 'إلغاء المرتجع (متاح قبل الإتمام فقط)' })
  async cancel(@Param('id') id: string) {
    return this.returnsService.cancel(id);
  }
}
