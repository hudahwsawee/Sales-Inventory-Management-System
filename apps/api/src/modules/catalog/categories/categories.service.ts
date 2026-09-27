import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { nameAr: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message_ar: 'الفئة غير موجودة' });
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { nameAr: dto.nameAr } });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id); // يتحقق من الوجود ويرمي 404 عربي واضح إن لم توجد

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch {
      throw new ConflictException({
        code: 'CATEGORY_UPDATE_FAILED',
        message_ar: 'تعذّر تحديث الفئة، الرجاء المحاولة لاحقًا',
      });
    }
  }
}
