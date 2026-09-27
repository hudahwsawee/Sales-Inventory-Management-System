import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { ReportFilterBar } from './ReportFilterBar';
import { KpiCard } from './KpiCard';
import { formatCurrency } from './reportsApi';

interface InventoryData {
  summary: { totalValue: number; totalItems: number; belowMinimumCount: number; outOfStockCount: number };
  byWarehouse: { warehouseId: string; warehouseName: string; value: number; itemCount: number }[];
  belowMinimumProducts: { productName: string; warehouseName: string; availableQuantity: number; minimumStock: number | null }[];
  outOfStockProducts: { productName: string; warehouseName: string }[];
}

interface MovementItem {
  id: string;
  date: string;
  productName: string;
  warehouseName: string;
  transactionType: string;
  quantity: number;
  referenceType: string;
  userName: string;
}
interface MovementsResponse {
  items: MovementItem[];
  pagination: { page: number; totalPages: number; total: number };
}

const TYPE_LABELS: Record<string, string> = {
  purchase_receipt: 'استلام مشتريات',
  sale: 'بيع',
  customer_return: 'مرتجع عميل',
  supplier_return: 'مرتجع مورد',
  adjustment: 'تسوية',
};

export function InventoryTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [movementsPage, setMovementsPage] = useState(1);

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, warehouseId: warehouseId || undefined };

  const query = useQuery({
    queryKey: ['reports-inventory', filters],
    queryFn: async () => (await apiClient.get<InventoryData>('/reports/inventory', { params: filters })).data,
  });

  const movementsQuery = useQuery({
    queryKey: ['reports-inventory-movements', filters, movementsPage],
    queryFn: async () =>
      (await apiClient.get<MovementsResponse>('/reports/inventory/movements', { params: { ...filters, page: movementsPage, limit: 20 } })).data,
  });

  return (
    <div>
      <ReportFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        warehouseId={warehouseId}
        onChange={(p) => {
          if (p.dateFrom !== undefined) setDateFrom(p.dateFrom);
          if (p.dateTo !== undefined) setDateTo(p.dateTo);
          if (p.warehouseId !== undefined) setWarehouseId(p.warehouseId);
        }}
        exportType="inventory-items"
        exportFilters={filters}
      />

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تقرير المخزون</p>}
      {query.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="قيمة المخزون الحالية" value={query.data.summary.totalValue} />
            <KpiCard label="عدد الأصناف" value={query.data.summary.totalItems} isCurrency={false} />
            <KpiCard label="أصناف تحت الحد الأدنى" value={query.data.summary.belowMinimumCount} isCurrency={false} />
            <KpiCard label="أصناف نافدة" value={query.data.summary.outOfStockCount} isCurrency={false} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-bold mb-3">القيمة حسب المخزن</h3>
            {query.data.byWarehouse.map((w) => (
              <div key={w.warehouseId} className="flex justify-between text-sm py-1 border-b border-gray-50">
                <span>{w.warehouseName}</span>
                <span className="font-medium">{formatCurrency(w.value)}</span>
              </div>
            ))}
          </div>

          {query.data.belowMinimumProducts.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
              <h3 className="text-sm font-bold p-3 border-b border-gray-100 text-orange-700">منتجات تحت الحد الأدنى</h3>
              <table className="w-full text-sm text-right">
                <tbody>
                  {query.data.belowMinimumProducts.map((p, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2">{p.productName}</td>
                      <td className="px-3 py-2 text-gray-500">{p.warehouseName}</td>
                      <td className="px-3 py-2 text-orange-600 font-medium">{p.availableQuantity}</td>
                      <td className="px-3 py-2 text-gray-400">حد أدنى: {p.minimumStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h3 className="text-sm font-bold mb-2 mt-8">حركة المخزون</h3>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {movementsQuery.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {movementsQuery.data && (
          <>
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">المنتج</th>
                  <th className="px-3 py-2">المخزن</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {movementsQuery.data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                      لا توجد حركات مطابقة
                    </td>
                  </tr>
                )}
                {movementsQuery.data.items.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50">
                    <td className="px-3 py-2">{new Date(m.date).toLocaleString('ar-SA')}</td>
                    <td className="px-3 py-2">{m.productName}</td>
                    <td className="px-3 py-2">{m.warehouseName}</td>
                    <td className="px-3 py-2">{TYPE_LABELS[m.transactionType] ?? m.transactionType}</td>
                    <td className={`px-3 py-2 font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.quantity > 0 ? '+' : ''}
                      {m.quantity}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{m.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-sm text-gray-600">
              <span>
                صفحة {movementsQuery.data.pagination.page} من {movementsQuery.data.pagination.totalPages || 1}
              </span>
              <div className="space-x-2 space-x-reverse">
                <button disabled={movementsPage <= 1} onClick={() => setMovementsPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                  السابق
                </button>
                <button
                  disabled={movementsPage >= movementsQuery.data.pagination.totalPages}
                  onClick={() => setMovementsPage((p) => p + 1)}
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
