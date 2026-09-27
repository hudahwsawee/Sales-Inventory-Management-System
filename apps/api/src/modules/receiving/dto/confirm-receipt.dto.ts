import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConfirmReceiptItemDto {
  @ApiProperty({ description: 'معرّف بند أمر الشراء (وليس معرّف المنتج) — لتفادي أي التباس' })
  @IsString()
  @IsNotEmpty({ message: 'بند أمر الشراء مطلوب' })
  purchaseOrderItemId: string;

  @ApiProperty({ example: 70 })
  @IsNumber({}, { message: 'الكمية المستلمة يجب أن تكون رقمًا' })
  @IsPositive({ message: 'الكمية المستلمة يجب أن تكون أكبر من صفر' })
  quantityReceived: number;

  @ApiPropertyOptional({
    description: 'التكلفة الفعلية للوحدة — إن لم تُرسَل يُستخدم سعر الوحدة في أمر الشراء',
    example: 46,
  })
  @IsNumber({}, { message: 'تكلفة الوحدة يجب أن تكون رقمًا' })
  @Min(0, { message: 'تكلفة الوحدة لا يمكن أن تكون سالبة' })
  @IsOptional()
  unitCost?: number;
}

export class ConfirmReceiptDto {
  @ApiProperty({ description: 'معرّف أمر الشراء' })
  @IsString()
  @IsNotEmpty({ message: 'أمر الشراء مطلوب' })
  purchaseOrderId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [ConfirmReceiptItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إضافة بند استلام واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => ConfirmReceiptItemDto)
  items: ConfirmReceiptItemDto[];
}
