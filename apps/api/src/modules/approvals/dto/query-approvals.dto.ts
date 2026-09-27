import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

const STATUSES = ['pending', 'approved', 'rejected'] as const;
const TYPES = ['discount_exceeded', 'credit_limit_exceeded', 'return_approval'] as const;

export class QueryApprovalsDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ enum: TYPES })
  @IsIn(TYPES)
  @IsOptional()
  approvalType?: (typeof TYPES)[number];
}
