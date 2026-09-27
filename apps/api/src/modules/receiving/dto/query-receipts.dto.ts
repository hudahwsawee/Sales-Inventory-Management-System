import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryReceiptsDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  purchaseOrderId?: string;
}
