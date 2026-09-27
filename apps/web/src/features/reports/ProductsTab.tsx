import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { ReportFilterBar } from './ReportFilterBar';
import { formatCurrency } from './reportsApi';

interface ProductRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string | null;
  brandName: string | null;
  quantitySold: number;
  salesValue: number;
  grossProfit: number;
  profitMarginPercent: number;
  currentStock: number;
  availableStock: number;
  inventoryValue: number;
  isBelowMinimum: boolean;
  isOutOfStock: boolean;
}
interface ProductsData {
  topSelling: ProductRow[];
  lowStock: ProductRow[];
  outOfStock: ProductRow[];
  items: ProductRow[];
}

export function ProductsTab() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, warehouseId: warehouseId || undefined };

  const query = useQuery({
    queryKey: ['reports-products', filters],
    queryFn: async () => (await apiClient.get<ProductsData>('/reports/products', { params: filters })).data,
  });

  return (
    <div>
      <ReportFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        warehouseId={warehouseId}
        onChange={(p) => {
          if (p.dateFrom !== undefined) setDateFrom(p.dateFrom);
          if (p.dateTo !== undefined) setDateTo(p.dateTo);
          if (p.warehouseId !== undefined) setWarehouseId(p.warehouseId);
        }}
        exportType="products-items"
        exportFilters={filters}
      />

      {query.isLoading && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}
      {query.isError && <p className="text-sm text-red-600">تعذّر تحميل تحليلات المنتجات</p>}
      {query.data && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2">المنتج</th>
                <th className="px-3 py-2">الفئة</th>
                <th className="px-3 py-2">الكمية المباعة</th>
                <th className="px-3 py-2">قيمة المبيعات</th>
                <th className="px-3 py-2">الربح</th>
                <th className="px-3 py-2">الهامش %</th>
                <th className="px-3 py-2">المخزون المتاح</th>
                <th className="px-3 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                    لا توجد بيانات
                  </td>
                </tr>
              )}
              {query.data.items.map((p) => (
                <tr key={p.productId} className="border-t border-gray-50">
                  <td className="px-3 py-2">
                    {p.productName} <span className="text-gray-400 text-xs">({p.productCode})</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{p.categoryName ?? '—'}</td>
                  <td className="px-3 py-2">{p.quantitySold}</td>
                  <td className="px-3 py-2">{formatCurrency(p.salesValue)}</td>
                  <td className={`px-3 py-2 ${p.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(p.grossProfit)}</td>
                  <td className="px-3 py-2">{p.profitMarginPercent.toFixed(1)}%</td>
                  <td className="px-3 py-2">{p.availableStock}</td>
                  <td className="px-3 py-2">
                    {p.isOutOfStock ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">نافد</span>
                    ) : p.isBelowMinimum ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">منخفض</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">طبيعي</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
