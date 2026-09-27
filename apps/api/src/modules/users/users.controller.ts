import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

@ApiTags('Users — إدارة المستخدمين')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @RequirePermission('users.view')
  @ApiOperation({ summary: 'عرض كل المستخدمين النشطين' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @RequirePermission('users.manage')
  @AuditLog({ action: 'create', entity: 'users' })
  @ApiOperation({ summary: 'إنشاء مستخدم جديد وربطه بدور/أدوار' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id/deactivate')
  @RequirePermission('users.manage')
  @AuditLog({ action: 'deactivate', entity: 'users' })
  @ApiOperation({ summary: 'إيقاف مستخدم (Soft Delete — لا حذف فعلي)' })
  async deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }
}
