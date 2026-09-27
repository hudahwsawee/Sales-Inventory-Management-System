import { Controller, Get, Query, Res, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService, toCsv } from './reports.service';
import { QueryReportsDto } from './dto/query-reports.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** يربط كل نوع تصدير بالصلاحية الحقيقية لمصدر بياناته — يُتحقَّق منها يدويًا في /export (راجعوا التعليق هناك) */
const EXPORT_TYPE_PERMISSION_MAP: Record<string, string> = {
  'sales-trend': 'reports.sales',
  'sales-top-products': 'reports.sales',
  'sales-top-customers': 'reports.sales',
  'profit-trend': 'reports.profit',
  'inventory-items': 'reports.inventory',
  'inventory-movements': 'reports.inventory',
  'purchases-by-supplier': 'reports.purchases',
  'customers-top': 'reports.customers',
  'suppliers-top': 'reports.suppliers',
  'products-items': 'reports.products',
};

@ApiTags('Reports — التقارير والتحليلات')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('overview')
  @RequirePermission('reports.view')
  @ApiOperation({ summary: 'نظرة عامة تنفيذية — مؤشرات KPI الرئيسية مع مقارنة اختيارية بالفترة السابقة' })
  async getOverview(@Query() query: QueryReportsDto) {
    return this.reportsService.getOverview(query);
  }

  @Get('sales')
  @RequirePermission('reports.sales')
  @ApiOperation({ summary: 'تقرير المبيعات — إجمالي/صافي، اتجاه زمني، حسب الحالة/طريقة الدفع/المخزن، أفضل المنتجات والعملاء' })
  async getSales(@Query() query: QueryReportsDto) {
    return this.reportsService.getSalesReport(query);
  }

  @Get('profit')
  @RequirePermission('reports.profit')
  @ApiOperation({ summary: 'تقرير الأرباح — الإيراد وتكلفة البضاعة المباعة والربح الإجمالي وهامشه' })
  async getProfit(@Query() query: QueryReportsDto) {
    return this.reportsService.getProfitReport(query);
  }

  @Get('inventory')
  @RequirePermission('reports.inventory')
  @ApiOperation({ summary: 'تقرير المخزون — القيمة الحالية، نقص المخزون، نفاد المخزون، حسب المخزن' })
  async getInventory(@Query() query: QueryReportsDto) {
    return this.reportsService.getInventoryReport(query);
  }

  @Get('inventory/movements')
  @RequirePermission('reports.inventory')
  @ApiOperation({ summary: 'تقرير حركة المخزون التفصيلي (مُصفَّح) — الأنواع الفعلية فقط من المخطط المعتمد' })
  async getInventoryMovements(@Query() query: QueryReportsDto) {
    return this.reportsService.getInventoryMovements(query);
  }

  @Get('purchases')
  @RequirePermission('reports.purchases')
  @ApiOperation({ summary: 'تقرير المشتريات — إجمالي، حسب المورد، اتجاه زمني، أوامر شراء متأخرة' })
  async getPurchases(@Query() query: QueryReportsDto) {
    return this.reportsService.getPurchasesReport(query);
  }

  @Get('customers')
  @RequirePermission('reports.customers')
  @ApiOperation({ summary: 'تقرير العملاء — توزيع نقدي/آجل، أرصدة مستحقة، عملاء عند الحد الائتماني، أفضل العملاء' })
  async getCustomers(@Query() query: QueryReportsDto) {
    return this.reportsService.getCustomersReport(query);
  }

  @Get('suppliers')
  @RequirePermission('reports.suppliers')
  @ApiOperation({ summary: 'تقرير الموردين — أفضل الموردين حسب قيمة الشراء' })
  async getSuppliers(@Query() query: QueryReportsDto) {
    return this.reportsService.getSuppliersReport(query);
  }

  @Get('products')
  @RequirePermission('reports.products')
  @ApiOperation({ summary: 'تحليلات المنتجات — مبيعات وربح كل منتج، المخزون الحالي، تصفية بالفئة/العلامة/المخزن' })
  async getProducts(@Query() query: QueryReportsDto) {
    return this.reportsService.getProductsReport(query);
  }

  /**
   * GET /reports/export — يتطلب `reports.export` (عبر @RequirePermission
   * أدناه) **بالإضافة إلى** الصلاحية الفعلية لمصدر البيانات المطلوب
   * تصديرها تحديدًا (يُتحقَّق منها يدويًا هنا لأنها تعتمد على قيمة `type`
   * الديناميكية في وقت التشغيل — لا يمكن لِـ@RequirePermission الثابت أن
   * يُعبِّر عن ذلك). هذا يمنع مستخدمًا يملك reports.export فقط (بلا
   * reports.profit مثلًا) من تصدير بيانات ربح حسّاسة لا يملك صلاحية رؤيتها
   * أصلًا — "لا تثق بفلاتر الواجهة كتفويض" (متطلب 23 صراحة).
   */
  @Get('export')
  @RequirePermission('reports.export')
  @AuditLog({ action: 'export', entity: 'reports' })
  @ApiQuery({ name: 'type', enum: Object.keys(EXPORT_TYPE_PERMISSION_MAP) })
  @ApiOperation({ summary: 'تصدير CSV لأي تقرير تفصيلي، بنفس الفلاتر المُطبَّقة تمامًا' })
  async export(
    @Query('type') type: string,
    @Query() query: QueryReportsDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const requiredPermission = EXPORT_TYPE_PERMISSION_MAP[type];
    if (!requiredPermission) {
      throw new BadRequestException({ code: 'INVALID_EXPORT_TYPE', message_ar: 'نوع التصدير غير معروف' });
    }
    if (!user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_EXPORT_SOURCE',
        message_ar: 'لا تملك صلاحية الوصول لبيانات هذا التقرير تحديدًا',
      });
    }

    const { rows, filename } = await this.reportsService.getExportRows(type, query);
    const csv = toCsv(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${Date.now()}.csv"`);
    res.send(csv);
  }
}
