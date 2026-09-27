import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationParams {
  userId?: string;
  roleId?: string;
  type: NotificationType;
  titleAr: string;
  messageAr: string;
  referenceType?: string;
  referenceId?: string;
}

/**
 * خريطة "التنبيهات التشغيلية" (Operational Alerts) → الصلاحية التي تمنح
 * رؤيتها. إصلاح Step 6.1 (المشكلتان 3 و4 معًا):
 *
 * سابقًا كانت رؤية إشعار موجَّه لدور تعتمد حصريًا على "هل المستخدم عضو
 * فعليًا في ذلك الدور؟" — وهذا يمنع ADMIN (الذي لا يُضاف عادة كعضو مباشر
 * في أدوار SALES/WAREHOUSE/PURCHASING) من رؤية تنبيهات تشغيلية يفترض أنه
 * يرى كل شيء فيها بصفته الإدارية. الإصلاح: هذه الأنواع تحديدًا (وهي دائمًا
 * موجَّهة لدور، لا لشخص بعينه أبدًا) تُرى أيضًا من قِبل أي مستخدم يملك
 * الصلاحية المقابلة لمصدرها — بصرف النظر عن عضويته الحرفية في ذلك الدور.
 * ADMIN يملك كل الصلاحيات دائمًا (RBAC معتمد سابقًا) فيرى الأربعة تلقائيًا،
 * دون كسر القاعدة العامة: "لا تنبيه لمن لا يملك صلاحية مصدره".
 *
 * `approval_decided` عمدًا **غير موجودة هنا** — إشعار شخصي بحت (لمقدّم
 * الطلب تحديدًا)، توسيع رؤيته حسب صلاحية عامة كان سيُسرِّب قرارات موافقة
 * خاصة بمستخدمين آخرين لأي شخص يملك 'approvals.view' — خطأ خصوصية حقيقي
 * تجنَّبته عمدًا.
 */
const OPERATIONAL_ALERT_PERMISSION_MAP: Partial<Record<NotificationType, string>> = {
  low_stock: 'inventory.view',
  approval_needed: 'approvals.view',
  credit_limit_exceeded: 'customers.view',
  po_delayed: 'purchasing.view',
};

/**
 * NotificationsService — إشعارات داخل النظام فقط (لا بريد/رسائل خارجية،
 * حسب القرار المعتمد صراحة). كل إنشاء يستهدف إما مستخدمًا محددًا (userId)
 * أو دورًا كاملًا (roleId) — أبدًا الاثنين معًا، مطابقةً لتصميم الجدول.
 *
 * === إصلاح Step 6.1 — Read State مستقل لكل مستخدم ===
 * `Notification.isRead` لم يعد يُستخدَم لتحديد "هل قرأه هذا المستخدم؟" —
 * ذلك يُقرَّر الآن حصريًا عبر وجود/غياب صف NotificationRead لـ(الإشعار ×
 * المستخدم الحالي). `isRead` المشترك أُبقي عليه فقط كبوابة داخلية لمنع
 * تكرار إصدار تنبيهات تشغيلية جديدة لنفس المشكلة القائمة (راجعوا التوثيق
 * الكامل في schema.prisma أعلى نموذج Notification).
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** create — يُستخدَم من ApprovalsService/ReturnsService/InventoryService، عادة داخل معاملة قائمة */
  async create(client: PrismaService | Prisma.TransactionClient, params: CreateNotificationParams) {
    return client.notification.create({
      data: {
        userId: params.userId,
        roleId: params.roleId,
        type: params.type,
        titleAr: params.titleAr,
        messageAr: params.messageAr,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      },
    });
  }

  /** notifyRole — طريقة مختصرة لإشعار كل مستخدمي دور معيّن دون معرفة IDs الأفراد */
  async notifyRoleByCode(
    client: PrismaService | Prisma.TransactionClient,
    roleCode: string,
    params: Omit<CreateNotificationParams, 'roleId' | 'userId'>,
  ) {
    const role = await client.role.findUnique({ where: { code: roleCode } });
    if (!role) return null; // احترازي — لا يجب أن يحدث مع أدوار Seed المعروفة
    return this.create(client, { ...params, roleId: role.id });
  }

  /** helper — نفس منطق تجميع أدوار المستخدم الحالي، مُعاد استخدامه في أكثر من دالة أدناه */
  private async getRoleIdsForUser(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return userRoles.map((ur) => ur.roleId);
  }

  /** يبني شرط الرؤية الكامل: شخصي + عضوية دور + صلاحية تشغيلية (راجعوا الخريطة أعلى الملف) */
  private buildVisibilityOr(userId: string, roleIds: string[], permissions: string[]): Prisma.NotificationWhereInput[] {
    const eligibleOperationalTypes = (Object.keys(OPERATIONAL_ALERT_PERMISSION_MAP) as NotificationType[]).filter(
      (type) => permissions.includes(OPERATIONAL_ALERT_PERMISSION_MAP[type]!),
    );

    return [
      { userId },
      ...(roleIds.length > 0 ? [{ roleId: { in: roleIds } }] : []),
      // roleId: {not: null} يقصر هذا الفرع على الإشعارات الموجَّهة لدور فقط
      // (لا يُوسِّع رؤية أي إشعار شخصي لمستخدم آخر إطلاقًا)
      ...(eligibleOperationalTypes.length > 0
        ? [{ type: { in: eligibleOperationalTypes }, roleId: { not: null } }]
        : []),
    ];
  }

  /**
   * findAllForCurrentUser — يتطلب الآن permissions أيضًا (لتفعيل رؤية
   * ADMIN/أي دور آخر للتنبيهات التشغيلية عبر الصلاحية، انظر التوثيق أعلاه).
   * isRead في الاستجابة يُحسَب لكل مستخدم من NotificationRead، وليس من
   * الحقل المشترك القديم.
   */
  async findAllForCurrentUser(
    userId: string,
    permissions: string[],
    unreadOnly?: boolean,
    type?: NotificationType,
  ) {
    const roleIds = await this.getRoleIdsForUser(userId);
    const visibilityOr = this.buildVisibilityOr(userId, roleIds, permissions);

    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: visibilityOr,
        ...(unreadOnly ? { reads: { none: { userId } } } : {}),
        ...(type ? { type } : {}),
      },
      include: { reads: { where: { userId } } }, // فقط للتحقق من قراءة *هذا* المستخدم تحديدًا
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return notifications.map(({ reads, ...notification }) => ({
      ...notification,
      isRead: reads.length > 0, // يطغى على الحقل المشترك القديم — هذا هو الصحيح لهذا المستخدم تحديدًا
    }));
  }

  /** getUnreadCount — عدد الإشعارات المرئية لهذا المستخدم وليس لها بعد صف NotificationRead خاص به */
  async getUnreadCount(userId: string, permissions: string[]): Promise<number> {
    const roleIds = await this.getRoleIdsForUser(userId);
    const visibilityOr = this.buildVisibilityOr(userId, roleIds, permissions);

    return this.prisma.notification.count({
      where: { OR: visibilityOr, reads: { none: { userId } } },
    });
  }

  /**
   * markRead — ينشئ صف NotificationRead خاصًا بهذا المستخدم فقط (Upsert
   * آمن لتكرار الاستدعاء)، **بلا أي أثر على ما يراه أي مستخدم آخر**. كما
   * يُحدِّث الحقل المشترك isRead=true (بوابة منع تكرار التنبيهات التشغيلية
   * فقط — راجعوا التوثيق في schema.prisma). يتحقق أولًا أن هذا الإشعار
   * مرئي فعليًا لهذا المستخدم قبل قبول العملية.
   */
  async markRead(id: string, userId: string, permissions: string[]) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message_ar: 'الإشعار غير موجود' });
    }

    if (notification.userId && notification.userId !== userId) {
      // إشعار خاص بمستخدم آخر تحديدًا — لا يجوز تعليمه كمقروء نيابةً عنه
      throw new ForbiddenException({ code: 'NOTIFICATION_NOT_YOURS', message_ar: 'هذا الإشعار ليس لك' });
    }

    if (notification.roleId) {
      const roleIds = await this.getRoleIdsForUser(userId);
      const isMemberOfRole = roleIds.includes(notification.roleId);
      const hasOperationalPermission =
        OPERATIONAL_ALERT_PERMISSION_MAP[notification.type] !== undefined &&
        permissions.includes(OPERATIONAL_ALERT_PERMISSION_MAP[notification.type]!);
      if (!isMemberOfRole && !hasOperationalPermission) {
        throw new ForbiddenException({ code: 'NOTIFICATION_NOT_VISIBLE', message_ar: 'لا تملك صلاحية الوصول لهذا الإشعار' });
      }
    }

    await this.prisma.notificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId } },
      create: { notificationId: id, userId },
      update: {}, // موجود بالفعل — لا شيء لتحديثه (readAt الأصلي يبقى كما هو)
    });

    // بوابة منع التكرار العامة فقط — لا تؤثر على حالة القراءة الشخصية لأي مستخدم آخر
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  /**
   * markAllRead — يُعلِّم فقط الإشعارات المرئية فعليًا لهذا المستخدم وغير
   * مقروءة له تحديدًا بعد (Upsert جماعي عبر createMany + skipDuplicates
   * لتفادي أي تعارض على القيد الفريد تحت التزامن).
   */
  async markAllRead(userId: string, permissions: string[]): Promise<{ count: number }> {
    const roleIds = await this.getRoleIdsForUser(userId);
    const visibilityOr = this.buildVisibilityOr(userId, roleIds, permissions);

    const unreadNotifications = await this.prisma.notification.findMany({
      where: { OR: visibilityOr, reads: { none: { userId } } },
      select: { id: true },
    });

    if (unreadNotifications.length === 0) return { count: 0 };

    const unreadIds = unreadNotifications.map((n) => n.id);

    await this.prisma.notificationRead.createMany({
      data: unreadIds.map((notificationId) => ({ notificationId, userId })),
      skipDuplicates: true,
    });

    // بوابة منع التكرار العامة فقط — راجعوا توثيق isRead في schema.prisma
    await this.prisma.notification.updateMany({ where: { id: { in: unreadIds } }, data: { isRead: true } });

    return { count: unreadIds.length };
  }
}
