import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'preparing',
  'ready_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
] as const;

export class QuerySalesOrdersDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES, { message: 'حالة طلب البيع غير معروفة' })
  @IsOptional()
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ description: 'بحث برقم الطلب' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
