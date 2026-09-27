import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';
import { RequirePermission } from './ProtectedRoute';
import { NotificationBell } from '../../features/notifications/NotificationBell';

/**
 * AppLayout — مُحدَّث في Step 3 بروابط المشتريات (أوامر الشراء) والمخزون
 * (أرصدة/حركات/منخفض/تسويات). كل رابط مغلَّف بـRequirePermission (عرض فقط
 * — Backend هو الحماية الفعلية). روابط Sales/Dashboard ستُضاف لاحقًا.
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-l border-gray-200 p-4">
        <h2 className="font-bold text-sm mb-6">نظام المبيعات والمخزون</h2>
        <nav className="space-y-2 text-sm">
          <Link to="/" className="block px-3 py-2 rounded hover:bg-gray-100">
            الرئيسية
          </Link>
          <Link to="/users" className="block px-3 py-2 rounded hover:bg-gray-100">
            المستخدمون
          </Link>

          <RequirePermission permission="catalog.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">الكتالوج</p>
            <Link to="/products" className="block px-3 py-2 rounded hover:bg-gray-100">
              المنتجات
            </Link>
            <Link to="/categories" className="block px-3 py-2 rounded hover:bg-gray-100">
              التصنيفات
            </Link>
            <Link to="/brands" className="block px-3 py-2 rounded hover:bg-gray-100">
              العلامات التجارية
            </Link>
            <Link to="/units" className="block px-3 py-2 rounded hover:bg-gray-100">
              الوحدات
            </Link>
          </RequirePermission>

          <RequirePermission permission="suppliers.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">الشركاء</p>
            <Link to="/suppliers" className="block px-3 py-2 rounded hover:bg-gray-100">
              الموردون
            </Link>
          </RequirePermission>

          <RequirePermission permission="warehouses.view">
            <Link to="/warehouses" className="block px-3 py-2 rounded hover:bg-gray-100">
              المخازن
            </Link>
          </RequirePermission>

          <RequirePermission permission="purchasing.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">المشتريات</p>
            <Link to="/purchasing" className="block px-3 py-2 rounded hover:bg-gray-100">
              أوامر الشراء
            </Link>
            <Link to="/purchasing/overdue" className="block px-3 py-2 rounded hover:bg-gray-100">
              أوامر الشراء المتأخرة
            </Link>
          </RequirePermission>

          <RequirePermission permission="inventory.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">المخزون</p>
            <Link to="/inventory/balances" className="block px-3 py-2 rounded hover:bg-gray-100">
              أرصدة المخزون
            </Link>
            <Link to="/inventory/transactions" className="block px-3 py-2 rounded hover:bg-gray-100">
              حركات المخزون
            </Link>
            <Link to="/inventory/low-stock" className="block px-3 py-2 rounded hover:bg-gray-100">
              المخزون المنخفض
            </Link>
          </RequirePermission>
          <RequirePermission permission="inventory.adjust">
            <Link to="/inventory/adjustments" className="block px-3 py-2 rounded hover:bg-gray-100">
              تسويات المخزون
            </Link>
          </RequirePermission>

          <RequirePermission permission="customers.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">المبيعات</p>
            <Link to="/customers" className="block px-3 py-2 rounded hover:bg-gray-100">
              العملاء
            </Link>
          </RequirePermission>
          <RequirePermission permission="sales.view">
            <Link to="/sales" className="block px-3 py-2 rounded hover:bg-gray-100">
              أوامر البيع
            </Link>
          </RequirePermission>

          <RequirePermission permission="returns.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">المرتجعات والحوكمة</p>
            <Link to="/returns" className="block px-3 py-2 rounded hover:bg-gray-100">
              المرتجعات
            </Link>
          </RequirePermission>
          <RequirePermission permission="approvals.view">
            <Link to="/approvals" className="block px-3 py-2 rounded hover:bg-gray-100">
              الموافقات
            </Link>
          </RequirePermission>
          <RequirePermission permission="audit.view">
            <Link to="/audit-logs" className="block px-3 py-2 rounded hover:bg-gray-100">
              سجل التدقيق
            </Link>
          </RequirePermission>

          <RequirePermission permission="reports.view">
            <p className="px-3 pt-3 pb-1 text-xs text-gray-400">التقارير والتحليلات</p>
            <Link to="/reports" className="block px-3 py-2 rounded hover:bg-gray-100">
              التقارير والتحليلات
            </Link>
          </RequirePermission>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <NotificationBell />
            <span className="text-sm text-gray-600">مرحبًا، {user?.fullName}</span>
          </div>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">
            تسجيل الخروج
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
