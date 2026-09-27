import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { ReportFilterBar } from './ReportFilterBar';
import { KpiCard } from './KpiCard';
import { SimpleBarChart } from '../../shared/components/SimpleBarChart';
import { formatCurrency } from './reportsApi';

interface PurchasesData {
  summary: { totalPurchases: number; orderCount: number; averageOrderValue: number };
  byStatus: { status: string; count: number }[];
  bySupplier: { supplierId: string; supplierName: string; totalValue: number; orderCount: number }[];
  trend: { period: string; amount: number }[];
  overduePurchaseOrdersCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending: 'قيد الانتظار',
  partially_received: 'مستلم جزئيًا',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

export function PurchasesTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, warehouseId: warehouseId || undefined };

  const query = useQuery({
    queryKey: ['reports-purchases', filters],
    queryFn: async () => (await apiClient.get<PurchasesData>('/reports/purchases', { params: filters })).data,
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
        exportType="purchases-by-supplier"
        exportFilters={filters}
      />

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تقرير المشتريات</p>}
      {query.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="إجمالي المشتريات" value={query.data.summary.totalPurchases} />
            <KpiCard label="عدد أوامر الشراء" value={query.data.summary.orderCount} isCurrency={false} />
            <KpiCard label="متوسط قيمة أمر الشراء" value={query.data.summary.averageOrderValue} />
            <KpiCard label="أوامر شراء متأخرة" value={query.data.overduePurchaseOrdersCount} isCurrency={false} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-bold mb-3">اتجاه المشتريات</h3>
            <SimpleBarChart data={query.data.trend.map((t) => ({ label: t.period, value: t.amount }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <h3 className="text-sm font-bold p-3 border-b border-gray-100">حسب المورد</h3>
              <table className="w-full text-sm text-right">
                <tbody>
                  {query.data.bySupplier.map((s) => (
                    <tr key={s.supplierId} className="border-t border-gray-50">
                      <td className="px-3 py-2">{s.supplierName}</td>
                      <td className="px-3 py-2 text-gray-500">{s.orderCount} أمر</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(s.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-bold mb-3">حسب الحالة</h3>
              {query.data.byStatus.map((s) => (
                <div key={s.status} className="flex justify-between text-sm py-1 border-b border-gray-50">
                  <span>{STATUS_LABELS[s.status] ?? s.status}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
