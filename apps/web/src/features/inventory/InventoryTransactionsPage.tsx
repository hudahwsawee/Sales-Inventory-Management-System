import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface TransactionItem {
  id: string;
  transactionType: string;
  quantity: string;
  unitCost: string | null;
  transactionDate: string;
  referenceType: string;
  referenceId: string | null;
  notes: string | null;
  product: { code: string; nameAr: string };
  warehouse: { name: string };
  user: { fullName: string };
}

interface TransactionsResponse {
  items: TransactionItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const TYPE_LABELS: Record<string, string> = {
  purchase_receipt: 'استلام مشتريات',
  sale: 'بيع',
  customer_return: 'مرتجع عميل',
  supplier_return: 'مرتجع مورد',
  adjustment: 'تسوية',
};

export default function InventoryTransactionsPage() {
  const canView = usePermission('inventory.view');
  const [transactionType, setTransactionType] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['inventory-transactions', { transactionType, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<TransactionsResponse>('/inventory/transactions', {
        params: { transactionType: transactionType || undefined, page, limit: 50 },
      });
      return data;
    },
    enabled: canView,
  });

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">حركات المخزون</h1>

      <div className="mb-4">
        <select
          value={transactionType}
          onChange={(e) => {
            setPage(1);
            setTransactionType(e.target.value);
          }}
          className="input w-64"
        >
          <option value="">كل الأنواع</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {query.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل الحركات</p>}
        {query.data && (
          <>
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2">التاريخ</th>
                  <th className="px-4 py-2">المنتج</th>
                  <th className="px-4 py-2">المخزن</th>
                  <th className="px-4 py-2">النوع</th>
                  <th className="px-4 py-2">الكمية</th>
                  <th className="px-4 py-2">المرجع</th>
                  <th className="px-4 py-2">المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                      لا توجد حركات مطابقة
                    </td>
                  </tr>
                )}
                {query.data.items.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{new Date(t.transactionDate).toLocaleString('ar-SA')}</td>
                    <td className="px-4 py-2">
                      {t.product.nameAr} <span className="text-gray-400 text-xs">({t.product.code})</span>
                    </td>
                    <td className="px-4 py-2">{t.warehouse.name}</td>
                    <td className="px-4 py-2">{TYPE_LABELS[t.transactionType] ?? t.transactionType}</td>
                    <td className={`px-4 py-2 font-medium ${Number(t.quantity) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(t.quantity) > 0 ? '+' : ''}
                      {t.quantity}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{t.referenceType}</td>
                    <td className="px-4 py-2">{t.user.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
              <span>
                صفحة {query.data.pagination.page} من {query.data.pagination.totalPages || 1}
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
