import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  status: string;
  orderDate: string;
  supplier: { name: string };
  warehouse: { name: string };
  items: { quantityOrdered: string; quantityReceived: string; unitPrice: string }[];
}

interface PurchaseOrdersResponse {
  items: PurchaseOrderListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending: 'قيد الانتظار',
  partially_received: 'مستلم جزئيًا',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PurchaseOrdersPage() {
  const canView = usePermission('purchasing.view');
  const canManage = usePermission('purchasing.manage');

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['purchase-orders', { status, search, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<PurchaseOrdersResponse>('/purchase-orders', {
        params: { status: status || undefined, search: search || undefined, page, limit: 20 },
      });
      return data;
    },
    enabled: canView,
  });

  function orderTotal(po: PurchaseOrderListItem) {
    return po.items.reduce((sum, i) => sum + Number(i.quantityOrdered) * Number(i.unitPrice), 0);
  }

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">أوامر الشراء</h1>
        {canManage && (
          <Link
            to="/purchasing/new"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + إنشاء أمر شراء
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
          placeholder="بحث برقم أمر الشراء..."
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
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل أوامر الشراء</p>}
        {query.data && (
          <>
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2">رقم الأمر</th>
                  <th className="px-4 py-2">المورد</th>
                  <th className="px-4 py-2">المخزن</th>
                  <th className="px-4 py-2">التاريخ</th>
                  <th className="px-4 py-2">القيمة الإجمالية</th>
                  <th className="px-4 py-2">الحالة</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                      لا توجد أوامر شراء مطابقة
                    </td>
                  </tr>
                )}
                {query.data.items.map((po) => (
                  <tr key={po.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{po.poNumber}</td>
                    <td className="px-4 py-2">{po.supplier.name}</td>
                    <td className="px-4 py-2">{po.warehouse.name}</td>
                    <td className="px-4 py-2">{new Date(po.orderDate).toLocaleDateString('ar-SA')}</td>
                    <td className="px-4 py-2">{orderTotal(po).toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[po.status]}`}>
                        {STATUS_LABELS[po.status] ?? po.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/purchasing/${po.id}`} className="text-blue-600 hover:underline text-xs">
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
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
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
