import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { ReceivingModule } from './modules/receiving/receiving.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // حماية من Brute Force على /auth/login تحديدًا (قرار Security معتمد)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    AuditModule, // يجب أن يسبق أي Module يعتمد على AuditInterceptor
    RbacModule,
    UsersModule,
    AuthModule,
    HealthModule,
    // Phase 4 / Step 2 — Catalog + Suppliers + Warehouses
    CatalogModule,
    SuppliersModule,
    WarehousesModule,
    // Phase 4 / Step 3 — Purchasing + Receiving + Inventory
    PurchasingModule,
    InventoryModule, // يجب أن يسبق ReceivingModule وSalesModule (كلاهما يعتمد عليه)
    ReceivingModule,
    // Phase 4 / Step 4 — Customers + Sales + Payments
    CustomersModule,
    SalesModule,
    PaymentsModule,
    // Phase 4 / Step 5 — Returns + Approvals + Notifications
    // (كل Module يستورد اعتمادياته الخاصة صراحة؛ الترتيب هنا توثيقي فقط)
    NotificationsModule,
    ApprovalsModule,
    ReturnsModule,
    // Phase 4 / Step 6 — Advanced Alerts & Operational Notifications
    DashboardModule, // ملخص عدّادات فقط — Dashboard كامل لا يزال خارج النطاق
    // Phase 4 / Step 7 — Reports & Advanced Analytics
    ReportsModule,
    // Reports الكاملة: لا تزال خارج نطاق أي خطوة حتى الآن
  ],
  providers: [
    // ترتيب الحماية: Rate Limiting → مصادقة (JWT) → تفويض (RBAC)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    Reflector,
  ],
})
export class AppModule {}
