import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Audit Log')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private auditService: AuditService) {}

  /**
   * GET /audit-logs — عام، بفلاتر اختيارية وصفحات (لشاشة سجل التدقيق
   * الكاملة). إن أُرسِل entity وentity_id معًا، يعمل تمامًا كالمسار
   * القديم (فلترة على كيان واحد) — لا تغيير في ذلك السلوك، فقط إضافة
   * صفحات وفلاتر أخرى اختيارية حوله.
   */
  @Get()
  @RequirePermission('audit.view')
  @ApiOperation({ summary: 'عرض سجل التدقيق مع فلاتر اختيارية (كيان/نوع عملية/مستخدم/تاريخ) وصفحات' })
  async findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditService.findAll(query);
  }
}
