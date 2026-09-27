import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global — بحيث لا يحتاج كل Module لاستيراد PrismaModule يدويًا،
 * PrismaService متاح للحقن مباشرة في أي مكان بالتطبيق.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
