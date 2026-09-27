import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const RETURN_TYPES = ['customer_return', 'supplier_return'] as const;
const STATUSES = ['draft', 'pending_approval', 'approved', 'completed', 'cancelled'] as const;

export class QueryReturnsDto {
  @ApiPropertyOptional({ enum: RETURN_TYPES })
  @IsIn(RETURN_TYPES)
  @IsOptional()
  returnType?: (typeof RETURN_TYPES)[number];

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supplierId?: string;

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
