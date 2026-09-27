import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  supplier: { name: string };
  warehouse: { name: string };
  items: {
    id: string;
    quantityOrdered: string;
    quantityReceived: string;
    unitPrice: string;
    product: { nameAr: string; code: string };
  }[];
  receipts: {
    id: string;
    receiptNumber: string;
    receiptDate: string;
    isPartial: boolean;
    items: { quantityReceived: string; unitCost: string }[];
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending: 'قيد الانتظار',
  partially_received: 'مستلم جزئيًا',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canManage = usePermission('purchasing.manage');
  const canReceive = usePermission('receiving.manage');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => (await apiClient.get<PurchaseOrderDetail>(`/purchase-orders/${id}`)).data,
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => apiClient.post(`/purchase-orders/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      showSuccess('تم إلغاء أمر الشراء');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  if (query.isLoading) return <p className="text-sm text-gray-500">جارٍ التحميل...</p>;
  if (query.isError || !query.data) return <p className="text-sm text-red-600">تعذّر تحميل أمر الشراء</p>;

  const po = query.data;
  const canCancel = canManage && ['draft', 'pending'].includes(po.status);
  const canGoReceive = canReceive && !['completed', 'cancelled'].includes(po.status);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold">أمر الشراء {po.poNumber}</h1>
          <p className="text-sm text-gray-500">
            {po.supplier.name} — {po.warehouse.name}
          </p>
        </div>
        <div className="flex gap-2">
          {canGoReceive && (
            <Link
              to={`/receiving/${po.id}`}
              className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
            >
              استلام
            </Link>
          )}
          {canCancel && (
            <button
              onClick={() => cancelMutation.mutate()}
              className="border border-red-300 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50"
            >
              إلغاء الأمر
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 text-sm">
        <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
          {STATUS_LABELS[po.status] ?? po.status}
        </span>
        {po.expectedDeliveryDate && (
          <span className="mr-4 text-gray-500">
            التوريد المتوقع: {new Date(po.expectedDeliveryDate).toLocaleDateString('ar-SA')}
          </span>
        )}
        {po.notes && <p className="mt-2 text-gray-600">ملاحظات: {po.notes}</p>}
      </div>

      <h2 className="text-sm font-bold mb-2">البنود</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2">المنتج</th>
              <th className="px-4 py-2">سعر الوحدة</th>
              <th className="px-4 py-2">المطلوب</th>
              <th className="px-4 py-2">المستلم</th>
              <th className="px-4 py-2">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item) => {
              const remaining = Number(item.quantityOrdered) - Number(item.quantityReceived);
              return (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {item.product.nameAr} <span className="text-gray-400 text-xs">({item.product.code})</span>
                  </td>
                  <td className="px-4 py-2">{item.unitPrice}</td>
                  <td className="px-4 py-2">{item.quantityOrdered}</td>
                  <td className="px-4 py-2">{item.quantityReceived}</td>
                  <td className={`px-4 py-2 ${remaining > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}`}>
                    {remaining}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">سجل الاستلامات</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {po.receipts.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">لم يتم أي استلام بعد</p>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">رقم الإيصال</th>
                <th className="px-4 py-2">التاريخ</th>
                <th className="px-4 py-2">عدد البنود</th>
                <th className="px-4 py-2">النوع</th>
              </tr>
            </thead>
            <tbody>
              {po.receipts.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.receiptNumber}</td>
                  <td className="px-4 py-2">{new Date(r.receiptDate).toLocaleString('ar-SA')}</td>
                  <td className="px-4 py-2">{r.items.length}</td>
                  <td className="px-4 py-2">{r.isPartial ? 'جزئي' : 'مكتمل'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
