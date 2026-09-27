-- ============================================================================
-- Initial Migration — نظام إدارة المبيعات والمخزون
-- مطابقة كاملة لـ apps/api/prisma/schema.prisma وDatabase Design المعتمد.
--
-- هذه Migration ذاتية الاكتفاء بالكامل: تشغيل `npx prisma migrate deploy`
-- وحده على قاعدة بيانات PostgreSQL 16 فارغة يبني قاعدة البيانات كاملة،
-- بما في ذلك كل ما لا يدعمه Prisma Schema Language تصريحيًا:
--   - Generated Columns (available_quantity, remaining_balance)
--   - CHECK Constraints متعددة الأعمدة (approvals, returns, payments)
--   - Partial Unique Index (products.barcode WHERE NOT NULL)
-- لا توجد أي خطوة SQL يدوية مطلوبة خارج هذا الملف.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
CREATE TYPE "CustomerType" AS ENUM ('cash', 'credit');
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'released', 'consumed');
CREATE TYPE "InventoryTransactionType" AS ENUM ('purchase_receipt', 'sale', 'customer_return', 'supplier_return', 'adjustment');
CREATE TYPE "InventoryReferenceType" AS ENUM ('sales_order', 'purchase_receipt', 'return', 'manual');
CREATE TYPE "SalesOrderStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'preparing', 'ready_for_delivery', 'delivered', 'cancelled', 'rejected');
CREATE TYPE "PaymentType" AS ENUM ('cash', 'credit');
CREATE TYPE "PaymentStatus" AS ENUM ('completed', 'voided');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'pending', 'partially_received', 'completed', 'cancelled');
CREATE TYPE "ReturnType" AS ENUM ('customer_return', 'supplier_return');
CREATE TYPE "ReturnStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'completed', 'cancelled');
CREATE TYPE "ApprovalType" AS ENUM ('discount_exceeded', 'credit_limit_exceeded');
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "NotificationType" AS ENUM ('low_stock', 'approval_needed', 'credit_limit_exceeded', 'po_delayed', 'order_rejected');
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'deactivate', 'approve', 'reject', 'status_change');

-- ----------------------------------------------------------------------------
-- 1) warehouses
-- ----------------------------------------------------------------------------
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- ----------------------------------------------------------------------------
-- 2) roles
-- ----------------------------------------------------------------------------
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- ----------------------------------------------------------------------------
-- 3) permissions
-- ----------------------------------------------------------------------------
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description_ar" TEXT,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- ----------------------------------------------------------------------------
-- 4) role_permissions (M2M)
-- ----------------------------------------------------------------------------
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 5) users
-- ----------------------------------------------------------------------------
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_warehouse_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
ALTER TABLE "users" ADD CONSTRAINT "users_default_warehouse_id_fkey"
    FOREIGN KEY ("default_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 6) user_roles (M2M)
-- ----------------------------------------------------------------------------
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 7) refresh_tokens — بنية تحتية للمصادقة (Security Hardening، ليست كيان عمل)
-- ----------------------------------------------------------------------------
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_by_token_id" TEXT,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 8) categories / brands / units
-- ----------------------------------------------------------------------------
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "symbol" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- 9) products
-- ----------------------------------------------------------------------------
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "unit_id" TEXT NOT NULL,
    "barcode" TEXT,
    "purchase_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "selling_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "default_minimum_stock" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");
-- SQL يدوي مدمج (1/5): Partial Unique Index — الباركود فريد فقط عند عدم NULL
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode") WHERE "barcode" IS NOT NULL;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 10) warehouse_product_settings
-- ----------------------------------------------------------------------------
CREATE TABLE "warehouse_product_settings" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "minimum_stock" INTEGER NOT NULL,
    "reorder_level" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "warehouse_product_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "warehouse_product_settings_product_id_warehouse_id_key"
    ON "warehouse_product_settings"("product_id", "warehouse_id");
ALTER TABLE "warehouse_product_settings" ADD CONSTRAINT "warehouse_product_settings_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_product_settings" ADD CONSTRAINT "warehouse_product_settings_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 11) suppliers / supplier_products
-- ----------------------------------------------------------------------------
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_products" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_price" DECIMAL(12,2) NOT NULL,
    "supplier_product_code" TEXT,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_products_supplier_id_product_id_key" ON "supplier_products"("supplier_id", "product_id");
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 12) customers / customer_locations
-- ----------------------------------------------------------------------------
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "region" TEXT,
    "contact_person" TEXT,
    "tax_number" TEXT,
    "customer_type" "CustomerType" NOT NULL,
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_terms_days" INTEGER,
    "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customers_mobile_number_key" ON "customers"("mobile_number");

CREATE TABLE "customer_locations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT,
    "address" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "customer_locations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "customer_locations" ADD CONSTRAINT "customer_locations_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 13) inventory_balances
-- ----------------------------------------------------------------------------
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity_on_hand" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_balances_product_id_warehouse_id_key" ON "inventory_balances"("product_id", "warehouse_id");
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SQL يدوي مدمج (2/5): available_quantity — عمود محسوب + CHECK يمنع تجاوز الحجز للرصيد الفعلي
ALTER TABLE "inventory_balances" ADD COLUMN "available_quantity" DECIMAL(12,2)
    GENERATED ALWAYS AS ("quantity_on_hand" - "reserved_quantity") STORED;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "chk_reserved_within_on_hand"
    CHECK ("reserved_quantity" >= 0 AND "reserved_quantity" <= "quantity_on_hand");

-- ----------------------------------------------------------------------------
-- 14) sales_orders
-- ----------------------------------------------------------------------------
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_location_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'draft',
    "payment_type" "PaymentType" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_orders_order_number_key" ON "sales_orders"("order_number");
CREATE INDEX "sales_orders_customer_id_idx" ON "sales_orders"("customer_id");
CREATE INDEX "sales_orders_status_idx" ON "sales_orders"("status");
CREATE INDEX "sales_orders_order_date_idx" ON "sales_orders"("order_date");
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_location_id_fkey"
    FOREIGN KEY ("customer_location_id") REFERENCES "customer_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- SQL يدوي مدمج (3/5): remaining_balance — عمود محسوب
ALTER TABLE "sales_orders" ADD COLUMN "remaining_balance" DECIMAL(14,2)
    GENERATED ALWAYS AS ("total_amount" - "paid_amount") STORED;

-- ----------------------------------------------------------------------------
-- 15) sales_order_items
-- ----------------------------------------------------------------------------
CREATE TABLE "sales_order_items" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unit_cost_snapshot" DECIMAL(12,4) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sales_order_items_sales_order_id_idx" ON "sales_order_items"("sales_order_id");
CREATE INDEX "sales_order_items_product_id_idx" ON "sales_order_items"("product_id");
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 16) inventory_reservations
-- ----------------------------------------------------------------------------
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "sales_order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity_reserved" DECIMAL(12,2) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_reservations_sales_order_item_id_key" ON "inventory_reservations"("sales_order_item_id");
CREATE INDEX "inventory_reservations_product_id_warehouse_id_status_idx"
    ON "inventory_reservations"("product_id", "warehouse_id", "status");
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_sales_order_item_id_fkey"
    FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 17) inventory_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "transaction_type" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit_cost" DECIMAL(12,4),
    "reference_type" "InventoryReferenceType" NOT NULL,
    "reference_id" TEXT,
    "user_id" TEXT NOT NULL,
    "notes" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inventory_transactions_product_warehouse_date_idx"
    ON "inventory_transactions"("product_id", "warehouse_id", "transaction_date");
CREATE INDEX "inventory_transactions_transaction_type_idx" ON "inventory_transactions"("transaction_type");
CREATE INDEX "inventory_transactions_reference_idx" ON "inventory_transactions"("reference_type", "reference_id");
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 18) order_status_transitions
-- ----------------------------------------------------------------------------
CREATE TABLE "order_status_transitions" (
    "id" TEXT NOT NULL,
    "from_status" "SalesOrderStatus" NOT NULL,
    "to_status" "SalesOrderStatus" NOT NULL,
    "required_permission_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "order_status_transitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_status_transitions_from_status_to_status_key"
    ON "order_status_transitions"("from_status", "to_status");
ALTER TABLE "order_status_transitions" ADD CONSTRAINT "order_status_transitions_required_permission_id_fkey"
    FOREIGN KEY ("required_permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 19) payment_methods / payments
-- ----------------------------------------------------------------------------
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_methods_code_key" ON "payment_methods"("code");

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "payment_method_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'completed',
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" TEXT NOT NULL,
    "reference_number" TEXT,
    "voided_reason" TEXT,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_sales_order_id_idx" ON "payments"("sales_order_id");
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");
CREATE INDEX "payments_status_idx" ON "payments"("status");
ALTER TABLE "payments" ADD CONSTRAINT "payments_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_fkey"
    FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fkey"
    FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SQL يدوي مدمج (4/5): amount > 0
ALTER TABLE "payments" ADD CONSTRAINT "chk_payment_amount_positive" CHECK ("amount" > 0);

-- ----------------------------------------------------------------------------
-- 20) purchase_orders / purchase_order_items
-- ----------------------------------------------------------------------------
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "expected_delivery_date" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_ordered" DECIMAL(12,2) NOT NULL,
    "quantity_received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 21) purchase_receipts / purchase_receipt_items
-- ----------------------------------------------------------------------------
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "received_by" TEXT NOT NULL,
    "receipt_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_receipts_receipt_number_key" ON "purchase_receipts"("receipt_number");
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_fkey"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_fkey"
    FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "purchase_receipt_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_received" DECIMAL(12,2) NOT NULL,
    "unit_cost" DECIMAL(12,4) NOT NULL,
    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_receipt_items_purchase_receipt_id_idx" ON "purchase_receipt_items"("purchase_receipt_id");
CREATE INDEX "purchase_receipt_items_purchase_order_item_id_idx" ON "purchase_receipt_items"("purchase_order_item_id");
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_receipt_id_fkey"
    FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_order_item_id_fkey"
    FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 22) returns / return_items
-- ----------------------------------------------------------------------------
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "return_type" "ReturnType" NOT NULL,
    "customer_id" TEXT,
    "supplier_id" TEXT,
    "reference_sales_order_id" TEXT,
    "reference_purchase_order_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'draft',
    "created_by" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "returns_return_number_key" ON "returns"("return_number");
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_reference_sales_order_id_fkey"
    FOREIGN KEY ("reference_sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_reference_purchase_order_id_fkey"
    FOREIGN KEY ("reference_purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SQL يدوي مدمج (5/5): عمود واحد بالضبط من (customer_id, supplier_id) حسب return_type
ALTER TABLE "returns" ADD CONSTRAINT "chk_return_single_party" CHECK (
    ("return_type" = 'customer_return' AND "customer_id" IS NOT NULL AND "supplier_id" IS NULL) OR
    ("return_type" = 'supplier_return' AND "supplier_id" IS NOT NULL AND "customer_id" IS NULL)
);

CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey"
    FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 23) approvals
-- ----------------------------------------------------------------------------
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "approval_type" "ApprovalType" NOT NULL,
    "sales_order_id" TEXT,
    "return_id" TEXT,
    "requested_by" TEXT NOT NULL,
    "approver_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approvals_status_idx" ON "approvals"("status");
CREATE INDEX "approvals_sales_order_id_idx" ON "approvals"("sales_order_id");
CREATE INDEX "approvals_return_id_idx" ON "approvals"("return_id");
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_return_id_fkey"
    FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_fkey"
    FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- CHECK إضافي (ضمن نفس مجموعة الـSQL اليدوي المدمج): عمود واحد بالضبط من (sales_order_id, return_id)
ALTER TABLE "approvals" ADD CONSTRAINT "chk_approval_single_reference" CHECK (
    ("sales_order_id" IS NOT NULL AND "return_id" IS NULL) OR
    ("sales_order_id" IS NULL AND "return_id" IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- 24) notifications
-- ----------------------------------------------------------------------------
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "role_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title_ar" TEXT NOT NULL,
    "message_ar" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 25) audit_logs (Append-only بالتصميم — لا صلاحية UPDATE/DELETE تُمنح لحساب
--     التطبيق على هذا الجدول عند إعداد صلاحيات مستخدم اتصال Postgres في
--     مرحلة النشر؛ خارج نطاق هذه الـMigration نفسها)
-- ----------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- نهاية Initial Migration — 33 جدولًا (32 من Database Design المعتمد +
-- refresh_tokens كبنية تحتية أمنية)، 14 Enum، كل الفهارس/القيود/الـFKs،
-- بما فيها SQL اليدوي المدمج بالكامل (Generated Columns × 2، CHECK × 3،
-- Partial Unique Index × 1). لا خطوات خارج هذا الملف.
-- ============================================================================
