import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface SalesOrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  orderDate: string;
  totalAmount: string;
  remainingBalance: number;
  customer: { name: string };
  warehouse: { name: string };
}

interface SalesOrdersResponse {
  items: SalesOrderListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  approved: 'معتمد',
  preparing: 'قيد التجهيز',
  ready_for_delivery: 'جاهز للتسليم',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  rejected: 'مرفوض',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function SalesOrdersPage() {
  const canView = usePermission('sales.view');
  const canManage = usePermission('sales.manage');

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['sales-orders', { status, search, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<SalesOrdersResponse>('/sales-orders', {
        params: { status: status || undefined, search: search || undefined, page, limit: 20 },
      });
      return data;
    },
    enabled: canView,
  });

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">أوامر البيع</h1>
        {canManage && (
          <Link to="/sales/new" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            + إنشاء أمر بيع
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="بحث برقم الطلب..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]"
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {query.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل أوامر البيع</p>}
        {query.data && (
          <>
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2">رقم الطلب</th>
                  <th className="px-4 py-2">العميل</th>
                  <th className="px-4 py-2">المخزن</th>
                  <th className="px-4 py-2">التاريخ</th>
                  <th className="px-4 py-2">الإجمالي</th>
                  <th className="px-4 py-2">المتبقي</th>
                  <th className="px-4 py-2">الحالة</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                      لا توجد أوامر بيع مطابقة
                    </td>
                  </tr>
                )}
                {query.data.items.map((so) => (
                  <tr key={so.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{so.orderNumber}</td>
                    <td className="px-4 py-2">{so.customer.name}</td>
                    <td className="px-4 py-2">{so.warehouse.name}</td>
                    <td className="px-4 py-2">{new Date(so.orderDate).toLocaleDateString('ar-SA')}</td>
                    <td className="px-4 py-2">{so.totalAmount}</td>
                    <td className={`px-4 py-2 ${so.remainingBalance > 0 ? 'text-orange-600 font-medium' : ''}`}>
                      {so.remainingBalance}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[so.status] ?? 'bg-gray-100'}`}>
                        {STATUS_LABELS[so.status] ?? so.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/sales/${so.id}`} className="text-blue-600 hover:underline text-xs">
                        التفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
              <span>
                صفحة {query.data.pagination.page} من {query.data.pagination.totalPages || 1} — إجمالي{' '}
                {query.data.pagination.total}
              </span>
              <div className="space-x-2 space-x-reverse">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                  السابق
                </button>
                <button
                  disabled={page >= query.data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
