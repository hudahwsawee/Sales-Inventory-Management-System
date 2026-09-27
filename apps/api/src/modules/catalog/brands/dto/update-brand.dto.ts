import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateBrandDto {
  @ApiPropertyOptional({ example: 'العلامة التجارية أ' })
  @IsString()
  @IsNotEmpty({ message: 'اسم العلامة التجارية مطلوب' })
  @IsOptional()
  nameAr?: string;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل العلامة التجارية — لا حذف فعلي' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
