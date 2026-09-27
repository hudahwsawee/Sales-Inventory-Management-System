/**
 * HomePage — كانت صفحة هبوط مؤقتة منذ Step 1 (لإثبات أن المصادقة وRBAC
 * يعملان). في Step 6 أصبحت تعرض أيضًا "ملخص التنبيهات التشغيلية" البسيط
 * المطلوب صراحة (Dashboard Alerts Summary) — بدون بناء Dashboard كامل
 * بمخططات مبيعات (لا يزال خارج النطاق). كل بطاقة تظهر فقط إن كان
 * المستخدم يملك صلاحية رؤية مصدرها فعليًا (يُحدَّد ذلك في Backend، ليس هنا).
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { apiClient } from '../../lib/api-client';

interface AlertsSummary {
  lowStock?: number;
  pendingApprovals?: number;
  creditLimitCustomers?: number;
  overduePurchaseOrders?: number;
}

const CARDS: { key: keyof AlertsSummary; label: string; link: string; color: string }[] = [
  { key: 'lowStock', label: 'منتجات منخفضة المخزون', link: '/inventory/low-stock', color: 'border-orange-200 bg-orange-50 text-orange-700' },
  { key: 'pendingApprovals', label: 'موافقات معلَّقة', link: '/approvals', color: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
  { key: 'creditLimitCustomers', label: 'عملاء عند/فوق الحد الائتماني', link: '/customers', color: 'border-red-200 bg-red-50 text-red-700' },
  { key: 'overduePurchaseOrders', label: 'أوامر شراء متأخرة', link: '/purchasing/overdue', color: 'border-purple-200 bg-purple-50 text-purple-700' },
];

export default function HomePage() {
  const user = useAuthStore((s) => s.user);

  const summaryQuery = useQuery({
    queryKey: ['dashboard-alerts-summary'],
    queryFn: async () => (await apiClient.get<AlertsSummary>('/dashboard/alerts-summary')).data,
  });

  const visibleCards = CARDS.filter((c) => summaryQuery.data?.[c.key] !== undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold">مرحبًا بك، {user?.fullName}</h1>

      <div>
        <h2 className="text-sm font-bold mb-3">ملخص التنبيهات التشغيلية</h2>
        {summaryQuery.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
        {summaryQuery.isError && <p className="text-sm text-red-600">تعذّر تحميل الملخص</p>}
        {summaryQuery.data && visibleCards.length === 0 && (
          <p className="text-sm text-gray-400">لا تملك صلاحية عرض أي من عدّادات التنبيهات حاليًا.</p>
        )}
        {summaryQuery.data && visibleCards.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {visibleCards.map((card) => (
              <Link
                key={card.key}
                to={card.link}
                className={`border rounded-lg p-4 hover:shadow-sm transition-shadow ${card.color}`}
              >
                <div className="text-2xl font-bold">{summaryQuery.data[card.key]}</div>
                <div className="text-xs mt-1">{card.label}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
        <p>
          الأدوار الحالية: <span className="font-medium">{user?.roles.join('، ')}</span>
        </p>
        <p className="mt-1">
          عدد الصلاحيات الممنوحة: <span className="font-medium">{user?.permissions.length}</span>
        </p>
      </div>
    </div>
  );
}
