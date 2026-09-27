import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { Modal } from '../../shared/components/Modal';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface ApprovalItem {
  id: string;
  approvalType: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  requester: { fullName: string };
  return: { id: string; returnNumber: string; returnType: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  discount_exceeded: 'تجاوز خصم',
  credit_limit_exceeded: 'تجاوز حد ائتماني',
  return_approval: 'موافقة على مرتجع',
};

export default function ApprovalsPage() {
  const canView = usePermission('approvals.view');
  const canDecide = usePermission('approvals.decide');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('pending');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [reason, setReason] = useState('');

  const query = useQuery({
    queryKey: ['approvals', statusFilter],
    queryFn: async () => (await apiClient.get<ApprovalItem[]>('/approvals', { params: { status: statusFilter || undefined } })).data,
    enabled: canView,
  });

  const decideMutation = useMutation({
    mutationFn: async () => apiClient.post(`/approvals/${decidingId}/decide`, { decision, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      showSuccess(decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
      setDecidingId(null);
      setReason('');
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  function openDecideModal(id: string, initialDecision: 'approved' | 'rejected') {
    setDecidingId(id);
    setDecision(initialDecision);
    setReason('');
  }

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">الموافقات</h1>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-56 mb-4">
        <option value="pending">بانتظار القرار</option>
        <option value="approved">مقبولة</option>
        <option value="rejected">مرفوضة</option>
        <option value="">الكل</option>
      </select>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {query.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل طلبات الموافقة</p>}
        {query.data && (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">النوع</th>
                <th className="px-4 py-2">المرجع</th>
                <th className="px-4 py-2">مقدِّم الطلب</th>
                <th className="px-4 py-2">التاريخ</th>
                {canDecide && <th className="px-4 py-2">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {query.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    لا توجد طلبات موافقة مطابقة
                  </td>
                </tr>
              )}
              {query.data.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{TYPE_LABELS[a.approvalType] ?? a.approvalType}</td>
                  <td className="px-4 py-2">
                    {a.return ? (
                      <Link to={`/returns/${a.return.id}`} className="text-blue-600 hover:underline">
                        {a.return.returnNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2">{a.requester.fullName}</td>
                  <td className="px-4 py-2">{new Date(a.requestedAt).toLocaleString('ar-SA')}</td>
                  {canDecide && (
                    <td className="px-4 py-2 space-x-2 space-x-reverse">
                      {a.status === 'pending' ? (
                        <>
                          <button onClick={() => openDecideModal(a.id, 'approved')} className="text-green-600 hover:underline text-xs">
                            موافقة
                          </button>
                          <button onClick={() => openDecideModal(a.id, 'rejected')} className="text-red-600 hover:underline text-xs">
                            رفض
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">تم القرار</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal title={decision === 'approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض'} isOpen={!!decidingId} onClose={() => setDecidingId(null)}>
        <div className="space-y-4">
          {decision === 'rejected' && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">سبب الرفض (إلزامي)</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input" rows={3} />
            </div>
          )}
          <button
            onClick={() => decideMutation.mutate()}
            disabled={decideMutation.isPending || (decision === 'rejected' && !reason.trim())}
            className={`w-full text-white text-sm py-2 rounded-lg disabled:opacity-50 ${
              decision === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {decideMutation.isPending ? 'جارٍ التنفيذ...' : decision === 'approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
