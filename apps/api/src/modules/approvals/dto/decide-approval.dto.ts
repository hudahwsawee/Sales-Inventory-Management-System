import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class DecideApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'], { message: 'القرار يجب أن يكون approved أو rejected' })
  decision: 'approved' | 'rejected';

  @ApiPropertyOptional({ description: 'إلزامي عند الرفض' })
  @ValidateIf((o: { decision: string }) => o.decision === 'rejected')
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض إلزامي' })
  reason?: string;
}
