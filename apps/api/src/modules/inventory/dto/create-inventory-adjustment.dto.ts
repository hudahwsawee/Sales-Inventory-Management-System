import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateInventoryAdjustmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'المخزن مطلوب' })
  warehouseId: string;

  @ApiProperty({ enum: ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] })
  @IsIn(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'], { message: 'نوع التسوية غير معروف' })
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

  @ApiProperty({ example: 5 })
  @IsNumber({}, { message: 'الكمية يجب أن تكون رقمًا' })
  @IsPositive({ message: 'الكمية يجب أن تكون أكبر من صفر' })
  quantity: number;

  @ApiProperty({ example: 'جرد دوري — فرق تالف' })
  @IsString()
  @IsNotEmpty({ message: 'سبب التسوية مطلوب' })
  reason: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
