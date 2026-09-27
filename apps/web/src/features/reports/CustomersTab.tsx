import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { KpiCard } from './KpiCard';
import { formatCurrency } from './reportsApi';
import { usePermission } from '../../shared/permissions/usePermission';
import { exportReport } from './reportsApi';
import { useToast } from '../../shared/notifications/ToastProvider';

interface CustomersData {
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    cashCustomers: number;
    creditCustomers: number;
    atOrOverLimitCount: number;
    totalReceivables: number;
  };
  topCustomers: { customerId: string; customerName: string; totalSales: number; orderCount: number }[];
  accountsReceivableNote: string;
}

export function CustomersTab() {
  const canExport = usePermission('reports.export');
  const { showSuccess, showError } = useToast();

  const query = useQuery({
    queryKey: ['reports-customers'],
    queryFn: async () => (await apiClient.get<CustomersData>('/reports/customers')).data,
  });

  async function handleExport() {
    try {
      await exportReport('customers-top', {});
      showSuccess('تم تصدير الملف بنجاح');
    } catch {
      showError('تعذّر تصدير التقرير');
    }
  }

  return (
    <div>
      {canExport && (
        <div className="flex justify-end mb-4">
          <button onClick={handleExport} className="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-900">
            تصدير CSV
          </button>
        </div>
      )}

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تقرير العملاء</p>}
      {query.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KpiCard label="إجمالي العملاء" value={query.data.summary.totalCustomers} isCurrency={false} />
            <KpiCard label="عملاء نقدي" value={query.data.summary.cashCustomers} isCurrency={false} />
            <KpiCard label="عملاء آجل" value={query.data.summary.creditCustomers} isCurrency={false} />
            <KpiCard label="عند/فوق الحد الائتماني" value={query.data.summary.atOrOverLimitCount} isCurrency={false} />
          </div>
          <div className="mb-6">
            <KpiCard label="إجمالي المبالغ المستحقة" value={query.data.summary.totalReceivables} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
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
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">{query.data.accountsReceivableNote}</p>
        </>
      )}
    </div>
  );
}
