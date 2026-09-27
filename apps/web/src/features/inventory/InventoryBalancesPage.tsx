import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface BalanceItem {
  id: string;
  productId: string;
  quantityOnHand: string;
  reservedQuantity: string;
  availableQuantity: number;
  product: { code: string; nameAr: string };
  warehouse: { id: string; name: string };
}

interface WarehouseSetting {
  productId: string;
  warehouseId: string;
  minimumStock: number;
}

export default function InventoryBalancesPage() {
  const canView = usePermission('inventory.view');
  const [warehouseId, setWarehouseId] = useState('');

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<{ id: string; name: string }[]>('/warehouses')).data,
    enabled: canView,
  });

  const balancesQuery = useQuery({
    queryKey: ['inventory-balances', { warehouseId }],
    queryFn: async () =>
      (
        await apiClient.get<BalanceItem[]>('/inventory/balances', {
          params: { warehouseId: warehouseId || undefined },
        })
      ).data,
    enabled: canView,
  });

  // نجلب إعدادات الحد الأدنى لكل مخزن ظاهر لتحديد "منخفض" بصريًا في هذا الجدول أيضًا
  const settingsQuery = useQuery({
    queryKey: ['warehouse-product-settings-all', warehouseId],
    queryFn: async () => {
      if (!warehouseId) return [] as WarehouseSetting[];
      const { data } = await apiClient.get<WarehouseSetting[]>(`/warehouses/${warehouseId}/product-settings`);
      return data;
    },
    enabled: canView && !!warehouseId,
  });

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  const minStockByProduct = new Map<string, number>(
    (settingsQuery.data ?? []).map((s): [string, number] => [s.productId, s.minimumStock]),
  );

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">أرصدة المخزون</h1>

      <div className="mb-4">
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="input w-64">
          <option value="">كل المخازن</option>
          {warehousesQuery.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {balancesQuery.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {balancesQuery.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل الأرصدة</p>}
        {balancesQuery.data && (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">كود المنتج</th>
                <th className="px-4 py-2">اسم المنتج</th>
                <th className="px-4 py-2">المخزن</th>
                <th className="px-4 py-2">الكمية الفعلية</th>
                <th className="px-4 py-2">المحجوز</th>
                <th className="px-4 py-2">المتاح</th>
                <th className="px-4 py-2">الحد الأدنى</th>
                <th className="px-4 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {balancesQuery.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                    لا توجد أرصدة بعد
                  </td>
                </tr>
              )}
              {balancesQuery.data.map((b) => {
                const minStock = minStockByProduct.get(b.productId);
                const isLow = minStock !== undefined && b.availableQuantity <= minStock;
                return (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{b.product.code}</td>
                    <td className="px-4 py-2">{b.product.nameAr}</td>
                    <td className="px-4 py-2">{b.warehouse.name}</td>
                    <td className="px-4 py-2">{b.quantityOnHand}</td>
                    <td className="px-4 py-2">{b.reservedQuantity}</td>
                    <td className="px-4 py-2 font-medium">{b.availableQuantity}</td>
                    <td className="px-4 py-2">{minStock ?? '—'}</td>
                    <td className="px-4 py-2">
                      {isLow ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">منخفض</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">طبيعي</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
