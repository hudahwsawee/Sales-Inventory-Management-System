import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBrandDto {
  @ApiProperty({ example: 'العلامة التجارية أ' })
  @IsString()
  @IsNotEmpty({ message: 'اسم العلامة التجارية مطلوب' })
  nameAr: string;
}
