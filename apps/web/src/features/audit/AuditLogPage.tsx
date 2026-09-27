import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Modal } from '../../shared/components/Modal';
import { usePermission } from '../../shared/permissions/usePermission';

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  timestamp: string;
  user: { id: string; fullName: string; username: string };
}

interface AuditLogsResponse {
  items: AuditLogItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  deactivate: 'تعطيل',
  approve: 'موافقة',
  reject: 'رفض',
  status_change: 'تغيير حالة',
};

/**
 * AuditLogPage — قراءة فقط بالكامل (Read Only)، بلا أي إمكانية تعديل/حذف/
 * إنشاء يدوي من الواجهة، تطبيقًا حرفيًا لطبيعة audit_logs كسجل Append-only
 * في الـBackend. الحماية الفعلية هي RequirePermission('audit.view') على
 * الـEndpoint نفسه — إخفاء الرابط هنا مجرد تحسين لتجربة الاستخدام فقط.
 *
 * الحقول المعروضة مطابقة تمامًا لما يُرجعه الـAPI فعليًا (id, action,
 * entity, entityId, oldValue, newValue, timestamp, user) — لا يوجد حقل
 * IP Address في نموذج AuditLog الحالي، فلم يُعرَض هنا تفاديًا لافتراض
 * بيانات غير موجودة فعليًا.
 */
export default function AuditLogPage() {
  const canView = usePermission('audit.view');

  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [detailsLog, setDetailsLog] = useState<AuditLogItem | null>(null);

  const query = useQuery({
    queryKey: ['audit-logs', { entity, action, userSearch, dateFrom, dateTo, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<AuditLogsResponse>('/audit-logs', {
        params: {
          entity: entity || undefined,
          action: action || undefined,
          userSearch: userSearch || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          limit: 50,
        },
      });
      return data;
    },
    enabled: canView,
  });

  function resetToFirstPage() {
    setPage(1);
  }

  if (!canView) {
    // نفس أسلوب بقية الصفحات: إخفاء المحتوى للمستخدم بلا الصلاحية — الحماية
    // الفعلية والنهائية تبقى في Backend عبر RequirePermission('audit.view')
    return <p className="text-sm text-gray-500">لا تملك صلاحية عرض سجل التدقيق.</p>;
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-1">سجل التدقيق</h1>
      <p className="text-sm text-gray-500 mb-4">سجل قراءة فقط لكل العمليات المهمة في النظام — لا يمكن تعديله أو حذفه من هنا.</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={entity}
          onChange={(e) => {
            resetToFirstPage();
            setEntity(e.target.value);
          }}
          placeholder="الكيان (مثال: sales_orders)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
        />
        <select
          value={action}
          onChange={(e) => {
            resetToFirstPage();
            setAction(e.target.value);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">كل العمليات</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={userSearch}
          onChange={(e) => {
            resetToFirstPage();
            setUserSearch(e.target.value);
          }}
          placeholder="بحث بالمستخدم (الاسم أو اسم الدخول)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            resetToFirstPage();
            setDateFrom(e.target.value);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            resetToFirstPage();
            setDateTo(e.target.value);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {query.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل سجل التدقيق</p>}
        {query.data && (
          <>
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2">التاريخ والوقت</th>
                  <th className="px-4 py-2">المستخدم</th>
                  <th className="px-4 py-2">العملية</th>
                  <th className="px-4 py-2">الكيان</th>
                  <th className="px-4 py-2">المعرّف</th>
                  <th className="px-4 py-2">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                      لا توجد سجلات مطابقة
                    </td>
                  </tr>
                )}
                {query.data.items.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{new Date(log.timestamp).toLocaleString('ar-SA')}</td>
                    <td className="px-4 py-2">{log.user?.fullName ?? '—'}</td>
                    <td className="px-4 py-2">{ACTION_LABELS[log.action] ?? log.action}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{log.entity}</td>
                    <td className="px-4 py-2 text-xs text-gray-400">{log.entityId}</td>
                    <td className="px-4 py-2">
                      {log.oldValue || log.newValue ? (
                        <button onClick={() => setDetailsLog(log)} className="text-blue-600 hover:underline text-xs">
                          عرض التفاصيل
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
              <span>
                صفحة {query.data.pagination.page} من {query.data.pagination.totalPages || 1} — إجمالي{' '}
                {query.data.pagination.total} سجل
              </span>
              <div className="space-x-2 space-x-reverse">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                  السابق
                </button>
                <button
                  disabled={page >= query.data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal title="تفاصيل العملية" isOpen={!!detailsLog} onClose={() => setDetailsLog(null)}>
        {detailsLog && <AuditLogDetails log={detailsLog} />}
      </Modal>
    </div>
  );
}

/** يعرض oldValue/newValue كقائمة حقول مقارَنة، وليس JSON خامًا */
function AuditLogDetails({ log }: { log: AuditLogItem }) {
  const oldObj = log.oldValue ?? {};
  const newObj = log.newValue ?? {};
  const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));

  if (allKeys.length === 0) {
    return <p className="text-sm text-gray-400">لا توجد تفاصيل إضافية لهذه العملية</p>;
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      <div className="text-xs text-gray-500 flex justify-between border-b border-gray-100 pb-2">
        <span>
          {ACTION_LABELS[log.action] ?? log.action} — {log.entity}
        </span>
        <span>{new Date(log.timestamp).toLocaleString('ar-SA')}</span>
      </div>
      {allKeys.map((key) => {
        const before = formatValue((oldObj as Record<string, unknown>)[key]);
        const after = formatValue((newObj as Record<string, unknown>)[key]);
        const changed = before !== after;
        return (
          <div key={key} className="text-sm">
            <div className="text-xs text-gray-500 mb-1">{key}</div>
            {changed && log.action === 'update' ? (
              <div className="flex items-center gap-2">
                <span className="line-through text-red-500 bg-red-50 px-2 py-1 rounded text-xs">{before}</span>
                <span>←</span>
                <span className="text-green-700 bg-green-50 px-2 py-1 rounded text-xs">{after}</span>
              </div>
            ) : (
              <span className="bg-gray-50 px-2 py-1 rounded text-xs inline-block">{after !== '—' ? after : before}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
