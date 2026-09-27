import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { BarcodeCapture } from '../../shared/components/BarcodeCapture';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface PurchaseOrderItem {
  id: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitPrice: string;
  product: { id: string; nameAr: string; code: string; barcode: string | null };
}

interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  status: string;
  items: PurchaseOrderItem[];
}

interface LineInput {
  quantityReceived: string;
  unitCost: string;
}

/**
 * ط´ط§ط´ط© ط§ظ„ط§ط³طھظ„ط§ظ… â€” طھط·ط¨ظ‘ظ‚ طھط¯ظپظ‚ UX ط§ظ„ظ…ط·ظ„ظˆط¨ ط­ط±ظپظٹظ‹ط§:
 * ط§ط®طھظٹط§ط± ط£ظ…ط± ط§ظ„ط´ط±ط§ط، (ط¹ط¨ط± ظ…ط³ط§ط± ط§ظ„طµظپط­ط©) â†’ ط¹ط±ط¶ ط§ظ„ط¨ظ†ظˆط¯ ط§ظ„ظ…طھط¨ظ‚ظٹط© â†’ ظ…ط³ط­
 * ط§ظ„ط¨ط§ط±ظƒظˆط¯ ط£ظˆ ط§ظ„ط¨ط­ط« ط§ظ„ظٹط¯ظˆظٹ â†’ ط¥ط¯ط®ط§ظ„ ط§ظ„ظƒظ…ظٹط© ظˆط§ظ„طھظƒظ„ظپط© ط§ظ„ظپط¹ظ„ظٹطھظٹظ† â†’ طھط£ظƒظٹط¯.
 * ظٹظ…ظ†ط¹ ط¥ط¯ط®ط§ظ„ ظƒظ…ظٹط© ط£ظƒط¨ط± ظ…ظ† ط§ظ„ظ…طھط¨ظ‚ظٹ ط¹ظ„ظ‰ ظ…ط³طھظˆظ‰ ط§ظ„ظˆط§ط¬ظ‡ط© (ظˆط§ظ„ظ€Backend ظ‡ظˆ
 * ط§ظ„ط­ط§ط±ط³ ط§ظ„ظپط¹ظ„ظٹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ ظƒط§ظ„ظ…ط¹طھط§ط¯).
 */
export default function ReceivingPage() {
  const { poId } = useParams<{ poId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const [lineInputs, setLineInputs] = useState<Record<string, LineInput>>({});
  const [notes, setNotes] = useState('');

  const poQuery = useQuery({
    queryKey: ['purchase-order', poId],
    queryFn: async () => (await apiClient.get<PurchaseOrderDetail>(`/purchase-orders/${poId}`)).data,
    enabled: !!poId,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const items = (Object.entries(lineInputs) as [string, LineInput][])
        .filter(([, v]) => Number(v.quantityReceived) > 0)
        .map(([purchaseOrderItemId, v]) => ({
          purchaseOrderItemId,
          quantityReceived: Number(v.quantityReceived),
          unitCost: v.unitCost !== '' ? Number(v.unitCost) : undefined,
        }));

      if (items.length === 0) {
        throw new Error('NO_LINES');
      }

      const { data } = await apiClient.post('/purchase-receipts', {
        purchaseOrderId: poId,
        notes: notes || undefined,
        items,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      showSuccess('طھظ… طھط£ظƒظٹط¯ ط§ظ„ط§ط³طھظ„ط§ظ… ط¨ظ†ط¬ط§ط­');
      navigate(`/purchasing/${poId}`);
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'NO_LINES') {
        showError('ط£ط¯ط®ظ„ ظƒظ…ظٹط© ط§ط³طھظ„ط§ظ… ظ„ط¨ظ†ط¯ ظˆط§ط­ط¯ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„');
      } else {
        showError(extractErrorMessage(error));
      }
    },
  });

  const updateLine = useCallback((itemId: string, patch: Partial<LineInput>) => {
    setLineInputs((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { quantityReceived: '', unitCost: '' }), ...patch },
    }));
  }, []);

  const handleScan = useCallback(
    async (barcode: string) => {
      if (!poQuery.data) return;
      try {
        const { data: product } = await apiClient.get<{ id: string }>(`/products/barcode/${barcode}`);
        const item = poQuery.data.items.find((i) => i.product.id === product.id);
        if (!item) {
          showError('ط§ظ„ظ…ظ†طھط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯ ظپظٹ ط£ظ…ط± ط§ظ„ط´ط±ط§ط،');
          return;
        }
        const remaining = Number(item.quantityOrdered) - Number(item.quantityReceived);
        const current = Number(lineInputs[item.id]?.quantityReceived || 0);
        const next = Math.min(current + 1, remaining);
        updateLine(item.id, { quantityReceived: String(next) });
      } catch {
        showError('ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ…ظ†طھط¬ ط¨ظ‡ط°ط§ ط§ظ„ط¨ط§ط±ظƒظˆط¯');
      }
    },
    [poQuery.data, lineInputs, updateLine, showError],
  );

  if (poQuery.isLoading) return <p className="text-sm text-gray-500">ط¬ط§ط±ظچ ط§ظ„طھط­ظ…ظٹظ„...</p>;
  if (poQuery.isError || !poQuery.data) return <p className="text-sm text-red-600">طھط¹ط°ظ‘ط± طھط­ظ…ظٹظ„ ط£ظ…ط± ط§ظ„ط´ط±ط§ط،</p>;

  const po = poQuery.data;
  const outstandingItems = po.items.filter(
    (i) => Number(i.quantityOrdered) - Number(i.quantityReceived) > 0,
  );

  if (['completed', 'cancelled'].includes(po.status)) {
    return <p className="text-sm text-gray-500">ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ظ‡ط°ط§ ظ…ط؛ظ„ظ‚ ظˆظ„ط§ ظٹظ‚ط¨ظ„ ط§ط³طھظ„ط§ظ…ظ‹ط§ ط¬ط¯ظٹط¯ظ‹ط§.</p>;
  }

  return (
    <div>
      <BarcodeCapture onScan={handleScan} />

      <h1 className="text-lg font-bold mb-1">ط§ط³طھظ„ط§ظ… â€” ط£ظ…ط± ط§ظ„ط´ط±ط§ط، {po.poNumber}</h1>
      <p className="text-sm text-gray-500 mb-4">
        ط§ظ…ط³ط­ ط¨ط§ط±ظƒظˆط¯ ط§ظ„ظ…ظ†طھط¬ ط¨ط£ظٹ ظ‚ط§ط±ط¦ ظ…طھطµظ„طŒ ط£ظˆ ط£ط¯ط®ظ„ ط§ظ„ظƒظ…ظٹط© ظٹط¯ظˆظٹظ‹ط§ ظپظٹ ط§ظ„ط¬ط¯ظˆظ„ ط£ط¯ظ†ط§ظ‡.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2">ط§ظ„ظ…ظ†طھط¬</th>
              <th className="px-4 py-2">ط§ظ„ظ…ط·ظ„ظˆط¨</th>
              <th className="px-4 py-2">ظ…ط³طھظ„ظ… ط³ط§ط¨ظ‚ظ‹ط§</th>
              <th className="px-4 py-2">ط§ظ„ظ…طھط¨ظ‚ظٹ</th>
              <th className="px-4 py-2">ط§ظ„ط§ط³طھظ„ط§ظ… ط§ظ„ط¢ظ†</th>
              <th className="px-4 py-2">طھظƒظ„ظپط© ط§ظ„ظˆط­ط¯ط© ط§ظ„ظپط¹ظ„ظٹط©</th>
            </tr>
          </thead>
          <tbody>
            {outstandingItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  ظ„ط§ طھظˆط¬ط¯ ط¨ظ†ظˆط¯ ظ…طھط¨ظ‚ظٹط© â€” ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ظ…ظƒطھظ…ظ„ ط§ظ„ط§ط³طھظ„ط§ظ…
                </td>
              </tr>
            )}
            {outstandingItems.map((item) => {
              const remaining = Number(item.quantityOrdered) - Number(item.quantityReceived);
              const currentInput = lineInputs[item.id]?.quantityReceived ?? '';
              const exceeds = Number(currentInput) > remaining;

              return (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {item.product.nameAr} <span className="text-gray-400 text-xs">({item.product.code})</span>
                  </td>
                  <td className="px-4 py-2">{item.quantityOrdered}</td>
                  <td className="px-4 py-2">{item.quantityReceived}</td>
                  <td className="px-4 py-2 text-orange-600 font-medium">{remaining}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={remaining}
                      value={currentInput}
                      onChange={(e) => updateLine(item.id, { quantityReceived: e.target.value })}
                      className={`input w-24 ${exceeds ? 'border-red-500' : ''}`}
                    />
                    {exceeds && (
                      <p className="text-xs text-red-600 mt-1">ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…ط³طھظ„ظ…ط© ط£ظƒط¨ط± ظ…ظ† ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…طھط¨ظ‚ظٹط©</p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="any"
                      placeholder={item.unitPrice}
                      value={lineInputs[item.id]?.unitCost ?? ''}
                      onChange={(e) => updateLine(item.id, { unitCost: e.target.value })}
                      className="input w-28"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-700 mb-1">ظ…ظ„ط§ط­ط¸ط§طھ ط¹ظ„ظ‰ ط§ظ„ط§ط³طھظ„ط§ظ… (ط§ط®طھظٹط§ط±ظٹ)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
      </div>

      <button
        onClick={() => confirmMutation.mutate()}
        disabled={confirmMutation.isPending || outstandingItems.length === 0}
        className="bg-green-600 text-white text-sm px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {confirmMutation.isPending ? 'ط¬ط§ط±ظچ ط§ظ„طھط£ظƒظٹط¯...' : 'طھط£ظƒظٹط¯ ط§ظ„ط§ط³طھظ„ط§ظ…'}
      </button>
    </div>
  );
}

