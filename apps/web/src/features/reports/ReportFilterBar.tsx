import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast } from '../../shared/notifications/ToastProvider';
import { exportReport } from './reportsApi';

interface Warehouse {
  id: string;
  name: string;
}

export function ReportFilterBar({
  dateFrom,
  dateTo,
  warehouseId,
  onChange,
  exportType,
  exportFilters,
  extra,
}: {
  dateFrom: string;
  dateTo: string;
  warehouseId: string;
  onChange: (patch: Partial<{ dateFrom: string; dateTo: string; warehouseId: string }>) => void;
  exportType?: string;
  exportFilters?: Record<string, string | undefined>;
  extra?: React.ReactNode;
}) {
  const canExport = usePermission('reports.export');
  const { showError, showSuccess } = useToast();

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<Warehouse[]>('/warehouses')).data,
  });

  async function handleExport() {
    if (!exportType) return;
    try {
      await exportReport(exportType, exportFilters ?? {});
      showSuccess('تم تصدير الملف بنجاح');
    } catch {
      showError('تعذّر تصدير التقرير — قد لا تملك صلاحية الوصول لهذه البيانات');
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 bg-white border border-gray-200 rounded-lg p-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
        <input type="date" value={dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} className="input text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
        <input type="date" value={dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} className="input text-sm" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">المخزن</label>
        <select value={warehouseId} onChange={(e) => onChange({ warehouseId: e.target.value })} className="input text-sm">
          <option value="">كل المخازن</option>
          {warehousesQuery.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      {extra}
      {exportType && canExport && (
        <button onClick={handleExport} className="mr-auto bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-900">
          تصدير CSV
        </button>
      )}
    </div>
  );
}
