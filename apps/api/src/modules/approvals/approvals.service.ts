import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { QueryApprovalsDto } from './dto/query-approvals.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async findAll(query: QueryApprovalsDto) {
    return this.prisma.approval.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.approvalType ? { approvalType: query.approvalType } : {}),
      },
      include: {
        requester: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
        return: { select: { id: true, returnNumber: true, returnType: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const approval = await this.prisma.approval.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
        return: { include: { items: { include: { product: true } } } },
      },
    });
    if (!approval) {
      throw new NotFoundException({ code: 'APPROVAL_NOT_FOUND', message_ar: 'طلب الموافقة غير موجود' });
    }
    return approval;
  }

  /**
   * decide — قرار عام (موافقة/رفض) قابل لإعادة الاستخدام لأي approvalType
   * مستقبلًا. **الأثر الخاص بنوع الموافقة** (تحديث حالة الكيان المرتبط)
   * يُطبَّق هنا صراحة عبر تفريع بسيط — return_approval هو النوع الوحيد
   * المُفعَّل فعليًا في Step 5 (discount_exceeded/credit_limit_exceeded
   * تبقيان معرَّفتين في enum دون منطق مفعَّل، تمامًا كما كانتا قبل هذه
   * الخطوة — لا نضيف موافقة قسرية لمسار Sales Orders الذي لم يطلبها التصميم
   * المعتمد لـStep 4).
   */
  async decide(id: string, dto: DecideApprovalDto, approverUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      // استحواذ ذرّي على القرار — يمنع اتخاذ قرارين متزامنين على نفس الطلب
      const claim = await tx.approval.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: dto.decision,
          approverId: approverUserId,
          reason: dto.reason,
          decidedAt: new Date(),
        },
      });

      if (claim.count === 0) {
        throw new ConflictException({
          code: 'APPROVAL_ALREADY_DECIDED',
          message_ar: 'تم اتخاذ قرار بشأن هذا الطلب بالفعل',
        });
      }

      const approval = await tx.approval.findUniqueOrThrow({ where: { id } });

      if (approval.approvalType === 'return_approval' && approval.returnId) {
        // حارس أمان: لو أُلغي المرتجع مباشرة (Cancel) أثناء انتظار الموافقة،
        // لا يجب لقرار متأخر أن "يُعيد إحياءه" بنقله إلى approved خطأً.
        const linkedReturn = await tx.return.findUniqueOrThrow({ where: { id: approval.returnId } });
        if (linkedReturn.status !== 'pending_approval') {
          throw new ConflictException({
            code: 'RETURN_NO_LONGER_PENDING',
            message_ar: 'حالة المرتجع تغيّرت منذ إرسال طلب الموافقة (على الأرجح أُلغي) — لا يمكن تطبيق القرار',
          });
        }

        await tx.return.update({
          where: { id: approval.returnId },
          data: { status: dto.decision === 'approved' ? 'approved' : 'cancelled' },
        });
      }

      await this.notificationsService.create(tx, {
        userId: approval.requestedBy,
        type: 'approval_decided',
        titleAr: dto.decision === 'approved' ? 'تمت الموافقة على طلبك' : 'تم رفض طلبك',
        messageAr:
          dto.decision === 'approved'
            ? 'تمت الموافقة على طلب الموافقة الخاص بك.'
            : `تم رفض طلبك. السبب: ${dto.reason}`,
        referenceType: 'approval',
        referenceId: approval.id,
      });

      return approval;
    });
  }
}
