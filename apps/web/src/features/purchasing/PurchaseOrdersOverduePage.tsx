import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface OverduePurchaseOrder {
  id: string;
  poNumber: string;
  expectedDeliveryDate: string;
  daysLate: number;
  supplier: { name: string };
  warehouse: { name: string };
}

/**
 * PurchaseOrdersOverduePage — Step 6 (Purchase Order Delay Alerts).
 * قراءة مباشرة من GET /purchase-orders/overdue (بلا صفحات — قائمة أوامر
 * الشراء المفتوحة المتأخرة عادة صغيرة العدد، لا تحتاج Pagination).
 */
export default function PurchaseOrdersOverduePage() {
  const canView = usePermission('purchasing.view');

  const query = useQuery({
    queryKey: ['purchase-orders-overdue'],
    queryFn: async () => (await apiClient.get<OverduePurchaseOrder[]>('/purchase-orders/overdue')).data,
    enabled: canView,
  });

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <h1 className="text-lg font-bold mb-1">أوامر الشراء المتأخرة</h1>
      <p className="text-sm text-gray-500 mb-4">أوامر الشراء المفتوحة (لم تكتمل أو تُلغَ) التي تجاوزت تاريخ التوريد المتوقع.</p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {query.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {query.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل البيانات</p>}
        {query.data && (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">رقم أمر الشراء</th>
                <th className="px-4 py-2">المورد</th>
                <th className="px-4 py-2">المخزن</th>
                <th className="px-4 py-2">تاريخ التوريد المتوقع</th>
                <th className="px-4 py-2">أيام التأخير</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {query.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    لا توجد أوامر شراء متأخرة حاليًا 🎉
                  </td>
                </tr>
              )}
              {query.data.map((po) => (
                <tr key={po.id} className="border-t border-gray-100 bg-purple-50/40">
                  <td className="px-4 py-2 font-medium">{po.poNumber}</td>
                  <td className="px-4 py-2">{po.supplier.name}</td>
                  <td className="px-4 py-2">{po.warehouse.name}</td>
                  <td className="px-4 py-2">{new Date(po.expectedDeliveryDate).toLocaleDateString('ar-SA')}</td>
                  <td className="px-4 py-2 text-purple-700 font-bold">{po.daysLate} يوم</td>
                  <td className="px-4 py-2">
                    <Link to={`/purchasing/${po.id}`} className="text-blue-600 hover:underline text-xs">
                      التفاصيل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
