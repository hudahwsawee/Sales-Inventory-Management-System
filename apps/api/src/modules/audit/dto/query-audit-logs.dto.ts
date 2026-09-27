import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const ACTIONS = ['create', 'update', 'deactivate', 'approve', 'reject', 'status_change'] as const;

/**
 * QueryAuditLogsDto — توسيع بسيط وآمن لِما كان موجودًا (entity/entity_id
 * فقط، إلزاميين ضمنيًا). كل الحقول هنا اختيارية، بما فيها entity/entityId،
 * حفاظًا على التوافق الكامل: أي استدعاء قديم بصيغة
 * `?entity=X&entity_id=Y` يعمل تمامًا كما كان، والاستدعاء العام بلا
 * فلاتر يُرجع قائمة مُصفَّحة بدل جلب كل السجلات دفعة واحدة.
 */
export class QueryAuditLogsDto {
  @ApiPropertyOptional({ description: 'اسم الكيان (مثال: sales_orders)' })
  @IsString()
  @IsOptional()
  entity?: string;

  @ApiPropertyOptional({ description: 'معرّف السجل المحدَّد' })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ enum: ACTIONS })
  @IsIn(ACTIONS, { message: 'نوع العملية غير معروف' })
  @IsOptional()
  action?: (typeof ACTIONS)[number];

  @ApiPropertyOptional({ description: 'بحث باسم المستخدم أو اسم الدخول' })
  @IsString()
  @IsOptional()
  userSearch?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsString()
  @IsOptional()
  dateTo?: string;

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
  @Max(100)
  @IsOptional()
  limit?: number = 50;
}
