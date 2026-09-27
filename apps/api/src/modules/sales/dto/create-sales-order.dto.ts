import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const PAYMENT_TYPES = ['cash', 'credit'] as const;

export class CreateSalesOrderItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId: string;

  @ApiProperty({ example: 5 })
  @IsNumber({}, { message: 'الكمية يجب أن تكون رقمًا' })
  @IsPositive({ message: 'الكمية يجب أن تكون أكبر من صفر' })
  quantity: number;

  @ApiProperty({ example: 55 })
  @IsNumber({}, { message: 'سعر الوحدة يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر الوحدة لا يمكن أن يكون سالبًا' })
  unitPrice: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber({}, { message: 'نسبة الخصم يجب أن تكون رقمًا' })
  @Min(0)
  @IsOptional()
  discountPercent?: number;
}

export class CreateSalesOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'العميل مطلوب' })
  customerId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerLocationId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'المخزن مطلوب' })
  warehouseId: string;

  @ApiProperty({ enum: PAYMENT_TYPES })
  @IsIn(PAYMENT_TYPES, { message: 'طريقة البيع يجب أن تكون نقدي أو آجل' })
  paymentType: (typeof PAYMENT_TYPES)[number];

  @ApiProperty({ type: [CreateSalesOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إضافة بند واحد على الأقل لطلب البيع' })
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items: CreateSalesOrderItemDto[];
}
