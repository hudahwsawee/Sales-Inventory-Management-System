import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface ReturnDetail {
  id: string;
  returnNumber: string;
  returnType: 'customer_return' | 'supplier_return';
  status: string;
  returnDate: string;
  customer: { name: string } | null;
  supplier: { name: string } | null;
  warehouse: { name: string };
  referenceSalesOrder: { id: string; orderNumber: string } | null;
  referencePurchaseOrder: { id: string; poNumber: string } | null;
  items: { id: string; quantity: string; unitPrice: string; reason: string | null; product: { nameAr: string; code: string } }[];
  approvals: { id: string; status: string; reason: string | null; requestedAt: string; decidedAt: string | null }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  approved: 'معتمد',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canManage = usePermission('returns.manage');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['return', id],
    queryFn: async () => (await apiClient.get<ReturnDetail>(`/returns/${id}`)).data,
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['return', id] });
    queryClient.invalidateQueries({ queryKey: ['returns'] });
  };

  const submitMutation = useMutation({
    mutationFn: async () => apiClient.post(`/returns/${id}/submit`),
    onSuccess: () => {
      invalidate();
      showSuccess('تم تقديم المرتجع للموافقة');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  const completeMutation = useMutation({
    mutationFn: async () => apiClient.post(`/returns/${id}/complete`),
    onSuccess: () => {
      invalidate();
      showSuccess('تم إتمام المرتجع وتحديث المخزون بنجاح');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => apiClient.post(`/returns/${id}/cancel`),
    onSuccess: () => {
      invalidate();
      showSuccess('تم إلغاء المرتجع');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  if (query.isLoading) return <p className="text-sm text-gray-500">جارٍ التحميل...</p>;
  if (query.isError || !query.data) return <p className="text-sm text-red-600">تعذّر تحميل المرتجع</p>;

  const ret = query.data;
  const inventoryEffectLabel =
    ret.returnType === 'customer_return' ? 'زيادة المخزون (عودة بضاعة من العميل)' : 'نقص المخزون (إعادة بضاعة للمورد)';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold">مرتجع {ret.returnNumber}</h1>
          <p className="text-sm text-gray-500">
            {ret.returnType === 'customer_return' ? 'مرتجع عميل' : 'مرتجع مورد'} —{' '}
            {ret.customer?.name ?? ret.supplier?.name} — {ret.warehouse.name}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && ret.status === 'draft' && (
            <button onClick={() => submitMutation.mutate()} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
              تقديم للموافقة
            </button>
          )}
          {canManage && ret.status === 'approved' && (
            <button onClick={() => completeMutation.mutate()} className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700">
              إتمام المرتجع
            </button>
          )}
          {canManage && ['draft', 'pending_approval', 'approved'].includes(ret.status) && (
            <button onClick={() => cancelMutation.mutate()} className="border border-red-300 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50">
              إلغاء
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 text-sm flex flex-wrap gap-6 items-center">
        <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">{STATUS_LABELS[ret.status] ?? ret.status}</span>
        <span className="text-gray-600">
          المرجع الأصلي: <strong>{ret.referenceSalesOrder?.orderNumber ?? ret.referencePurchaseOrder?.poNumber ?? '—'}</strong>
        </span>
        <span className="text-gray-500 text-xs">
          الأثر على المخزون عند الإتمام: {inventoryEffectLabel}
          {ret.status !== 'completed' && ' (لم يُطبَّق بعد)'}
        </span>
      </div>

      <h2 className="text-sm font-bold mb-2">البنود</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2">المنتج</th>
              <th className="px-4 py-2">الكمية</th>
              <th className="px-4 py-2">سعر الوحدة</th>
              <th className="px-4 py-2">السبب</th>
            </tr>
          </thead>
          <tbody>
            {ret.items.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  {item.product.nameAr} <span className="text-gray-400 text-xs">({item.product.code})</span>
                </td>
                <td className="px-4 py-2">{item.quantity}</td>
                <td className="px-4 py-2">{item.unitPrice}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{item.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">سجل الموافقات</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {ret.approvals.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">لم يُقدَّم هذا المرتجع للموافقة بعد</p>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">تاريخ الطلب</th>
                <th className="px-4 py-2">الحالة</th>
                <th className="px-4 py-2">تاريخ القرار</th>
                <th className="px-4 py-2">السبب</th>
              </tr>
            </thead>
            <tbody>
              {ret.approvals.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{new Date(a.requestedAt).toLocaleString('ar-SA')}</td>
                  <td className="px-4 py-2">{a.status}</td>
                  <td className="px-4 py-2">{a.decidedAt ? new Date(a.decidedAt).toLocaleString('ar-SA') : '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{a.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
