import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'المخزن الرئيسي' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المخزن مطلوب' })
  name: string;

  @ApiProperty({ example: 'MAIN' })
  @IsString()
  @IsNotEmpty({ message: 'كود المخزن مطلوب' })
  code: string;

  @ApiPropertyOptional({ example: 'جدة، حي الصناعية' })
  @IsString()
  @IsOptional()
  address?: string;
}
