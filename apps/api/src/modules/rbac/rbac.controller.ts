import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { RbacService } from './rbac.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

class SetRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}

@ApiTags('RBAC — الأدوار والصلاحيات')
@ApiBearerAuth()
@Controller()
export class RbacController {
  constructor(private rbacService: RbacService) {}

  @Get('roles')
  @RequirePermission('rbac.view_roles')
  @ApiOperation({ summary: 'عرض كل الأدوار مع صلاحياتها' })
  async findAllRoles() {
    return this.rbacService.findAllRoles();
  }

  @Get('permissions')
  @RequirePermission('rbac.view_roles')
  @ApiOperation({ summary: 'عرض كل الصلاحيات الذرية المتاحة في النظام' })
  async findAllPermissions() {
    return this.rbacService.findAllPermissions();
  }

  @Put('roles/:id/permissions')
  @RequirePermission('rbac.manage_roles')
  @AuditLog({ action: 'update', entity: 'roles' })
  @ApiOperation({ summary: 'تحديث صلاحيات دور معيّن (استبدال كامل للقائمة)' })
  async setRolePermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.rbacService.setRolePermissions(id, dto.permissionCodes);
  }
}
