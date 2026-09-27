import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface ReturnListItem {
  id: string;
  returnNumber: string;
  returnType: 'customer_return' | 'supplier_return';
  status: string;
  returnDate: string;
  customer: { name: string } | null;
  supplier: { name: string } | null;
  warehouse: { name: string };
  items: { quantity: string }[];
}

interface ReturnsResponse {
  items: ReturnListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  approved: 'معتمد',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function ReturnsPage() {
  const canView = usePermission('returns.view');
  const canManage = usePermission('returns.manage');

  const [returnType, setReturnType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['returns', { returnType, status, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<ReturnsResponse>('/returns', {
        params: { returnType: returnType || undefined, status: status || undefined, page, limit: 20 },
      });
      return data;
    },
    enabled: canView,
  });

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">المرتجعات</h1>
        {canManage && (
          <Link to="/returns/new" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            + إنشاء مرتجع
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={returnType}
          onChange={(e) => {
            setPage(1);
            setReturnType(e.target.value);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">كل الأنواع</option>
          <option value="customer_return">مرتجع عميل</option>
          <option value="supplier_return">مرتجع مورد</option>
        </select>
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
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل المرتجعات</p>}
        {query.data && (
          <>
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2">رقم المرتجع</th>
                  <th className="px-4 py-2">النوع</th>
                  <th className="px-4 py-2">الطرف</th>
                  <th className="px-4 py-2">المخزن</th>
                  <th className="px-4 py-2">التاريخ</th>
                  <th className="px-4 py-2">الحالة</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                      لا توجد مرتجعات مطابقة
                    </td>
                  </tr>
                )}
                {query.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{r.returnNumber}</td>
                    <td className="px-4 py-2">{r.returnType === 'customer_return' ? 'مرتجع عميل' : 'مرتجع مورد'}</td>
                    <td className="px-4 py-2">{r.customer?.name ?? r.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-2">{r.warehouse.name}</td>
                    <td className="px-4 py-2">{new Date(r.returnDate).toLocaleDateString('ar-SA')}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[r.status] ?? 'bg-gray-100'}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/returns/${r.id}`} className="text-blue-600 hover:underline text-xs">
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
