import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.unit.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { nameAr: 'asc' },
    });
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException({ code: 'UNIT_NOT_FOUND', message_ar: 'الوحدة غير موجودة' });
    }
    return unit;
  }

  async create(dto: CreateUnitDto) {
    return this.prisma.unit.create({ data: { nameAr: dto.nameAr, symbol: dto.symbol } });
  }

  async update(id: string, dto: UpdateUnitDto) {
    await this.findOne(id);

    try {
      return await this.prisma.unit.update({
        where: { id },
        data: {
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.symbol !== undefined ? { symbol: dto.symbol } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch {
      throw new ConflictException({
        code: 'UNIT_UPDATE_FAILED',
        message_ar: 'تعذّر تحديث الوحدة، الرجاء المحاولة لاحقًا',
      });
    }
  }
}
