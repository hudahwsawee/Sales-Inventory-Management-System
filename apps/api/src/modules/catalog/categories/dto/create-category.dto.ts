import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'مواد غذائية جافة' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الفئة مطلوب' })
  nameAr: string;
}
