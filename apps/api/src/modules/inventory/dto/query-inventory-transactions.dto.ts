import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const TRANSACTION_TYPES = ['purchase_receipt', 'sale', 'customer_return', 'supplier_return', 'adjustment'] as const;

export class QueryInventoryTransactionsDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: TRANSACTION_TYPES })
  @IsIn(TRANSACTION_TYPES, { message: 'نوع الحركة غير معروف' })
  @IsOptional()
  transactionType?: (typeof TRANSACTION_TYPES)[number];

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

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 50;
}
