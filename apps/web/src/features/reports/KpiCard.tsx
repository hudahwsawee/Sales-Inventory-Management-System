import type { ComparisonValue } from './reportsApi';
import { formatCurrency, formatPercent } from './reportsApi';

/** بطاقة KPI بسيطة (بلا مقارنة) */
export function KpiCard({ label, value, isCurrency = true }: { label: string; value: number; isCurrency?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold">{isCurrency ? formatCurrency(value) : value.toLocaleString('ar-SA')}</div>
    </div>
  );
}

/**
 * بطاقة KPI مع مقارنة بالفترة السابقة — لا تعرض نسبة تغيير مضلِّلة أبدًا
 * عندما تكون القيمة السابقة صفرًا (previous=0 → changePercent=null من
 * الـBackend نفسه، وليس افتراضًا هنا في الواجهة).
 */
export function ComparisonKpiCard({ label, comparison, isCurrency = true }: { label: string; comparison: ComparisonValue; isCurrency?: boolean }) {
  const format = (v: number) => (isCurrency ? formatCurrency(v) : v.toLocaleString('ar-SA'));
  const isPositive = (comparison.changeAmount ?? 0) >= 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold">{format(comparison.current)}</div>
      {comparison.previous !== null && (
        <div className={`text-xs mt-1 ${comparison.changePercent === null ? 'text-gray-400' : isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {comparison.changePercent === null ? 'لا توجد بيانات كافية للمقارنة' : `${formatPercent(comparison.changePercent)} عن الفترة السابقة`}
        </div>
      )}
    </div>
  );
}
