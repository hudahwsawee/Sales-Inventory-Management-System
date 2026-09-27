import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { BulkUpsertWarehouseProductSettingsDto } from './dto/upsert-warehouse-product-settings.dto';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.warehouse.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException({ code: 'WAREHOUSE_NOT_FOUND', message_ar: 'المخزن غير موجود' });
    }
    return warehouse;
  }

  async create(dto: CreateWarehouseDto) {
    try {
      return await this.prisma.warehouse.create({ data: dto });
    } catch (error) {
      throw this.mapUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    try {
      return await this.prisma.warehouse.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapUniqueConstraintError(error);
    }
  }

  // ---------------------------------------------------------------------
  // Warehouse Product Settings (الحد الأدنى لكل منتج × مخزن)
  // ---------------------------------------------------------------------

  async listProductSettings(warehouseId: string) {
    await this.findOne(warehouseId);
    return this.prisma.warehouseProductSetting.findMany({
      where: { warehouseId },
      include: { product: true },
      orderBy: { product: { nameAr: 'asc' } },
    });
  }

  /**
   * Upsert جماعي: يحدّث الإعداد إن وُجد لنفس Product×Warehouse، وإلا يُنشئه.
   * كل عنصر داخل معاملة واحدة مستقلة، وكل العملية بأكملها معاملة واحدة شاملة.
   */
  async upsertProductSettings(warehouseId: string, dto: BulkUpsertWarehouseProductSettingsDto) {
    await this.findOne(warehouseId);

    const productIds = dto.items.map((i) => i.productId);
    const existingProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    const existingIds = new Set(existingProducts.map((p) => p.id));
    const missing = productIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'PRODUCT_NOT_FOUND',
        message_ar: `المنتجات التالية غير موجودة: ${missing.join(', ')}`,
      });
    }

    return this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.warehouseProductSetting.upsert({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
          create: {
            productId: item.productId,
            warehouseId,
            minimumStock: item.minimumStock,
            reorderLevel: item.reorderLevel,
            isActive: item.isActive ?? true,
          },
          update: {
            minimumStock: item.minimumStock,
            reorderLevel: item.reorderLevel,
            ...(item.isActive !== undefined ? { isActive: item.isActive } : {}),
          },
          include: { product: true },
        }),
      ),
    );
  }

  private mapUniqueConstraintError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException({
        code: 'WAREHOUSE_CODE_DUPLICATE',
        message_ar: 'كود المخزن مستخدم بالفعل',
      });
    }
    return error as Error;
  }
}
