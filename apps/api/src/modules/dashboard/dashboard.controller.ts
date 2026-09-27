import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * لا صلاحية RBAC عامة موحّدة على هذا الـController عمدًا — كل مستخدم
 * مسجَّل دخول يستطيع طلب الملخص، لكن DashboardService يُحدِّد داخليًا (بناءً
 * على صلاحيات المستخدم نفسه) أيّ عدّاد يُعاد فعليًا. هذا يحقق "ADMIN يرى
 * الكل، وكل دور آخر يرى فقط ما يملك صلاحية مصدره" دون الحاجة لصلاحية
 * 'dashboard.view' جديدة تمامًا.
 */
@ApiTags('Dashboard — ملخص التنبيهات')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('alerts-summary')
  @ApiOperation({ summary: 'ملخص عدّادات التنبيهات التشغيلية (مخزون منخفض/موافقات معلَّقة/عملاء عند الحد الائتماني/أوامر شراء متأخرة)' })
  async getAlertsSummary(@CurrentUser() user: CurrentUserPayload) {
    return this.dashboardService.getAlertsSummary(user.permissions);
  }
}
