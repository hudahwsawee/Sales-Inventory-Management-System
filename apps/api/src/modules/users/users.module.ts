import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // يُستخدم من AuthModule عند التحقق من بيانات الدخول
})
export class UsersModule {}
