import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * تحديث محدود عمدًا لحالة Draft فقط: العنوان (عنوان التسليم). لا تعديل
 * للبنود أو الكميات بعد الإنشاء — نفس تبسيط أوامر الشراء في Step 3.
 */
export class UpdateSalesOrderDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerLocationId?: string;
}
