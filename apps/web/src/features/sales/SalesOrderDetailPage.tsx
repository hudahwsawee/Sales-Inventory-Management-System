import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface SalesOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentType: 'cash' | 'credit';
  totalAmount: string;
  paidAmount: string;
  remainingBalance: number;
  customer: { name: string };
  warehouse: { name: string };
  items: {
    id: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    product: { nameAr: string; code: string };
    reservation: { status: string } | null;
  }[];
  payments: {
    id: string;
    amount: string;
    paymentDate: string;
    referenceNumber: string | null;
    paymentMethod: { nameAr: string };
  }[];
}

interface PaymentMethodItem {
  id: string;
  code: string;
  nameAr: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  approved: 'معتمد (محجوز)',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
  rejected: 'مرفوض',
};

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canManage = usePermission('sales.manage');
  const canRecordPayment = usePermission('payments.manage');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodCode, setPaymentMethodCode] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');

  const query = useQuery({
    queryKey: ['sales-order', id],
    queryFn: async () => (await apiClient.get<SalesOrderDetail>(`/sales-orders/${id}`)).data,
    enabled: !!id,
  });

  const paymentMethodsQuery = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      // لا Endpoint مخصَّص لقائمة طرق الدفع بعد — نستخدم الأكواد الأساسية
      // المعتمدة (cash/bank_transfer) مباشرة، وهي ذاتها المزروعة في Seed
      return [
        { id: 'cash', code: 'cash', nameAr: 'نقدًا' },
        { id: 'bank_transfer', code: 'bank_transfer', nameAr: 'تحويل بنكي' },
      ] as PaymentMethodItem[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sales-order', id] });
    queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
  };

  const confirmMutation = useMutation({
    mutationFn: async () => apiClient.post(`/sales-orders/${id}/confirm`),
    onSuccess: () => {
      invalidate();
      showSuccess('تم تأكيد الطلب وحجز الكمية بنجاح');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  const fulfillMutation = useMutation({
    mutationFn: async () => apiClient.post(`/sales-orders/${id}/fulfill`),
    onSuccess: () => {
      invalidate();
      showSuccess('تم تسليم الطلب وتحديث المخزون بنجاح');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => apiClient.post(`/sales-orders/${id}/cancel`, {}),
    onSuccess: () => {
      invalidate();
      showSuccess('تم إلغاء الطلب');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  const paymentMutation = useMutation({
    mutationFn: async () =>
      apiClient.post('/payments', {
        salesOrderId: id,
        paymentMethodCode,
        amount: Number(paymentAmount),
        referenceNumber: paymentRef || undefined,
      }),
    onSuccess: () => {
      invalidate();
      showSuccess('تم تسجيل الدفعة بنجاح');
      setPaymentAmount('');
      setPaymentRef('');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  if (query.isLoading) return <p className="text-sm text-gray-500">جارٍ التحميل...</p>;
  if (query.isError || !query.data) return <p className="text-sm text-red-600">تعذّر تحميل الطلب</p>;

  const order = query.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold">أمر البيع {order.orderNumber}</h1>
          <p className="text-sm text-gray-500">
            {order.customer.name} — {order.warehouse.name}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && order.status === 'draft' && (
            <button
              onClick={() => confirmMutation.mutate()}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              تأكيد وحجز
            </button>
          )}
          {canManage && order.status === 'approved' && (
            <button
              onClick={() => fulfillMutation.mutate()}
              className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
            >
              تسليم
            </button>
          )}
          {canManage && ['draft', 'approved'].includes(order.status) && (
            <button
              onClick={() => cancelMutation.mutate()}
              className="border border-red-300 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 text-sm flex flex-wrap gap-6">
        <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
        <span>الإجمالي: <strong>{order.totalAmount}</strong></span>
        <span>المدفوع: <strong>{order.paidAmount}</strong></span>
        <span className={order.remainingBalance > 0 ? 'text-orange-600 font-bold' : ''}>
          المتبقي: {order.remainingBalance}
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
              <th className="px-4 py-2">الإجمالي</th>
              <th className="px-4 py-2">حالة الحجز</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  {item.product.nameAr} <span className="text-gray-400 text-xs">({item.product.code})</span>
                </td>
                <td className="px-4 py-2">{item.quantity}</td>
                <td className="px-4 py-2">{item.unitPrice}</td>
                <td className="px-4 py-2">{item.lineTotal}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{item.reservation?.status ?? 'لا يوجد بعد'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">المدفوعات</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        {order.payments.length === 0 ? (
          <p className="p-4 text-sm text-gray-400">لا توجد دفعات مسجَّلة بعد</p>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">التاريخ</th>
                <th className="px-4 py-2">المبلغ</th>
                <th className="px-4 py-2">الطريقة</th>
                <th className="px-4 py-2">المرجع</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{new Date(p.paymentDate).toLocaleString('ar-SA')}</td>
                  <td className="px-4 py-2">{p.amount}</td>
                  <td className="px-4 py-2">{p.paymentMethod.nameAr}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{p.referenceNumber ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canRecordPayment && ['approved', 'delivered'].includes(order.status) && order.remainingBalance > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 max-w-md">
          <h3 className="text-sm font-bold mb-3">تسجيل دفعة جديدة</h3>
          <div className="space-y-3">
            <input
              type="number"
              step="any"
              placeholder={`المبلغ (المتبقي: ${order.remainingBalance})`}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="input"
            />
            <select value={paymentMethodCode} onChange={(e) => setPaymentMethodCode(e.target.value)} className="input">
              {paymentMethodsQuery.data?.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.nameAr}
                </option>
              ))}
            </select>
            <input
              placeholder="رقم مرجعي (اختياري)"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              className="input"
            />
            <button
              onClick={() => paymentMutation.mutate()}
              disabled={paymentMutation.isPending || !paymentAmount}
              className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {paymentMutation.isPending ? 'جارٍ التسجيل...' : 'تسجيل الدفعة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
