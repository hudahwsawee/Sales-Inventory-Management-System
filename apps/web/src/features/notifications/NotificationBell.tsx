import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';

interface NotificationItem {
  id: string;
  type: string;
  titleAr: string;
  messageAr: string;
  isRead: boolean;
  createdAt: string;
  referenceType: string | null;
  referenceId: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  low_stock: 'مخزون منخفض',
  approval_needed: 'موافقة مطلوبة',
  approval_decided: 'قرار موافقة',
  credit_limit_exceeded: 'حد ائتماني',
  po_delayed: 'تأخر أمر شراء',
  order_rejected: 'رفض طلب',
};

/** يحوّل مرجع الإشعار (referenceType/referenceId) إلى رابط داخل التطبيق، إن كانت البنية الحالية تسمح بذلك */
function resolveNotificationLink(n: NotificationItem): string | null {
  if (!n.referenceType) return null;
  switch (n.referenceType) {
    case 'inventory_balance':
      return '/inventory/low-stock';
    case 'approval':
      return '/approvals';
    case 'customer':
      return '/customers';
    case 'purchase_order':
      return n.referenceId ? `/purchasing/${n.referenceId}` : '/purchasing';
    case 'sales_order':
      return n.referenceId ? `/sales/${n.referenceId}` : '/sales';
    default:
      return null;
  }
}

/**
 * NotificationBell — قائمة منسدلة في الترويسة (Step 5)، مُطوَّرة في Step 6:
 * عدّاد دقيق عبر GET /notifications/unread-count (بدل الاكتفاء بحساب طول
 * قائمة محدودة بـ100 عنصر)، تعليم الكل كمقروء، فلترة بنوع الإشعار، ورابط
 * مباشر للسجل المرتبط عند توفره — دون إنشاء أي نظام إشعارات جديد.
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const listQuery = useQuery({
    queryKey: ['notifications', typeFilter],
    queryFn: async () =>
      (await apiClient.get<NotificationItem[]>('/notifications', { params: { type: typeFilter || undefined } })).data,
    refetchInterval: 60_000, // Polling بسيط كل دقيقة — لا حاجة لـ WebSocket لهذا الحجم
  });

  const unreadCountQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => (await apiClient.get<{ count: number }>('/notifications/unread-count')).data.count,
    refetchInterval: 60_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  };

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: invalidateAll,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => apiClient.patch('/notifications/read-all'),
    onSuccess: invalidateAll,
  });

  const unreadCount = unreadCountQuery.data ?? 0;

  function handleClick(n: NotificationItem) {
    if (!n.isRead) markReadMutation.mutate(n.id);
    const link = resolveNotificationLink(n);
    if (link) {
      setIsOpen(false);
      navigate(link);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setIsOpen((v) => !v)} className="relative text-gray-500 hover:text-gray-700 px-2" aria-label="الإشعارات">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[28rem] overflow-y-auto" dir="rtl">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="font-bold text-sm">الإشعارات</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllReadMutation.mutate()} className="text-xs text-blue-600 hover:underline">
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="px-4 py-2 border-b border-gray-100">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input text-xs w-full">
              <option value="">كل الأنواع</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {(!listQuery.data || listQuery.data.length === 0) && <p className="p-4 text-sm text-gray-400">لا توجد إشعارات</p>}
          {listQuery.data?.map((n) => {
            const hasLink = !!resolveNotificationLink(n);
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`block w-full text-right px-4 py-3 text-sm border-b border-gray-50 hover:bg-gray-50 ${
                  n.isRead ? 'text-gray-500' : 'font-medium'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{n.titleAr}</span>
                  {!n.isRead && <span className="w-2 h-2 bg-blue-600 rounded-full inline-block" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">{n.messageAr}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-gray-400">{new Date(n.createdAt).toLocaleString('ar-SA')}</p>
                  {hasLink && <span className="text-[10px] text-blue-600">عرض التفاصيل ←</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
