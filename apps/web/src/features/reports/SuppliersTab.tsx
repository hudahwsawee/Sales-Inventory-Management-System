import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { KpiCard } from './KpiCard';
import { formatCurrency, exportReport } from './reportsApi';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast } from '../../shared/notifications/ToastProvider';

interface SuppliersData {
  summary: { totalSuppliers: number };
  topSuppliers: { supplierId: string; supplierName: string; totalValue: number; orderCount: number }[];
  note: string;
}

export function SuppliersTab() {
  const canExport = usePermission('reports.export');
  const { showSuccess, showError } = useToast();

  const query = useQuery({
    queryKey: ['reports-suppliers'],
    queryFn: async () => (await apiClient.get<SuppliersData>('/reports/suppliers')).data,
  });

  async function handleExport() {
    try {
      await exportReport('suppliers-top', {});
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
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تقرير الموردين</p>}
      {query.data && (
        <>
          <div className="mb-6">
            <KpiCard label="إجمالي الموردين" value={query.data.summary.totalSuppliers} isCurrency={false} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
            <h3 className="text-sm font-bold p-3 border-b border-gray-100">أفضل الموردين حسب قيمة الشراء</h3>
            <table className="w-full text-sm text-right">
              <tbody>
                {query.data.topSuppliers.map((s) => (
                  <tr key={s.supplierId} className="border-t border-gray-50">
                    <td className="px-3 py-2">{s.supplierName}</td>
                    <td className="px-3 py-2 text-gray-500">{s.orderCount} أمر</td>
                    <td className="px-3 py-2 font-medium">{formatCurrency(s.totalValue)}</td>
                  </tr>
                ))}
                {query.data.topSuppliers.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-gray-400">لا توجد بيانات</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">{query.data.note}</p>
        </>
      )}
    </div>
  );
}
