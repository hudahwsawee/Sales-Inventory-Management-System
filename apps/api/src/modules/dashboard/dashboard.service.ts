import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';

export interface AlertsSummaryCounts {
  lowStock?: number;
  pendingApprovals?: number;
  creditLimitCustomers?: number;
  overduePurchaseOrders?: number;
}

/**
 * DashboardService — Step 6، "ملخص بسيط" فقط كما طُلِب صراحة (وليس Dashboard
 * كامل بمخططات مبيعات — ذلك لا يزال خارج النطاق). كل عدّاد هنا **يُحذَف
 * تمامًا من الاستجابة** إن لم يملك المستخدم الحالي الصلاحية المرتبطة
 * بمصدره — تطبيقًا حرفيًا لمتطلب RBAC رقم 7: "لا تعرض تنبيهات أو بيانات
 * للمستخدم إذا لم تكن لديه صلاحية لرؤية المصدر المرتبط بها". ADMIN يملك
 * كل الصلاحيات تلقائيًا (نظام RBAC معتمد سابقًا)، فيرى الأربعة جميعًا.
 */
@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
    private purchaseOrdersService: PurchaseOrdersService,
  ) {}

  async getAlertsSummary(userPermissions: string[]): Promise<AlertsSummaryCounts> {
    const has = (permission: string) => userPermissions.includes(permission);
    const result: AlertsSummaryCounts = {};

    if (has('inventory.view')) {
      const lowStockItems = await this.inventoryService.findLowStock();
      result.lowStock = lowStockItems.length;
    }

    if (has('approvals.view')) {
      result.pendingApprovals = await this.prisma.approval.count({ where: { status: 'pending' } });
    }

    if (has('customers.view')) {
      result.creditLimitCustomers = await this.countCustomersAtOrOverCreditLimit();
    }

    if (has('purchasing.view')) {
      // Step 6: نقطة الاستدعاء الفعلية لفحص التأخر وإصدار التنبيهات — لا
      // يوجد Scheduler حقيقي في المشروع (راجع توثيق PurchaseOrdersService)،
      // فتحميل ملخص لوحة التحكم من قِبل أي مستخدم يملك purchasing.view هو
      // ما يُشغِّل الفحص عمليًا. آمن تمامًا للاستدعاء المتكرر بفضل منع التكرار.
      await this.purchaseOrdersService.checkOverdueAndNotify();
      const overdue = await this.purchaseOrdersService.findOverdue();
      result.overduePurchaseOrders = overdue.length;
    }

    return result;
  }

  /**
   * countCustomersAtOrOverCreditLimit — مقارنة Decimal-Safe (.gte)، بلا أي
   * تحويل إلى Number لغرض اتخاذ القرار؛ Number() هنا فقط لعدّ العناصر
   * المطابقة (طول مصفوفة)، لا لمقارنة قيم مالية.
   */
  private async countCustomersAtOrOverCreditLimit(): Promise<number> {
    const creditCustomers = await this.prisma.customer.findMany({
      where: { customerType: 'credit', isActive: true },
      select: { currentBalance: true, creditLimit: true },
    });

    return creditCustomers.filter((c) => c.currentBalance.gte(c.creditLimit)).length;
  }
}
