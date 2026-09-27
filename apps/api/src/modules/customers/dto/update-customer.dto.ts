import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const CUSTOMER_TYPES = ['cash', 'credit'] as const;

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty({ message: 'اسم العميل مطلوب' })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxNumber?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_TYPES })
  @IsIn(CUSTOMER_TYPES)
  @IsOptional()
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiPropertyOptional()
  @IsNumber({}, { message: 'الحد الائتماني يجب أن يكون رقمًا' })
  @Min(0, { message: 'الحد الائتماني لا يمكن أن يكون سالبًا' })
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  paymentTermsDays?: number;

  @ApiPropertyOptional({ description: 'تفعيل/تعطيل العميل — لا حذف فعلي' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
