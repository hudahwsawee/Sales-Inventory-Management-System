import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * ملاحظة تصميمية مهمة: `average_cost` **غير موجود عمدًا** في هذا الـDTO.
 * حسب التصميم المعتمد، هذا الحقل يُحدَّث تلقائيًا فقط عند كل عملية استلام
 * فعلي (Purchase Receipt) عبر معادلة Average Cost المرجّحة — وليس حقلًا
 * يُدخله المستخدم مباشرة عند إنشاء أو تعديل منتج. لا تُضيفوه هنا لاحقًا
 * دون مراجعة تصميم Costing المعتمد.
 */
export class CreateProductDto {
  @ApiProperty({ example: 'PRD-0001' })
  @IsString()
  @IsNotEmpty({ message: 'كود المنتج مطلوب' })
  code: string;

  @ApiProperty({ example: 'أرز بسمتي 5 كجم' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المنتج مطلوب' })
  nameAr: string;

  @ApiProperty({ description: 'معرّف الفئة' })
  @IsString()
  @IsNotEmpty({ message: 'الفئة مطلوبة' })
  categoryId: string;

  @ApiPropertyOptional({ description: 'معرّف العلامة التجارية (اختياري)' })
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiProperty({ description: 'معرّف وحدة القياس' })
  @IsString()
  @IsNotEmpty({ message: 'وحدة القياس مطلوبة' })
  unitId: string;

  @ApiPropertyOptional({ example: '6281234567890' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiProperty({ example: 45.5 })
  @IsNumber({}, { message: 'سعر الشراء يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر الشراء لا يمكن أن يكون سالبًا' })
  purchasePrice: number;

  @ApiProperty({ example: 55 })
  @IsNumber({}, { message: 'سعر البيع يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر البيع لا يمكن أن يكون سالبًا' })
  sellingPrice: number;

  @ApiPropertyOptional({ example: 20, description: 'قيمة قالب اقتراحية فقط — لا تُستخدم في أي تنبيه فعلي' })
  @IsInt({ message: 'الحد الأدنى الافتراضي يجب أن يكون عددًا صحيحًا' })
  @Min(0, { message: 'الحد الأدنى الافتراضي لا يمكن أن يكون سالبًا' })
  @IsOptional()
  defaultMinimumStock?: number;
}
