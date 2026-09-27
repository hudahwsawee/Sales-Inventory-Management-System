import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * تحديث محدود عمدًا: العنوان فقط (تاريخ التوريد المتوقع + الملاحظات).
 * لا تعديل للبنود أو الحالة هنا — الحالة تُدار حصريًا عبر /cancel أو تلقائيًا
 * أثناء الاستلام، والبنود تُحدَّد عند الإنشاء فقط (تبسيط متعمَّد لهذه المرحلة).
 */
export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ example: '2026-01-20' })
  @IsDateString({}, { message: 'تاريخ التوريد المتوقع غير صالح' })
  @IsOptional()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
