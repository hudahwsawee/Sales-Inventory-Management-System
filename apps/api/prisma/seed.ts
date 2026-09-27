import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_COST_FACTOR = 12;

/**
 * Seed Data — تراكمي عبر مراحل Phase 4 (Step 1 Foundation → Step 2 Catalog
 * → Step 3 Purchasing/Receiving/Inventory). كل الأقسام Idempotent (Upsert
 * أو استبدال كامل)، آمنة لإعادة التشغيل دون تكرار أو فقدان بيانات موجودة.
 */

// الصلاحيات الذرية المطلوبة فعليًا لتشغيل Foundation الحالي
// (باقي صلاحيات Sales/Purchasing/Inventory ستُضاف مع كل Module لاحقًا)
const PERMISSIONS: { code: string; module: string; descriptionAr: string }[] = [
  { code: 'users.view', module: 'users', descriptionAr: 'عرض قائمة المستخدمين' },
  { code: 'users.manage', module: 'users', descriptionAr: 'إنشاء/إيقاف المستخدمين' },
  { code: 'rbac.view_roles', module: 'rbac', descriptionAr: 'عرض الأدوار والصلاحيات' },
  { code: 'rbac.manage_roles', module: 'rbac', descriptionAr: 'تعديل صلاحيات الأدوار' },
  { code: 'audit.view', module: 'audit', descriptionAr: 'عرض سجل التدقيق' },
  // Phase 4 / Step 2 — Catalog + Suppliers + Warehouses
  { code: 'catalog.view', module: 'catalog', descriptionAr: 'عرض الفئات/العلامات/الوحدات/المنتجات' },
  { code: 'catalog.manage', module: 'catalog', descriptionAr: 'إنشاء/تعديل الفئات/العلامات/الوحدات/المنتجات' },
  { code: 'suppliers.view', module: 'suppliers', descriptionAr: 'عرض الموردين ومنتجاتهم' },
  { code: 'suppliers.manage', module: 'suppliers', descriptionAr: 'إنشاء/تعديل الموردين وربط منتجاتهم' },
  { code: 'warehouses.view', module: 'warehouses', descriptionAr: 'عرض المخازن وإعدادات المنتجات فيها' },
  { code: 'warehouses.manage', module: 'warehouses', descriptionAr: 'إنشاء/تعديل المخازن وإعدادات الحد الأدنى' },
  // Phase 4 / Step 3 — Purchasing + Receiving + Inventory
  { code: 'purchasing.view', module: 'purchasing', descriptionAr: 'عرض أوامر الشراء' },
  { code: 'purchasing.manage', module: 'purchasing', descriptionAr: 'إنشاء/تعديل/إلغاء أوامر الشراء' },
  { code: 'receiving.view', module: 'receiving', descriptionAr: 'عرض إيصالات الاستلام' },
  { code: 'receiving.manage', module: 'receiving', descriptionAr: 'تأكيد استلام المشتريات' },
  { code: 'inventory.view', module: 'inventory', descriptionAr: 'عرض أرصدة وحركات المخزون' },
  { code: 'inventory.adjust', module: 'inventory', descriptionAr: 'تنفيذ تسويات يدوية على المخزون' },
  // Phase 4 / Step 4 — Customers + Sales + Payments
  { code: 'customers.view', module: 'customers', descriptionAr: 'عرض العملاء وعناوينهم' },
  { code: 'customers.manage', module: 'customers', descriptionAr: 'إنشاء/تعديل العملاء وعناوينهم' },
  { code: 'sales.view', module: 'sales', descriptionAr: 'عرض طلبات البيع' },
  { code: 'sales.manage', module: 'sales', descriptionAr: 'إنشاء/تأكيد/تسليم/إلغاء طلبات البيع' },
  { code: 'payments.view', module: 'payments', descriptionAr: 'عرض سجل المدفوعات' },
  { code: 'payments.manage', module: 'payments', descriptionAr: 'تسجيل دفعات على طلبات البيع' },
  // Phase 4 / Step 5 — Returns + Approvals
  { code: 'returns.view', module: 'returns', descriptionAr: 'عرض المرتجعات' },
  { code: 'returns.manage', module: 'returns', descriptionAr: 'إنشاء/تقديم/إتمام/إلغاء المرتجعات' },
  { code: 'approvals.view', module: 'approvals', descriptionAr: 'عرض طلبات الموافقة' },
  { code: 'approvals.decide', module: 'approvals', descriptionAr: 'الموافقة أو الرفض على طلبات الموافقة' },
  // Phase 4 / Step 7 — Reports & Advanced Analytics
  { code: 'reports.view', module: 'reports', descriptionAr: 'عرض النظرة العامة التنفيذية للتقارير' },
  { code: 'reports.sales', module: 'reports', descriptionAr: 'عرض تقارير المبيعات' },
  { code: 'reports.profit', module: 'reports', descriptionAr: 'عرض تقارير الأرباح (حسّاسة ماليًا)' },
  { code: 'reports.inventory', module: 'reports', descriptionAr: 'عرض تقارير المخزون وحركته' },
  { code: 'reports.purchases', module: 'reports', descriptionAr: 'عرض تقارير المشتريات' },
  { code: 'reports.customers', module: 'reports', descriptionAr: 'عرض تقارير العملاء والأرصدة المستحقة' },
  { code: 'reports.suppliers', module: 'reports', descriptionAr: 'عرض تقارير الموردين' },
  { code: 'reports.products', module: 'reports', descriptionAr: 'عرض تحليلات المنتجات' },
  { code: 'reports.export', module: 'reports', descriptionAr: 'تصدير التقارير (CSV)' },
];

// تعيين الصلاحيات لأدوار غير الإدارة — حسب سلوك الأدوار المعتمد تراكميًا
// عبر Step 3 وStep 4 وStep 5 (ADMIN يحصل تلقائيًا على كل الصلاحيات الحالية
// عبر الخطوة رقم 3 أدناه، بما فيها approvals.decide — وهي **حصرية للإدارة**
// عمدًا في Step 5: لم يُطلَب صراحة توسيعها لأي دور آخر، والموافقة على
// المرتجعات قرار حوكمة أفضّل إبقاءه محافظًا حتى تأكيدكم).
const NON_ADMIN_ROLE_PERMISSIONS: Record<string, string[]> = {
  PURCHASING: [
    'purchasing.view',
    'purchasing.manage',
    'receiving.view',
    'returns.view', // رؤية مرتجعات الموردين المرتبطة بأوامر شرائه فقط عمليًا (لا فصل صلاحية أدق من هذا حاليًا)
    'reports.view',
    'reports.purchases',
    'reports.suppliers',
    'reports.products',
  ],
  WAREHOUSE: [
    'receiving.view',
    'receiving.manage',
    'inventory.view',
    'inventory.adjust',
    'returns.view',
    'returns.manage', // التنفيذ الفعلي (Complete) لكلا نوعي المرتجعات غالبًا مسؤولية المخزن فعليًا
    'reports.view',
    'reports.inventory',
    'reports.products',
  ],
  // SALES: لا صلاحيات مشتريات/استلام (كما في Step 3)، ويحصل الآن على كل
  // صلاحيات Step 4 (العملاء/المبيعات/المدفوعات) بصفتها صميم عمله
  SALES: [
    'customers.view',
    'customers.manage',
    'sales.view',
    'sales.manage',
    'payments.view',
    'payments.manage',
    'returns.view',
    'returns.manage', // إنشاء/تقديم مرتجعات العملاء تحديدًا
    'reports.view',
    'reports.sales',
    'reports.customers',
    'reports.products',
    // reports.profit وreports.export عمدًا **ليستا** هنا (حساسية مالية —
    // نفس منطق حصر approvals.decide بالإدارة فقط في Step 5) — قرار قابل
    // للتعديل بسهولة لاحقًا إن احتجتم توسيعه
  ],
};

// الأدوار الأربعة المعتمدة في القرارات النهائية (القسم 4 من System Architecture)
const ROLES: { code: string; nameAr: string }[] = [
  { code: 'ADMIN', nameAr: 'الإدارة' },
  { code: 'SALES', nameAr: 'المبيعات' },
  { code: 'PURCHASING', nameAr: 'المشتريات' },
  { code: 'WAREHOUSE', nameAr: 'المخزن' },
];

async function main() {
  console.log('🌱 بدء تعبئة البيانات الأساسية (Seed)...');

  // 1) Permissions — Upsert لتفادي التكرار عند إعادة التشغيل (Idempotent)
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }
  console.log(`✅ ${PERMISSIONS.length} صلاحية`);

  // 2) Roles
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
  }
  console.log(`✅ ${ROLES.length} أدوار`);

  // 3) ربط دور "الإدارة" بكل الصلاحيات الحالية (المستقبل: كل صلاحية جديدة تُربَط له صراحة عند إضافتها)
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
  });
  console.log('✅ دور الإدارة مرتبط بكل الصلاحيات الحالية');

  // 3ب) تعيين صلاحيات الأدوار الأخرى (PURCHASING/WAREHOUSE/SALES) — Idempotent
  // (استبدال كامل لقائمة صلاحيات كل دور بدل الإضافة التراكمية، لتفادي
  // تراكم صلاحيات قديمة أُزيلت من التعريف أعلاه عند إعادة تشغيل Seed)
  for (const [roleCode, permissionCodes] of Object.entries(NON_ADMIN_ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) continue; // احترازي فقط — كل الأدوار مُنشأة أعلاه بالفعل

    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
    console.log(`✅ دور ${roleCode} مرتبط بـ ${permissions.length} صلاحية`);
  }

  // 4) Admin User — بيانات دخول مبدئية، يجب تغيير كلمة المرور فور أول تشغيل فعلي
  const adminPasswordHash = await bcrypt.hash('ChangeMe123!', BCRYPT_COST_FACTOR);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      fullName: 'مدير النظام',
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      isActive: true,
    },
  });

  const existingUserRole = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
  });
  if (!existingUserRole) {
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
  }
  console.log('✅ مستخدم Admin (username: admin / password: ChangeMe123!)');

  // 5) Basic Settings — طرق دفع أساسية (قرار معتمد: cash + bank_transfer فقط في MVP)
  const paymentMethods = [
    { code: 'cash', nameAr: 'نقدًا' },
    { code: 'bank_transfer', nameAr: 'تحويل بنكي' },
  ];
  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({ where: { code: pm.code }, update: {}, create: pm });
  }
  console.log('✅ طرق الدفع الأساسية');

  // 6) مخزن افتراضي واحد (تشغيل النسخة الأولى بمخزن واحد حسب المتطلبات المعتمدة)
  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { name: 'المخزن الرئيسي', code: 'MAIN' },
  });
  console.log('✅ المخزن الرئيسي');

  console.log('🌱 اكتملت تعبئة البيانات الأساسية بنجاح.');
}

main()
  .catch((e) => {
    console.error('❌ فشل تنفيذ Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
