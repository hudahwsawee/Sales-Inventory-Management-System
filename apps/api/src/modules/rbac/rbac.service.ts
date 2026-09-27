import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  async findAllRoles() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: { module: 'asc' } });
  }

  /** يُستخدم عند تسجيل الدخول لتجميع كل صلاحيات المستخدم (عبر أدواره) في قائمة أكواد واحدة */
  async getUserPermissionCodes(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });

    const codes = new Set<string>();
    for (const ur of userRoles) {
      if (!ur.role.isActive) continue;
      for (const rp of ur.role.rolePermissions) {
        codes.add(rp.permission.code);
      }
    }
    return Array.from(codes);
  }

  async setRolePermissions(roleId: string, permissionCodes: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ message_ar: 'الدور غير موجود' });

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    return this.findAllRoles();
  }
}
