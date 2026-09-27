import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelSalesOrderDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}
