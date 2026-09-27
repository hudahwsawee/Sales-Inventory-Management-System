import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSupplierProductDto {
  @ApiProperty({ description: 'معرّف المنتج' })
  @IsString()
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId: string;

  @ApiProperty({ example: 42.5 })
  @IsNumber({}, { message: 'سعر المورد يجب أن يكون رقمًا' })
  @Min(0, { message: 'سعر المورد لا يمكن أن يكون سالبًا' })
  supplierPrice: number;

  @ApiPropertyOptional({ example: 'SUP-CODE-123' })
  @IsString()
  @IsOptional()
  supplierProductCode?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'المورد المفضَّل لهذا المنتج — تفعيله يُلغي تفضيل أي مورد آخر لنفس المنتج تلقائيًا',
  })
  @IsBoolean()
  @IsOptional()
  isPreferred?: boolean;
}
