# نظام إدارة المبيعات والمخزون

**الحالة الحالية:  ✅ المشروع مكتمل — Final Release (Foundation → Catalog/Suppliers/Warehouses
→ Purchasing/Receiving/Inventory → Customers/Sales/Payments → Returns/Approvals/
Notifications/Audit Log UI → Advanced Alerts/Dashboard → **Reports & Analytics**)

> ✅ الوحدات المكتملة: المصادقة (JWT + Refresh Rotation + jti فريد)، RBAC،
> الكتالوج (منتجات/فئات/علامات/وحدات)، الموردون، المخازن، المشتريات والاستلام،
> المخزون (أرصدة/حركات/تسويات/حجز)، العملاء، المبيعات (تأكيد/حجز/تسليم)،
> المدفوعات، المرتجعات (عميل/مورد) بدورة موافقة كاملة، الإشعارات داخل
> النظام (بحالة قراءة مستقلة لكل مستخدم)، واجهة سجل التدقيق (Audit Log)،
> تنبيهات تشغيلية متقدمة (مخزون منخفض/موافقات معلَّقة/حد ائتماني/تأخر
> شراء) مع ملخص في الصفحة الرئيسية، **ومركز تقارير وتحليلات كامل**.
> AI لا يزال خارج النطاق حتى الآن.

---

## المتطلبات الأساسية (Prerequisites)

- Node.js 20+
- Docker + Docker Compose (الطريقة الموصى بها)
- أو: PostgreSQL 16 وRedis مثبَّتان محليًا إن كنتم لا تريدون Docker

---

## التشغيل السريع عبر Docker (موصى به)

```bash
# 1) نسخ ملفات البيئة
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 2) تشغيل كل الخدمات (Postgres + Redis + API + Web)
docker compose -f docker-compose.dev.yml up --build

# 3) في نافذة طرفية أخرى، بعد أن تصبح الحاويات جاهزة:
docker compose -f docker-compose.dev.yml exec api npx prisma migrate deploy
docker compose -f docker-compose.dev.yml exec api npx prisma generate
docker compose -f docker-compose.dev.yml exec api npm run prisma:seed
```

قاعدة البيانات تُبنى بالكامل من `prisma migrate deploy` وحده — **لا SQL يدوي إضافي مطلوب خارج هذا الأمر.**

- Backend: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs
- Frontend: http://localhost:5173

**بيانات دخول Admin الافتراضية (من Seed):**
```
username: admin
password: ChangeMe123!
```
⚠️ **يجب تغيير كلمة المرور هذه فور أول استخدام فعلي — هذه بيانات تطوير فقط.**

## أمان الجلسات (Refresh Token Rotation)

كل Refresh Token يُخزَّن كـ Hash فقط (SHA-256) في جدول `refresh_tokens`،
ويُستبدَل تلقائيًا (Rotation) عند كل استخدام ناجح عبر **استحواذ ذرّي**
(`updateMany` بشرط `revoked=false`) يمنع استخدام نفس التوكن مرتين حتى مع
طلبات متزامنة تمامًا. يُميَّز صراحة بين:
- **سباق متزامن حميد** (Concurrent Race): طلب خاسر يُرفض فقط، دون المساس بجلسة الفائز.
- **إعادة استخدام حقيقية** (Reuse — جيلان للخلف أو أكثر في سلسلة التدوير): إبطال جماعي لكل الجلسات كإجراء أمني.
## الاختبارات والتحقق النهائي

تم تشغيل مجموعة الاختبارات الكاملة للمشروع فعليًا بعد اكتمال التطوير، وكانت النتيجة النهائية:

- ✅ **13 Test Suites Passed**
- ✅ **89 / 89 Automated Tests Passed**
- ✅ **API Build Successful**
- ✅ **Web Production Build Successful**
- ✅ تم التحقق من تشغيل الخدمات باستخدام Docker Compose

تشمل الاختبارات الوحدات الأساسية في النظام، ومنها المصادقة (Auth)، المبيعات، المرتجعات، الاستلام، التقارير، الصلاحيات، والمكونات التشغيلية الأخرى.

تم كذلك التحقق من بناء كلٍ من الـBackend والـFrontend بنجاح قبل اعتماد النسخة النهائية للمشروع.

## التشغيل بدون Docker (يدويًا)

```bash
# من جذر المشروع
npm install

# Backend
cd apps/api
cp .env.example .env
# عدّلوا DATABASE_URL في .env ليشير لقاعدة بيانات PostgreSQL محلية فعلية
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
# API يعمل على http://localhost:3000/api/v1

# Frontend (نافذة طرفية أخرى)
cd apps/web
cp .env.example .env
npm install
npm run dev
# Web يعمل على http://localhost:5173
```

---

## Migration ذاتية الاكتفاء بالكامل

`prisma/migrations/20250101000000_init/migration.sql` تحتوي **كل شيء**:
كل الجداول والعلاقات والفهارس والقيود، **بما في ذلك** ما لا يدعمه Prisma
Schema Language تصريحيًا (Generated Columns، CHECK Constraints متعددة
الأعمدة، Partial Unique Index) — مكتوبة يدويًا داخل ملف الـMigration نفسه.

```bash
npx prisma migrate deploy   # يبني قاعدة البيانات كاملة من الصفر — لا خطوة إضافية بعده
```

⚠️ **لا تُشغّلوا `prisma migrate dev` على هذا المشروع** — سيحاول توليد
Migration جديدة بمقارنة الـSchema مع قاعدة البيانات، ولن "يعرف" الإضافات
اليدوية (Generated Columns/CHECK) المكتوبة يدويًا داخل الـMigration الأولى
لأنها خارج ما يستطيع Prisma توليده تلقائيًا، وقد يقترح تغييرات غير صحيحة.
استخدموا `prisma migrate deploy` دائمًا لتطبيق Migrations موجودة، و`prisma
migrate dev` فقط لاحقًا عند إضافة Migration جديدة فعلية لتغيير مستقبلي
(مع مراجعة يدوية لأي SQL يقترحه قبل قبوله).

**Migrations إضافية لاحقة** (كلها تكميلية بحتة، لا تمس الأولى): `20250201000000_step3_purchasing_fields`
(حقول اختيارية جديدة على جداول المشتريات)، و`20250301000000_step5_returns_approvals_notifications`
(قيمتا enum إضافيتان فقط لربط المرتجعات بالموافقات والإشعارات). `prisma migrate deploy`
يطبّق الثلاثة بالترتيب تلقائيًا.

---

## سجل التدقيق (Audit Log) — جديد في هذا التحديث

كل عملية إنشاء/تعديل/تعطيل/موافقة/رفض/تغيير حالة مهمة في النظام (أوامر
شراء، إيصالات استلام، أوامر بيع، مرتجعات، موافقات...) تُسجَّل تلقائيًا في
جدول `audit_logs` (Append-only — لا تعديل ولا حذف ممكن، لا من الواجهة ولا
من أي Endpoint). هذا كان موجودًا في الـBackend منذ Step 1؛ هذا التحديث
يضيف **واجهة عرضه فقط**.

**للوصول إليه:**
1. سجّلوا الدخول بمستخدم يملك صلاحية `audit.view` (المستخدم `admin` الافتراضي يملكها).
2. من القائمة الجانبية، قسم **"المرتجعات والحوكمة"** → **"سجل التدقيق"**
   (الرابط لا يظهر إطلاقًا لمستخدم بلا هذه الصلاحية).
3. الصفحة تعرض: التاريخ والوقت، المستخدم، نوع العملية، الكيان، معرّف
   السجل، وزر "عرض التفاصيل" (يظهر فقط إن وُجدت بيانات قبل/بعد فعليًا،
   معروضة كمقارنة حقول وليست JSON خامًا). فلاتر متاحة: الكيان، نوع
   العملية، بحث بالمستخدم، ونطاق تاريخ. صفحات (50 سجلًا لكل صفحة) بدل
   جلب كل السجلات دفعة واحدة.
4. **قراءة فقط بالكامل** — لا يوجد أي زر تعديل أو حذف أو إنشاء يدوي، لا في
   الواجهة ولا في الـBackend. الحماية الفعلية هي `RequirePermission('audit.view')`
   على الـEndpoint نفسه (`GET /api/v1/audit-logs`) — إخفاء الرابط في القائمة
   الجانبية مجرد تحسين لتجربة الاستخدام، وليس الحماية الوحيدة.

---

## Step 7 — التقارير والتحليلات (Reports & Analytics)

مركز تقارير واحد بتبويبات (`/reports`، وليس صفحات منفصلة لكل تقرير)، كل
تبويب محمي بصلاحيته الخاصة، وكل رقم معروض مُشتَق من بيانات حقيقية في
قاعدة البيانات — **لا بيانات وهمية أو مُخترَعة إطلاقًا**.

### التقارير المتاحة
نظرة عامة تنفيذية، المبيعات، الأرباح، المخزون (+ حركة المخزون التفصيلية
المُصفَّحة)، المشتريات، العملاء، الموردون، تحليلات المنتجات.

### قواعد احتساب المؤشرات المالية (موثَّقة بالتفصيل داخل `reports.service.ts`)
- **مبيعات صحيحة** = حالة الطلب `approved` أو `delivered` فقط. `draft`
  (لم يُؤكَّد بعد) و`cancelled`/`rejected` مُستبعَدة دائمًا من أي مقياس مالي.
- **مشتريات صحيحة (ماليًا)** = حالة أمر الشراء `completed` أو
  `partially_received` فقط (استُلمت فعليًا كليًا أو جزئيًا). `cancelled`
  مُستبعَد دائمًا؛ `draft`/`pending` لم يُستلَم فيهما شيء بعد فلا تُحتسَب
  كتكلفة مُتكبَّدة.
- **COGS (تكلفة البضاعة المباعة)** = مجموع (الكمية × `unit_cost_snapshot`)
  لكل بنود المبيعات الصحيحة — **نفس آلية التكلفة المعتمدة أصلًا منذ
  Step 4** (نسخة من متوسط التكلفة وقت إنشاء الطلب، ثابتة لا تتغيّر لاحقًا).
  لم تُخترَع طريقة تكلفة جديدة.
- **صافي الربح** = صافي المبيعات − COGS. **هامش الربح %** = (الربح / صافي
  المبيعات) × 100، مع حماية كاملة من القسمة على صفر (يُرجع 0، وليس
  NaN/Infinity، عند صافي مبيعات = صفر).
- **أثر المرتجعات**: مرتجع عميل **مكتمل فقط** يُخفِّض صافي المبيعات
  وCOGS معًا — بمطابقة كل بند مرتجع مع بند طلب البيع الأصلي (نفس المنتج
  ضمن نفس الطلب المرجعي) لاسترجاع تكلفته الحقيقية وقتها.
- **قيمة المخزون الحالية** = مجموع (الكمية الفعلية × متوسط تكلفة المنتج).
- **نقص المخزون** يطابق تمامًا قاعدة Step 6: الكمية **المتاحة**
  (الفعلية − المحجوزة) ≤ الحد الأدنى، وليس الكمية الفعلية فقط.

### قيد معروف وموثَّق صراحة (وليس اختراعًا)
"تقادم الفواتير" الحقيقي (Accounts Receivable Aging بتصنيف 30/60/90
يومًا) **غير قابل للحساب بدقة** بالمخطط الحالي — الدفعات تُسجَّل على
إجمالي الطلب ككل، وليس على فواتير/بنود مؤرَّخة مستقلة. المعروض بدلًا من
ذلك: الرصيد المستحق الحالي الدقيق لكل عميل. كذلك لا يوجد "رصيد مستحق
للمورد" (Accounts Payable) في المخطط الحالي — لم يُعرَض تفاديًا لاختراعه.

### نقاط النهاية (Endpoints) — جميعها تحت `/api/v1/reports`
```
GET /overview | /sales | /profit | /inventory | /inventory/movements
GET /purchases | /customers | /suppliers | /products
GET /export?type=<sales-trend|sales-top-products|sales-top-customers|
              profit-trend|inventory-items|inventory-movements|
              purchases-by-supplier|customers-top|suppliers-top|products-items>
```
كل Endpoint يقبل فلاتر اختيارية عبر Query Params: `dateFrom`, `dateTo`,
`warehouseId`, وحسب التقرير: `productId`, `customerId`, `supplierId`,
`categoryId`, `brandId`, `groupBy` (day/week/month/year), `compare`
(مقارنة بالفترة السابقة — للنظرة العامة فقط)، `page`/`limit` للتقارير المُصفَّحة.

### الصلاحيات (RBAC) — جديدة في Step 7
`reports.view`, `reports.sales`, `reports.profit`, `reports.inventory`,
`reports.purchases`, `reports.customers`, `reports.suppliers`,
`reports.products`, `reports.export`. **`reports.profit` و`reports.export`
حصريًا للإدارة افتراضيًا** (حساسية مالية) — قابل للتعديل بسهولة عبر شاشة
الأدوار. التصدير يتحقق من صلاحيتين معًا فعليًا في الـBackend (`reports.export`
+ صلاحية مصدر البيانات المحدَّد تحديدًا)، وليس صلاحية واحدة عامة فقط.

### التصدير (Export)
CSV فقط في هذه المرحلة (Excel/.xlsx لم يُنفَّذ — قرار متعمَّد لتفادي
إضافة مكتبة جديدة غير مُختبَرة في بيئة التطوير الحالية؛ يمكن إضافته لاحقًا
بأمان). كل تصدير يستخدم **نفس دالة التقرير ونفس الفلاتر المعروضة بالضبط**
— لا مسار بيانات منفصل قد يُصدِّر شيئًا مختلفًا عمّا تراه الشاشة.

### الرسوم البيانية
لا توجد مكتبة رسوم بيانية كانت مثبَّتة أصلًا في المشروع. بدل إضافة تبعية
جديدة يتعذَّر التحقق من تثبيتها وعملها فعليًا في هذه البيئة، بُني مكوّن
`SimpleBarChart` خفيف بلا أي تبعية خارجية (SVG/CSS فقط) يغطي احتياجات
هذه المرحلة من رسوم الاتجاه والتوزيع.

### كيفية اختبار Step 7
```bash
cd apps/api
npx prisma migrate deploy   # يطبّق Migration الجديدة (قيمة export فقط في AuditAction)
npx prisma generate
npm run prisma:seed         # يضيف صلاحيات reports.* الجديدة
npx jest src/modules/reports
```
سجّلوا الدخول بمستخدم يملك `reports.view` على الأقل (`admin` الافتراضي
يملك الكل)، ثم من القائمة الجانبية → **"التقارير والتحليلات"**.

---

## هيكل المشروع

```
apps/api    → NestJS Backend (TypeScript + Prisma + PostgreSQL)
apps/web    → React Frontend (TypeScript + Vite + Tailwind RTL)
packages/shared-types → أنواع TypeScript مشتركة بين الطرفين
scripts/migration     → سكريبت ترحيل بيانات Excel القديمة (لمرحلة لاحقة، لا يزال فارغًا)
```

راجعوا `apps/api/prisma/schema.prisma` للاطلاع على قاعدة البيانات الكاملة،
وSwagger (`/api/docs`) للاطلاع على كل الـEndpoints المتاحة حاليًا.
