import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * QueryReportsDto — فلتر مشترك لكل تقارير Step 7. كل حقل اختياري؛ كل
 * تقرير يستخدم ما يلزمه فقط ويتجاهل الباقي. dateFrom/dateTo/warehouseId
 * متاحة دائمًا (الحد الأدنى المطلوب صراحة)، والباقي حسب التقرير.
 */
export class QueryReportsDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsDateString({}, { message: 'تاريخ البداية غير صالح' })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsDateString({}, { message: 'تاريخ النهاية غير صالح' })
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ description: 'تجميع الاتجاه الزمني', enum: ['day', 'week', 'month', 'year'] })
  @IsIn(['day', 'week', 'month', 'year'])
  @IsOptional()
  groupBy?: 'day' | 'week' | 'month' | 'year';

  @ApiPropertyOptional({ description: 'مقارنة بالفترة السابقة المكافئة', enum: ['true', 'false'] })
  @IsIn(['true', 'false'])
  @IsOptional()
  compare?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 50;
}
