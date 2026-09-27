import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';

const PAYABLE_STATUSES = ['approved', 'delivered'] as const;

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPaymentsDto) {
    return this.prisma.payment.findMany({
      where: {
        ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      include: {
        paymentMethod: true,
        receiver: { select: { id: true, fullName: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  /**
   * create — تسجيل دفعة، بحماية ذرية من تجاوز المتبقي تحت التزامن (Race).
   * التحديث الذري لـsales_orders.paid_amount يقارن `(total_amount -
   * paid_amount) >= amount` مباشرة في SQL (مقارنة بين عمودين لا يدعمها
   * Prisma تصريحيًا) — نفس مبدأ الاستحواذ الذري المعتمد أصلًا في الحجز
   * والتسويات. طلبا دفع متزامنان يتجاوز مجموعهما المتبقي: أحدهما فقط ينجح.
   */
  async create(dto: CreatePaymentDto, userId: string) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id: dto.salesOrderId } });
    if (!order) {
      throw new NotFoundException({ code: 'SALES_ORDER_NOT_FOUND', message_ar: 'طلب البيع غير موجود' });
    }
    if (!PAYABLE_STATUSES.includes(order.status as (typeof PAYABLE_STATUSES)[number])) {
      throw new ConflictException({
        code: 'SALES_ORDER_NOT_PAYABLE',
        message_ar: 'لا يمكن تسجيل دفعة لطلب لم يُعتمَد بعد أو تم إلغاؤه',
      });
    }

    const paymentMethod = await this.prisma.paymentMethod.findUnique({ where: { code: dto.paymentMethodCode } });
    if (!paymentMethod || !paymentMethod.isActive) {
      throw new BadRequestException({ code: 'PAYMENT_METHOD_INVALID', message_ar: 'طريقة الدفع غير معروفة أو غير نشطة' });
    }

    return this.prisma.$transaction(async (tx) => {
      // === الاستحواذ الذري: يمنع تجاوز الرصيد المتبقي حتى تحت التزامن ===
      const affectedRows = await tx.$executeRaw`
        UPDATE sales_orders
        SET paid_amount = paid_amount + ${dto.amount}
        WHERE id = ${dto.salesOrderId} AND (total_amount - paid_amount) >= ${dto.amount}
      `;

      if (affectedRows === 0) {
        throw new BadRequestException({
          code: 'OVERPAYMENT_NOT_ALLOWED',
          message_ar: 'المبلغ المدخل أكبر من المبلغ المتبقي على الطلب',
        });
      }

      const payment = await tx.payment.create({
        data: {
          salesOrderId: dto.salesOrderId,
          customerId: order.customerId,
          paymentMethodId: paymentMethod.id,
          amount: dto.amount,
          status: 'completed',
          receivedBy: userId,
          referenceNumber: dto.referenceNumber,
        },
        include: { paymentMethod: true },
      });

      // البيع الآجل فقط يحمل التزامًا ائتمانيًا على العميل أصلًا (رُفِع عند
      // /confirm) — السداد يُخفِّضه بنفس القيمة. الطلبات النقدية لا تُنشئ
      // التزامًا على current_balance من الأساس، فلا داعي لمسّه هنا.
      if (order.paymentType === 'credit') {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { currentBalance: { decrement: dto.amount } },
        });
      }

      const updatedOrder = await tx.salesOrder.findUniqueOrThrow({ where: { id: dto.salesOrderId } });

      return {
        payment,
        remainingBalance: Number(updatedOrder.totalAmount) - Number(updatedOrder.paidAmount),
      };
    });
  }
}
