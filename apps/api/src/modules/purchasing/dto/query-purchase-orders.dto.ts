import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const STATUSES = ['draft', 'pending', 'partially_received', 'completed', 'cancelled'] as const;

export class QueryPurchaseOrdersDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES, { message: 'حالة أمر الشراء غير معروفة' })
  @IsOptional()
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ description: 'بحث برقم أمر الشراء' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString({}, { message: 'تاريخ البداية غير صالح' })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsDateString({}, { message: 'تاريخ النهاية غير صالح' })
  @IsOptional()
  dateTo?: string;

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
