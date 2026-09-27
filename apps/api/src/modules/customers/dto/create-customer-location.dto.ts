import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerLocationDto {
  @ApiPropertyOptional({ example: 'الفرع الرئيسي' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiProperty({ example: 'جدة، حي الروضة، شارع فلسطين' })
  @IsString()
  @IsNotEmpty({ message: 'العنوان مطلوب' })
  address: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
