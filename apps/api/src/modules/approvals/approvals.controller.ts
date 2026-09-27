import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { QueryApprovalsDto } from './dto/query-approvals.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Approvals — الموافقات')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private approvalsService: ApprovalsService) {}

  @Get()
  @RequirePermission('approvals.view')
  @ApiOperation({ summary: 'عرض طلبات الموافقة (فلترة بالحالة/النوع)' })
  async findAll(@Query() query: QueryApprovalsDto) {
    return this.approvalsService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('approvals.view')
  @ApiOperation({ summary: 'تفاصيل طلب موافقة واحد' })
  async findOne(@Param('id') id: string) {
    return this.approvalsService.findOne(id);
  }

  @Post(':id/decide')
  @RequirePermission('approvals.decide')
  @AuditLog({ action: 'approve', entity: 'approvals' })
  @ApiOperation({ summary: 'الموافقة أو الرفض — يُطبَّق الأثر على الكيان المرتبط تلقائيًا (المرتجعات حاليًا)' })
  async decide(@Param('id') id: string, @Body() dto: DecideApprovalDto, @CurrentUser() user: CurrentUserPayload) {
    return this.approvalsService.decide(id, dto, user.userId);
  }
}
