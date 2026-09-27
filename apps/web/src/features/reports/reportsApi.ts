import { apiClient } from '../../lib/api-client';

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
}

export interface ComparisonValue {
  current: number;
  previous: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

/**
 * exportReport — يجلب CSV عبر Blob (وليس رابطًا مباشرًا) لأن axios يُرفق
 * Authorization Header تلقائيًا؛ رابط <a href> عادي لن يحمل التوكن أصلًا.
 * يمرِّر **نفس فلاتر الشاشة الحالية بالضبط** — لا مسار بيانات منفصل
 * (متطلب Step 7 §17 صراحة: التصدير يجب أن يطابق الفلاتر المختارة).
 */
export async function exportReport(type: string, filters: Record<string, string | undefined>) {
  const response = await apiClient.get('/reports/export', {
    params: { type, ...filters },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
