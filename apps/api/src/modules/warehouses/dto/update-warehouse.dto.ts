import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'المخزن الرئيسي' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المخزن مطلوب' })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'MAIN' })
  @IsString()
  @IsNotEmpty({ message: 'كود المخزن مطلوب' })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل المخزن — لا حذف فعلي' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
