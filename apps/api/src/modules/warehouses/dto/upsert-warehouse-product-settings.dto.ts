import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class WarehouseProductSettingItemDto {
  @ApiProperty({ description: 'معرّف المنتج' })
  @IsString()
  @IsNotEmpty({ message: 'المنتج مطلوب' })
  productId: string;

  @ApiProperty({ example: 20 })
  @IsInt({ message: 'الحد الأدنى يجب أن يكون عددًا صحيحًا' })
  @Min(0, { message: 'الحد الأدنى لا يمكن أن يكون سالبًا' })
  minimumStock: number;

  @ApiPropertyOptional({ example: 30 })
  @IsInt({ message: 'نقطة إعادة الطلب يجب أن تكون عددًا صحيحًا' })
  @Min(0, { message: 'نقطة إعادة الطلب لا يمكن أن تكون سالبة' })
  @IsOptional()
  reorderLevel?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** PUT /warehouses/:id/product-settings — Upsert جماعي (Bulk) لعدة منتجات دفعة واحدة */
export class BulkUpsertWarehouseProductSettingsDto {
  @ApiProperty({ type: [WarehouseProductSettingItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إرسال إعداد واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => WarehouseProductSettingItemDto)
  items: WarehouseProductSettingItemDto[];
}
