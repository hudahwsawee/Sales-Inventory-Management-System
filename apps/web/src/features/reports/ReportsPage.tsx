import { useState } from 'react';
import { usePermission } from '../../shared/permissions/usePermission';
import { OverviewTab } from './OverviewTab';
import { SalesTab } from './SalesTab';
import { ProfitTab } from './ProfitTab';
import { InventoryTab } from './InventoryTab';
import { PurchasesTab } from './PurchasesTab';
import { CustomersTab } from './CustomersTab';
import { SuppliersTab } from './SuppliersTab';
import { ProductsTab } from './ProductsTab';

type TabKey = 'overview' | 'sales' | 'profit' | 'inventory' | 'purchases' | 'customers' | 'suppliers' | 'products';

/**
 * ReportsPage — مركز تقارير واحد بتبويبات (وليس 8 صفحات منفصلة، تطبيقًا
 * حرفيًا لتوصية Step 7 §4: "Do not create unnecessary separate pages if
 * tabs/subsections provide a better maintainable architecture"). كل
 * تبويب محمي بصلاحيته الخاصة (RequirePermission على مستوى Backend هو
 * الحماية الفعلية دائمًا؛ الإخفاء هنا تحسين تجربة استخدام فقط).
 */
export default function ReportsPage() {
  const permissions: Record<TabKey, string> = {
    overview: 'reports.view',
    sales: 'reports.sales',
    profit: 'reports.profit',
    inventory: 'reports.inventory',
    purchases: 'reports.purchases',
    customers: 'reports.customers',
    suppliers: 'reports.suppliers',
    products: 'reports.products',
  };

  const labels: Record<TabKey, string> = {
    overview: 'نظرة عامة',
    sales: 'المبيعات',
    profit: 'الأرباح',
    inventory: 'المخزون',
    purchases: 'المشتريات',
    customers: 'العملاء',
    suppliers: 'الموردين',
    products: 'المنتجات',
  };

  const canView: Record<TabKey, boolean> = {
    overview: usePermission(permissions.overview),
    sales: usePermission(permissions.sales),
    profit: usePermission(permissions.profit),
    inventory: usePermission(permissions.inventory),
    purchases: usePermission(permissions.purchases),
    customers: usePermission(permissions.customers),
    suppliers: usePermission(permissions.suppliers),
    products: usePermission(permissions.products),
  };

  const availableTabs = (Object.keys(labels) as TabKey[]).filter((t) => canView[t]);
  const [activeTab, setActiveTab] = useState<TabKey>(availableTabs[0] ?? 'overview');
  const currentTab: TabKey = canView[activeTab] ? activeTab : availableTabs[0];

  if (availableTabs.length === 0) {
    return <p className="text-sm text-gray-500">لا تملك صلاحية عرض أي تقرير حاليًا.</p>;
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">التقارير والتحليلات</h1>

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
              currentTab === tab ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>

      {currentTab === 'overview' && <OverviewTab />}
      {currentTab === 'sales' && <SalesTab />}
      {currentTab === 'profit' && <ProfitTab />}
      {currentTab === 'inventory' && <InventoryTab />}
      {currentTab === 'purchases' && <PurchasesTab />}
      {currentTab === 'customers' && <CustomersTab />}
      {currentTab === 'suppliers' && <SuppliersTab />}
      {currentTab === 'products' && <ProductsTab />}
    </div>
  );
}
