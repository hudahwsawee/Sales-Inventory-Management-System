import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'أحمد محمد' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'ahmed.mohammed' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'ahmed@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' })
  password: string;

  @ApiProperty({ example: '0501234567', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: ['role-uuid-here'], type: [String] })
  @IsString({ each: true })
  roleIds: string[];
}
