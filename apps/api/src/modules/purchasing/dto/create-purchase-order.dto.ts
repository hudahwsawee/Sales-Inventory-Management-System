import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({ description: 'معرّف المنتج' })
  @IsString()
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId: string;

  @ApiProperty({ example: 100 })
  @IsNumber({}, { message: 'الكمية المطلوبة يجب أن تكون رقمًا' })
  @IsPositive({ message: 'الكمية المطلوبة يجب أن تكون أكبر من صفر' })
  quantityOrdered: number;

  @ApiProperty({ example: 45.5 })
  @IsNumber({}, { message: 'سعر الوحدة يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر الوحدة لا يمكن أن يكون سالبًا' })
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'معرّف المورد' })
  @IsString()
  @IsNotEmpty({ message: 'المورد مطلوب' })
  supplierId: string;

  @ApiProperty({ description: 'معرّف المخزن المستهدف بالاستلام' })
  @IsString()
  @IsNotEmpty({ message: 'المخزن مطلوب' })
  warehouseId: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsDateString({}, { message: 'تاريخ التوريد المتوقع غير صالح' })
  @IsOptional()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إضافة بند واحد على الأقل لأمر الشراء' })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
