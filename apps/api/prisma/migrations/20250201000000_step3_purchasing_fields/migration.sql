-- ============================================================================
-- Step 3 Migration — إضافات تكميلية بحتة على جداول المشتريات الموجودة.
-- لا تُعدَّل أو تُحذف Migration الأولية (20250101000000_init) إطلاقًا.
-- لا حذف لأي جدول أو عمود، ولا تغيير في أي قيد موجود — فقط أعمدة جديدة
-- Nullable أو بقيمة افتراضية آمنة، لذلك آمنة تمامًا على بيانات موجودة فعلًا.
-- ============================================================================

-- purchase_orders: حقلان اختياريان جديدان
ALTER TABLE "purchase_orders" ADD COLUMN "notes" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- purchase_order_items: عمود محسوب (quantity_ordered × unit_price)، بقيمة
-- افتراضية 0 لأي صف قديم (لن يوجد فعليًا لأن المشروع لم يُنشر بعد، لكن
-- الإضافة آمنة بنفس المنطق بغض النظر).
ALTER TABLE "purchase_order_items" ADD COLUMN "line_total" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- purchase_receipts: حقل اختياري جديد
ALTER TABLE "purchase_receipts" ADD COLUMN "notes" TEXT;
