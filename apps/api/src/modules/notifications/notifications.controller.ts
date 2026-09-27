import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * لا صلاحية RBAC مخصَّصة لهذه الشاشة عمدًا — الإشعارات مرتبطة بشخص
 * المستخدم الحالي (أو أدواره، أو صلاحياته للتنبيهات التشغيلية — راجعوا
 * NotificationsService) وليست موردًا يحتاج فصلًا بالصلاحيات على مستوى
 * الـController، تمامًا كأي نظام إشعارات قياسي.
 *
 * إصلاح Step 6.1: حالة القراءة (isRead) أصبحت خاصة بكل مستخدم فعليًا
 * (NotificationRead)، وليست حقلًا مشتركًا على الإشعار يُخفيه عن الجميع
 * بمجرد قراءة عضو واحد من دوره. كما أصبح ADMIN (وأي مستخدم يملك الصلاحية
 * المناسبة) يرى التنبيهات التشغيلية (Low Stock/Approvals/Credit Limit/
 * PO Delayed) حتى دون عضوية حرفية في الدور المستهدف أصلًا بالإشعار.
 */
@ApiTags('Notifications — الإشعارات')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiQuery({ name: 'unread_only', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, enum: ['low_stock', 'approval_needed', 'credit_limit_exceeded', 'po_delayed', 'order_rejected', 'approval_decided'] })
  @ApiOperation({ summary: 'عرض إشعارات المستخدم الحالي (شخصية + دور + تنبيهات تشغيلية حسب الصلاحية)، بفلترة اختيارية بالنوع' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('unread_only') unreadOnly?: string,
    @Query('type') type?: NotificationType,
  ) {
    return this.notificationsService.findAllForCurrentUser(user.userId, user.permissions, unreadOnly === 'true', type);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'عدد الإشعارات غير المقروءة للمستخدم الحالي تحديدًا' })
  async unreadCount(@CurrentUser() user: CurrentUserPayload) {
    const count = await this.notificationsService.getUnreadCount(user.userId, user.permissions);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'تعليم إشعار واحد كمقروء لهذا المستخدم تحديدًا فقط' })
  async markRead(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markRead(id, user.userId, user.permissions);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'تعليم كل إشعارات المستخدم الحالي المرئية له كمقروءة دفعة واحدة (لا يؤثر على أي مستخدم آخر)' })
  async markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllRead(user.userId, user.permissions);
  }
}
