import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const CUSTOMER_TYPES = ['cash', 'credit'] as const;

export class CreateCustomerDto {
  @ApiProperty({ example: 'مطعم الأصالة' })
  @IsString()
  @IsNotEmpty({ message: 'اسم العميل مطلوب' })
  name: string;

  @ApiProperty({ example: '0501234567' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الجوال مطلوب' })
  mobileNumber: string;

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

  @ApiProperty({ enum: CUSTOMER_TYPES })
  @IsIn(CUSTOMER_TYPES, { message: 'نوع العميل يجب أن يكون نقدي أو آجل' })
  customerType: (typeof CUSTOMER_TYPES)[number];

  @ApiPropertyOptional({ example: 50000, description: 'الحد الائتماني — له معنى فقط للعميل الآجل' })
  @IsNumber({}, { message: 'الحد الائتماني يجب أن يكون رقمًا' })
  @Min(0, { message: 'الحد الائتماني لا يمكن أن يكون سالبًا' })
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsInt({ message: 'مدة السداد يجب أن تكون عددًا صحيحًا من الأيام' })
  @Min(0)
  @IsOptional()
  paymentTermsDays?: number;
}
