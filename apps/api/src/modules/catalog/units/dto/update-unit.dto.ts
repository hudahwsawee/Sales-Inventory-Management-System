import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: 'كرتون' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الوحدة مطلوب' })
  @IsOptional()
  nameAr?: string;

  @ApiPropertyOptional({ example: 'CTN' })
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل الوحدة — لا حذف فعلي' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
