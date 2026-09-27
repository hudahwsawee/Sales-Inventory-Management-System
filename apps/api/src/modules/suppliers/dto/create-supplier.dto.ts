import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'شركة التوريد الحديثة' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المورد مطلوب' })
  name: string;

  @ApiPropertyOptional({ example: '0112345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'الرياض، حي الصناعية' })
  @IsString()
  @IsOptional()
  address?: string;
}
