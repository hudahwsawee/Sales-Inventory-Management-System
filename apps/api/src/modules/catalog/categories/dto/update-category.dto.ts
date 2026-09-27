import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'مواد غذائية جافة' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الفئة مطلوب' })
  @IsOptional()
  nameAr?: string;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل الفئة — لا حذف فعلي' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
