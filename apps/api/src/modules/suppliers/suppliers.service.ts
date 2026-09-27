import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.supplier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message_ar: 'المورد غير موجود' });
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  // ---------------------------------------------------------------------
  // Supplier ↔ Product (Many-to-Many)
  // ---------------------------------------------------------------------

  async listProducts(supplierId: string) {
    await this.findOne(supplierId);
    return this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: { product: true },
      orderBy: { product: { nameAr: 'asc' } },
    });
  }

  async addProduct(supplierId: string, dto: CreateSupplierProductDto) {
    await this.findOne(supplierId);

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message_ar: 'المنتج المحدَّد غير موجود' });
    }

    const existing = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId: dto.productId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SUPPLIER_PRODUCT_DUPLICATE',
        message_ar: 'هذا المنتج مرتبط بالفعل بهذا المورد',
      });
    }

    // === قاعدة العمل: مورد مفضّل واحد فقط لكل منتج ===
    // إن طُلِب تفضيل هذا المورد لهذا المنتج، يجب إلغاء تفضيل أي مورد آخر
    // لنفس المنتج أولًا — داخل معاملة واحدة لضمان الاتساق.
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (dto.isPreferred) {
        await tx.supplierProduct.updateMany({
          where: { productId: dto.productId, isPreferred: true },
          data: { isPreferred: false },
        });
      }

      return tx.supplierProduct.create({
        data: {
          supplierId,
          productId: dto.productId,
          supplierPrice: dto.supplierPrice,
          supplierProductCode: dto.supplierProductCode,
          isPreferred: dto.isPreferred ?? false,
        },
        include: { product: true },
      });
    });
  }
}
