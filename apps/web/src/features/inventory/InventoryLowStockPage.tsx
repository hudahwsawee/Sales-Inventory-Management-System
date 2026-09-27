import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface LowStockItem {
  product: { code: string; nameAr: string };
  warehouse: { id: string; name: string };
  quantityOnHand: number;
  availableQuantity: number;
  minimumStock: number;
  reorderLevel: number | null;
}

export default function InventoryLowStockPage() {
  const canView = usePermission('inventory.view');
  const [warehouseId, setWarehouseId] = useState('');

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<{ id: string; name: string }[]>('/warehouses')).data,
    enabled: canView,
  });

  const lowStockQuery = useQuery({
    queryKey: ['inventory-low-stock', warehouseId],
    queryFn: async () =>
      (
        await apiClient.get<LowStockItem[]>('/inventory/low-stock', {
          params: { warehouse_id: warehouseId || undefined },
        })
      ).data,
    enabled: canView,
  });

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <h1 className="text-lg font-bold mb-1">المخزون المنخفض</h1>
      <p className="text-sm text-gray-500 mb-4">
        القاعدة المعتمدة (مُحدَّثة): يظهر المنتج هنا عندما تكون <strong>الكمية المتاحة</strong> (الفعلية
        ناقص المحجوز للطلبات الأخرى) أقل من أو تساوي الحد الأدنى المحدَّد له في هذا المخزن.
      </p>

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
        {lowStockQuery.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {lowStockQuery.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل البيانات</p>}
        {lowStockQuery.data && (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">كود المنتج</th>
                <th className="px-4 py-2">اسم المنتج</th>
                <th className="px-4 py-2">المخزن</th>
                <th className="px-4 py-2">الكمية الفعلية</th>
                <th className="px-4 py-2">المتاح</th>
                <th className="px-4 py-2">الحد الأدنى</th>
                <th className="px-4 py-2">نقطة إعادة الطلب</th>
              </tr>
            </thead>
            <tbody>
              {lowStockQuery.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    لا توجد منتجات دون الحد الأدنى حاليًا 🎉
                  </td>
                </tr>
              )}
              {lowStockQuery.data.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-100 bg-red-50/40">
                  <td className="px-4 py-2">{row.product.code}</td>
                  <td className="px-4 py-2 font-medium">{row.product.nameAr}</td>
                  <td className="px-4 py-2">{row.warehouse.name}</td>
                  <td className="px-4 py-2">{row.quantityOnHand}</td>
                  <td className="px-4 py-2 text-red-700 font-bold">{row.availableQuantity}</td>
                  <td className="px-4 py-2">{row.minimumStock}</td>
                  <td className="px-4 py-2">{row.reorderLevel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
