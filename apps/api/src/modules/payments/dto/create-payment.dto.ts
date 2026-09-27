import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'طلب البيع مطلوب' })
  salesOrderId: string;

  @ApiProperty({ description: 'كود طريقة الدفع (مثال: cash, bank_transfer)' })
  @IsString()
  @IsNotEmpty({ message: 'طريقة الدفع مطلوبة' })
  paymentMethodCode: string;

  @ApiProperty({ example: 500 })
  @IsNumber({}, { message: 'المبلغ يجب أن يكون رقمًا' })
  @IsPositive({ message: 'المبلغ يجب أن يكون أكبر من صفر' })
  amount: number;

  @ApiPropertyOptional({ description: 'رقم مرجعي (إيصال/تحويل)' })
  @IsString()
  @IsOptional()
  referenceNumber?: string;
}
