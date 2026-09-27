import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryCustomersDto {
  @ApiPropertyOptional({ description: 'بحث بالاسم أو رقم الجوال' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  includeInactive?: string;
}
