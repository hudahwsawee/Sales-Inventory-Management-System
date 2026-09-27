import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

const BCRYPT_COST_FACTOR = 12;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        isActive: true,
        userRoles: { include: { role: true } },
        createdAt: true,
      },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: { userRoles: { include: { role: true } } },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email ?? undefined }] },
    });
    if (existing) {
      throw new ConflictException({
        code: 'USER_ALREADY_EXISTS',
        message_ar: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        userRoles: {
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      },
      select: { id: true, fullName: true, username: true, email: true, isActive: true },
    });
  }

  /** إيقاف مستخدم — Soft Delete وليس حذفًا فعليًا (متطلب معتمد صراحة) */
  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ message_ar: 'المستخدم غير موجود' });

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, fullName: true, username: true, isActive: true },
    });
  }
}
