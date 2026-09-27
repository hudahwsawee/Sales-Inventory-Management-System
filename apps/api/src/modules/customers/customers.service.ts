import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerLocationDto } from './dto/create-customer-location.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryCustomersDto) {
    const includeInactive = query.includeInactive === 'true';
    const where: Prisma.CustomerWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { mobileNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.customer.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { locations: true },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message_ar: 'العميل غير موجود' });
    }
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({
        data: {
          name: dto.name,
          mobileNumber: dto.mobileNumber,
          region: dto.region,
          contactPerson: dto.contactPerson,
          taxNumber: dto.taxNumber,
          customerType: dto.customerType,
          creditLimit: dto.creditLimit ?? 0,
          paymentTermsDays: dto.paymentTermsDays,
        },
      });
    } catch (error) {
      throw this.mapUniqueConstraintError(error);
    }
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapUniqueConstraintError(error);
    }
  }

  async listLocations(customerId: string) {
    await this.findOne(customerId);
    return this.prisma.customerLocation.findMany({ where: { customerId } });
  }

  async addLocation(customerId: string, dto: CreateCustomerLocationDto) {
    await this.findOne(customerId);

    if (dto.isDefault) {
      // نفس منطق "خيار واحد مفضّل" المعتمد سابقًا مع المورد المفضّل —
      // إلغاء الافتراضي عن أي عنوان آخر لهذا العميل أولًا
      await this.prisma.customerLocation.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.customerLocation.create({
      data: {
        customerId,
        label: dto.label,
        address: dto.address,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  private mapUniqueConstraintError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException({
        code: 'CUSTOMER_MOBILE_DUPLICATE',
        message_ar: 'رقم الجوال مستخدم بالفعل لعميل آخر',
      });
    }
    return error as Error;
  }
}
