import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerLocationDto } from './dto/create-customer-location.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

@ApiTags('Customers — العملاء')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get()
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'عرض العملاء (النشطون فقط افتراضيًا) مع بحث بالاسم/الجوال' })
  async findAll(@Query() query: QueryCustomersDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'تفاصيل عميل واحد مع عناوينه' })
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @RequirePermission('customers.manage')
  @AuditLog({ action: 'create', entity: 'customers' })
  @ApiOperation({ summary: 'إنشاء عميل جديد' })
  async create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('customers.manage')
  @AuditLog({ action: 'update', entity: 'customers' })
  @ApiOperation({ summary: 'تحديث عميل (بما في ذلك تفعيل/تعطيل)' })
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Get(':id/locations')
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'عرض عناوين/فروع العميل' })
  async listLocations(@Param('id') id: string) {
    return this.customersService.listLocations(id);
  }

  @Post(':id/locations')
  @RequirePermission('customers.manage')
  @AuditLog({ action: 'create', entity: 'customer_locations' })
  @ApiOperation({ summary: 'إضافة عنوان/فرع جديد للعميل' })
  async addLocation(@Param('id') id: string, @Body() dto: CreateCustomerLocationDto) {
    return this.customersService.addLocation(id, dto);
  }
}
