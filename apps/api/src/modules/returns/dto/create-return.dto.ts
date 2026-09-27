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
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const RETURN_TYPES = ['customer_return', 'supplier_return'] as const;

export class CreateReturnItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId: string;

  @ApiProperty({ example: 2 })
  @IsNumber({}, { message: 'الكمية يجب أن تكون رقمًا' })
  @IsPositive({ message: 'الكمية يجب أن تكون أكبر من صفر' })
  quantity: number;

  @ApiProperty({ example: 55 })
  @IsNumber({}, { message: 'سعر الوحدة يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر الوحدة لا يمكن أن يكون سالبًا' })
  unitPrice: number;

  @ApiPropertyOptional({ example: 'تالف عند الاستلام' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateReturnDto {
  @ApiProperty({ enum: RETURN_TYPES })
  @IsIn(RETURN_TYPES, { message: 'نوع المرتجع يجب أن يكون customer_return أو supplier_return' })
  returnType: (typeof RETURN_TYPES)[number];

  @ApiPropertyOptional({ description: 'إلزامي لمرتجع العميل' })
  @ValidateIf((o: { returnType: string }) => o.returnType === 'customer_return')
  @IsString()
  @IsNotEmpty({ message: 'العميل مطلوب لمرتجع العميل' })
  customerId?: string;

  @ApiPropertyOptional({ description: 'إلزامي لمرتجع المورد' })
  @ValidateIf((o: { returnType: string }) => o.returnType === 'supplier_return')
  @IsString()
  @IsNotEmpty({ message: 'المورد مطلوب لمرتجع المورد' })
  supplierId?: string;

  @ApiPropertyOptional({ description: 'إلزامي لمرتجع العميل — أمر البيع الأصلي' })
  @ValidateIf((o: { returnType: string }) => o.returnType === 'customer_return')
  @IsString()
  @IsNotEmpty({ message: 'أمر البيع الأصلي مطلوب لمرتجع العميل' })
  referenceSalesOrderId?: string;

  @ApiPropertyOptional({ description: 'إلزامي لمرتجع المورد — أمر الشراء الأصلي' })
  @ValidateIf((o: { returnType: string }) => o.returnType === 'supplier_return')
  @IsString()
  @IsNotEmpty({ message: 'أمر الشراء الأصلي مطلوب لمرتجع المورد' })
  referencePurchaseOrderId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'المخزن مطلوب' })
  warehouseId: string;

  @ApiProperty({ type: [CreateReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إضافة بند واحد على الأقل للمرتجع' })
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items: CreateReturnItemDto[];
}
