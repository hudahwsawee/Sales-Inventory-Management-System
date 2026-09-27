import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'كرتون' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الوحدة مطلوب' })
  nameAr: string;

  @ApiPropertyOptional({ example: 'CTN' })
  @IsString()
  @IsOptional()
  symbol?: string;
}
