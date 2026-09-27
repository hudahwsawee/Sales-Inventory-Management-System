import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { ReportFilterBar } from './ReportFilterBar';
import { ComparisonKpiCard, KpiCard } from './KpiCard';
import type { ComparisonValue } from './reportsApi';

interface OverviewData {
  totalSales: ComparisonValue;
  netSales: ComparisonValue;
  grossProfit: ComparisonValue;
  grossProfitMarginPercent: number;
  orderCount: ComparisonValue;
  averageOrderValue: number;
  totalPurchases: ComparisonValue;
  currentInventoryValue: number;
  activeCustomersCount: number;
  totalReceivables: number;
}

export function OverviewTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [compare, setCompare] = useState(false);

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, warehouseId: warehouseId || undefined, compare: compare ? 'true' : undefined };

  const query = useQuery({
    queryKey: ['reports-overview', filters],
    queryFn: async () => (await apiClient.get<OverviewData>('/reports/overview', { params: filters })).data,
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
        extra={
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} disabled={!dateFrom || !dateTo} />
            مقارنة بالفترة السابقة
          </label>
        }
      />

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل النظرة العامة</p>}
      {query.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ComparisonKpiCard label="إجمالي المبيعات" comparison={query.data.totalSales} />
          <ComparisonKpiCard label="صافي المبيعات" comparison={query.data.netSales} />
          <ComparisonKpiCard label="إجمالي الأرباح" comparison={query.data.grossProfit} />
          <KpiCard label="هامش الربح %" value={query.data.grossProfitMarginPercent} isCurrency={false} />
          <ComparisonKpiCard label="عدد الطلبات" comparison={query.data.orderCount} isCurrency={false} />
          <KpiCard label="متوسط قيمة الطلب" value={query.data.averageOrderValue} />
          <ComparisonKpiCard label="إجمالي المشتريات" comparison={query.data.totalPurchases} />
          <KpiCard label="قيمة المخزون الحالية" value={query.data.currentInventoryValue} />
          <KpiCard label="عدد العملاء النشطين" value={query.data.activeCustomersCount} isCurrency={false} />
          <KpiCard label="المبالغ المستحقة على العملاء" value={query.data.totalReceivables} />
        </div>
      )}
    </div>
  );
}
