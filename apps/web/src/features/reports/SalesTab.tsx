import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { ReportFilterBar } from './ReportFilterBar';
import { KpiCard } from './KpiCard';
import { SimpleBarChart } from '../../shared/components/SimpleBarChart';
import { formatCurrency } from './reportsApi';

interface SalesData {
  summary: { totalSales: number; netSales: number; orderCount: number; averageOrderValue: number; returnsValue: number };
  byStatus: { status: string; count: number }[];
  byPaymentType: { paymentType: string; totalAmount: number; count: number }[];
  byWarehouse: { warehouseId: string; warehouseName: string; totalAmount: number; count: number }[];
  trend: { period: string; amount: number }[];
  topProducts: { productId: string; productName: string; totalSales: number; quantitySold: number }[];
  topCustomers: { customerId: string; customerName: string; totalSales: number; orderCount: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  approved: 'معتمد',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  rejected: 'مرفوض',
};

export function SalesTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, warehouseId: warehouseId || undefined };

  const query = useQuery({
    queryKey: ['reports-sales', filters],
    queryFn: async () => (await apiClient.get<SalesData>('/reports/sales', { params: filters })).data,
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
        exportType="sales-top-products"
        exportFilters={filters}
      />

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تقرير المبيعات</p>}
      {query.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="إجمالي المبيعات" value={query.data.summary.totalSales} />
            <KpiCard label="صافي المبيعات" value={query.data.summary.netSales} />
            <KpiCard label="عدد الطلبات" value={query.data.summary.orderCount} isCurrency={false} />
            <KpiCard label="متوسط قيمة الطلب" value={query.data.summary.averageOrderValue} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-bold mb-3">اتجاه المبيعات</h3>
            <SimpleBarChart data={query.data.trend.map((t) => ({ label: t.period, value: t.amount }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <h3 className="text-sm font-bold p-3 border-b border-gray-100">أفضل المنتجات مبيعًا</h3>
              <table className="w-full text-sm text-right">
                <tbody>
                  {query.data.topProducts.map((p) => (
                    <tr key={p.productId} className="border-t border-gray-50">
                      <td className="px-3 py-2">{p.productName}</td>
                      <td className="px-3 py-2 text-gray-500">{p.quantitySold}</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(p.totalSales)}</td>
                    </tr>
                  ))}
                  {query.data.topProducts.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-gray-400">لا توجد بيانات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <h3 className="text-sm font-bold p-3 border-b border-gray-100">أفضل العملاء</h3>
              <table className="w-full text-sm text-right">
                <tbody>
                  {query.data.topCustomers.map((c) => (
                    <tr key={c.customerId} className="border-t border-gray-50">
                      <td className="px-3 py-2">{c.customerName}</td>
                      <td className="px-3 py-2 text-gray-500">{c.orderCount} طلب</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(c.totalSales)}</td>
                    </tr>
                  ))}
                  {query.data.topCustomers.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-gray-400">لا توجد بيانات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-bold mb-3">حسب طريقة الدفع</h3>
              {query.data.byPaymentType.map((p) => (
                <div key={p.paymentType} className="flex justify-between text-sm py-1 border-b border-gray-50">
                  <span>{p.paymentType === 'cash' ? 'نقدي' : 'آجل'}</span>
                  <span className="font-medium">{formatCurrency(p.totalAmount)}</span>
                </div>
              ))}
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
