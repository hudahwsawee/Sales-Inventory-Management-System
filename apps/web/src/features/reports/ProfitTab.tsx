import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { ReportFilterBar } from './ReportFilterBar';
import { KpiCard } from './KpiCard';
import { SimpleBarChart } from '../../shared/components/SimpleBarChart';

interface ProfitData {
  summary: { revenue: number; netSales: number; cogs: number; grossProfit: number; grossProfitMarginPercent: number };
  profitTrend: { period: string; profit: number }[];
}

export function ProfitTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, warehouseId: warehouseId || undefined };

  const query = useQuery({
    queryKey: ['reports-profit', filters],
    queryFn: async () => (await apiClient.get<ProfitData>('/reports/profit', { params: filters })).data,
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
        exportType="profit-trend"
        exportFilters={filters}
      />

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تقرير الأرباح</p>}
      {query.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="الإيراد" value={query.data.summary.revenue} />
            <KpiCard label="صافي المبيعات" value={query.data.summary.netSales} />
            <KpiCard label="تكلفة البضاعة المباعة (COGS)" value={query.data.summary.cogs} />
            <KpiCard label="إجمالي الربح" value={query.data.summary.grossProfit} />
          </div>
          <div className="mb-6">
            <KpiCard label="هامش الربح الإجمالي %" value={query.data.summary.grossProfitMarginPercent} isCurrency={false} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-bold mb-3">اتجاه الربح</h3>
            <SimpleBarChart data={query.data.profitTrend.map((t) => ({ label: t.period, value: t.profit }))} />
          </div>

          <p className="text-xs text-gray-400 mt-4">
            طريقة الاحتساب: إجمالي الربح = صافي المبيعات − تكلفة البضاعة المباعة (COGS المحسوبة من تكلفة كل
            منتج وقت البيع الفعلي، وليس التكلفة الحالية). المرتجعات المكتملة تُخفِّض كلًا من الإيراد والتكلفة معًا بدقة.
          </p>
        </>
      )}
    </div>
  );
}
