import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryPaymentsDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  salesOrderId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerId?: string;
}
