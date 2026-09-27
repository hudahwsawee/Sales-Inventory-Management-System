import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface RecordAuditInput {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * AuditService — الكتابة الوحيدة المسموحة إلى جدول audit_logs.
 *
 * audit_logs جدول Append-only حسب التصميم المعتمد: لا توجد هنا أي دالة
 * update أو delete عن قصد. حساب التطبيق نفسه لا يُفترض أن يملك صلاحية
 * DELETE على هذا الجدول على مستوى قاعدة البيانات (تُضبَط عند إعداد صلاحيات
 * مستخدم اتصال Postgres في مرحلة النشر، وليس هنا في كود التطبيق).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          oldValue: (input.oldValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          newValue: (input.newValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // فشل تسجيل الـAudit لا يجب أن يُسقط العملية الأصلية الناجحة أصلًا،
      // لكنه يجب أن يُسجَّل بوضوح كخطأ تشغيلي حرج يستدعي انتباهًا فوريًا.
      this.logger.error(
        `فشل تسجيل Audit Log لعملية ${input.action} على ${input.entity}#${input.entityId}`,
        (error as Error)?.stack,
      );
    }
  }

  /** findByEntity — محفوظة كما كانت تمامًا (Backward Compatible) لأي استخدام مستقبلي يخص كيانًا واحدًا بعينه */
  async findByEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { id: true, fullName: true, username: true } } },
    });
  }

  /**
   * findAll — توسيع بسيط وآمن (Step 5 UI): فلاتر اختيارية + صفحات لعرض
   * سجل التدقيق كاملًا وليس فقط لكيان واحد. لا يغيّر findByEntity أعلاه
   * ولا سلوك record() إطلاقًا — إضافة صرفة بجانب ما هو موجود.
   */
  async findAll(query: QueryAuditLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userSearch
        ? {
            user: {
              OR: [
                { fullName: { contains: query.userSearch, mode: 'insensitive' } },
                { username: { contains: query.userSearch, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            timestamp: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, username: true } } },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
