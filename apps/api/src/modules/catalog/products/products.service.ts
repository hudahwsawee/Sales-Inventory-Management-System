import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryProductsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const includeInactive = query.includeInactive === 'true';

    const where: Prisma.ProductWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.search
        ? {
            OR: [
              { nameAr: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true, brand: true, unit: true },
        orderBy: { nameAr: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, brand: true, unit: true },
    });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message_ar: 'المنتج غير موجود' });
    }
    return product;
  }

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: { category: true, brand: true, unit: true },
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND_BY_BARCODE',
        message_ar: 'لا يوجد منتج بهذا الباركود',
      });
    }
    if (!product.isActive) {
      throw new NotFoundException({
        code: 'PRODUCT_INACTIVE',
        message_ar: 'هذا المنتج موقَف حاليًا',
      });
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    await this.assertReferencesExist(dto.categoryId, dto.unitId, dto.brandId);

    try {
      return await this.prisma.product.create({
        data: {
          code: dto.code,
          nameAr: dto.nameAr,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          unitId: dto.unitId,
          barcode: dto.barcode,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          defaultMinimumStock: dto.defaultMinimumStock,
          // average_cost: لا يُمرَّر هنا إطلاقًا — يبقى على القيمة الافتراضية 0
          // في قاعدة البيانات حتى أول عملية استلام فعلي (Purchase Receipt).
        },
        include: { category: true, brand: true, unit: true },
      });
    } catch (error) {
      throw this.mapUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    await this.assertReferencesExist(dto.categoryId, dto.unitId, dto.brandId ?? undefined);

    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
          ...(dto.unitId !== undefined ? { unitId: dto.unitId } : {}),
          ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
          ...(dto.purchasePrice !== undefined ? { purchasePrice: dto.purchasePrice } : {}),
          ...(dto.sellingPrice !== undefined ? { sellingPrice: dto.sellingPrice } : {}),
          ...(dto.defaultMinimumStock !== undefined
            ? { defaultMinimumStock: dto.defaultMinimumStock }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          // average_cost عمدًا غير قابل للتعديل عبر هذا الـEndpoint
        },
        include: { category: true, brand: true, unit: true },
      });
    } catch (error) {
      throw this.mapUniqueConstraintError(error);
    }
  }

  /** يتحقق أن الفئة/الوحدة/العلامة التجارية (إن وُجدت) موجودة فعليًا قبل الإدراج، برسالة عربية واضحة */
  private async assertReferencesExist(categoryId?: string, unitId?: string, brandId?: string) {
    if (categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message_ar: 'الفئة المحدَّدة غير موجودة' });
      }
    }
    if (unitId) {
      const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
      if (!unit) {
        throw new BadRequestException({ code: 'UNIT_NOT_FOUND', message_ar: 'وحدة القياس المحدَّدة غير موجودة' });
      }
    }
    if (brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        throw new BadRequestException({ code: 'BRAND_NOT_FOUND', message_ar: 'العلامة التجارية المحدَّدة غير موجودة' });
      }
    }
  }

  /** يحوّل خطأ Prisma P2002 (Unique Constraint) إلى رسالة عربية مفهومة بدل خطأ تقني خام */
  private mapUniqueConstraintError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? '';
      if (target.includes('barcode')) {
        return new ConflictException({
          code: 'PRODUCT_BARCODE_DUPLICATE',
          message_ar: 'هذا الباركود مستخدم بالفعل لمنتج آخر',
        });
      }
      if (target.includes('code')) {
        return new ConflictException({
          code: 'PRODUCT_CODE_DUPLICATE',
          message_ar: 'كود المنتج مستخدم بالفعل',
        });
      }
      return new ConflictException({
        code: 'PRODUCT_DUPLICATE',
        message_ar: 'يوجد تعارض في بيانات فريدة لهذا المنتج',
      });
    }
    return error as Error;
  }
}
