import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.brand.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { nameAr: 'asc' },
    });
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      throw new NotFoundException({ code: 'BRAND_NOT_FOUND', message_ar: 'العلامة التجارية غير موجودة' });
    }
    return brand;
  }

  async create(dto: CreateBrandDto) {
    return this.prisma.brand.create({ data: { nameAr: dto.nameAr } });
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.findOne(id);

    try {
      return await this.prisma.brand.update({
        where: { id },
        data: {
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch {
      throw new ConflictException({
        code: 'BRAND_UPDATE_FAILED',
        message_ar: 'تعذّر تحديث العلامة التجارية، الرجاء المحاولة لاحقًا',
      });
    }
  }
}
