import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'PRD-0001' })
  @IsString()
  @IsNotEmpty({ message: 'كود المنتج مطلوب' })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'أرز بسمتي 5 كجم' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المنتج مطلوب' })
  @IsOptional()
  nameAr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'يمكن إرسال null لإزالة العلامة التجارية' })
  @IsOptional()
  brandId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ description: 'يمكن إرسال null لإزالة الباركود' })
  @IsOptional()
  barcode?: string | null;

  @ApiPropertyOptional()
  @IsNumber({}, { message: 'سعر الشراء يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر الشراء لا يمكن أن يكون سالبًا' })
  @IsOptional()
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsNumber({}, { message: 'سعر البيع يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر البيع لا يمكن أن يكون سالبًا' })
  @IsOptional()
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsInt({ message: 'الحد الأدنى الافتراضي يجب أن يكون عددًا صحيحًا' })
  @Min(0, { message: 'الحد الأدنى الافتراضي لا يمكن أن يكون سالبًا' })
  @IsOptional()
  defaultMinimumStock?: number;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل المنتج — لا حذف فعلي' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
