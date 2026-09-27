-- ============================================================================
-- إصلاح Step 6.1 — Notification Read State Per User
--
-- المشكلة المُصلَحة: `notifications.is_read` كان حقلًا واحدًا مشتركًا. لإشعار
-- موجَّه لدور كامل (SALES/WAREHOUSE/PURCHASING)، قراءة أي عضو واحد كانت
-- تُخفي الإشعار خطأً عن بقية أعضاء الدور. هذا جدول جديد بحت — لا حذف ولا
-- تعديل على أي جدول أو عمود قائم (بما فيها notifications.is_read نفسه،
-- الذي أُبقي عليه لغرض مختلف تمامًا الآن — راجعوا التوثيق في schema.prisma).
-- ============================================================================

CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_reads_notification_id_user_id_key"
    ON "notification_reads"("notification_id", "user_id");
CREATE INDEX "notification_reads_user_id_idx" ON "notification_reads"("user_id");

ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- ترحيل البيانات القديمة (آمن، بلا فقدان معلومة حقيقية):
--
-- الإشعارات **الشخصية** (user_id IS NOT NULL) التي كانت is_read = true فعلًا:
-- نعرف بالضبط مَن قرأها (صاحب user_id نفسه) — نُنشئ صف notification_reads
-- يعكس ذلك بدقة كاملة، بلا أي غموض.
--
-- الإشعارات **الموجَّهة لدور** (role_id IS NOT NULL) التي كانت is_read = true:
-- التصميم القديم الخاطئ لا يُخبرنا **أيّ عضو تحديدًا** من الدور قرأها فعليًا
-- (كان هذا هو جوهر المشكلة أصلًا). لذلك تبقى "غير مقروءة" لكل الأعضاء بعد
-- الترقية — هذا **تصحيح صحيح** لسلوك خاطئ سابق، وليس فقدان بيانات حقيقية
-- (لم تكن تلك المعلومة موجودة بدقة أصلًا تحت التصميم القديم).
-- ----------------------------------------------------------------------------
INSERT INTO "notification_reads" ("id", "notification_id", "user_id", "read_at")
SELECT "id", "id", "user_id", "created_at"
FROM "notifications"
WHERE "is_read" = true AND "user_id" IS NOT NULL;
