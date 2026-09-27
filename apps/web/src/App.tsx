import { Routes, Route } from 'react-router-dom';
import LoginPage from './features/auth/LoginPage';
import HomePage from './features/home/HomePage';
import UsersPage from './features/users/UsersPage';
import CategoriesPage from './features/catalog/CategoriesPage';
import BrandsPage from './features/catalog/BrandsPage';
import UnitsPage from './features/catalog/UnitsPage';
import ProductsPage from './features/catalog/ProductsPage';
import SuppliersPage from './features/suppliers/SuppliersPage';
import WarehousesPage from './features/warehouses/WarehousesPage';
import PurchaseOrdersPage from './features/purchasing/PurchaseOrdersPage';
import CreatePurchaseOrderPage from './features/purchasing/CreatePurchaseOrderPage';
import PurchaseOrderDetailPage from './features/purchasing/PurchaseOrderDetailPage';
import PurchaseOrdersOverduePage from './features/purchasing/PurchaseOrdersOverduePage';
import ReceivingPage from './features/purchasing/ReceivingPage';
import InventoryBalancesPage from './features/inventory/InventoryBalancesPage';
import InventoryTransactionsPage from './features/inventory/InventoryTransactionsPage';
import InventoryLowStockPage from './features/inventory/InventoryLowStockPage';
import InventoryAdjustmentsPage from './features/inventory/InventoryAdjustmentsPage';
import CustomersPage from './features/customers/CustomersPage';
import SalesOrdersPage from './features/sales/SalesOrdersPage';
import CreateSalesOrderPage from './features/sales/CreateSalesOrderPage';
import SalesOrderDetailPage from './features/sales/SalesOrderDetailPage';
import ReturnsPage from './features/returns/ReturnsPage';
import CreateReturnPage from './features/returns/CreateReturnPage';
import ReturnDetailPage from './features/returns/ReturnDetailPage';
import ApprovalsPage from './features/approvals/ApprovalsPage';
import AuditLogPage from './features/audit/AuditLogPage';
import ReportsPage from './features/reports/ReportsPage';
import { ProtectedRoute } from './shared/components/ProtectedRoute';
import { AppLayout } from './shared/components/AppLayout';

/**
 * App — جذر المسارات.
 * Foundation: /login (عام) + / و/users (محميان).
 * Step 2: الكتالوج والموردين والمخازن. Step 3: المشتريات والمخزون.
 * Step 4: العملاء وأوامر البيع (Draft → confirm → fulfill/cancel) والمدفوعات
 * (مدمجة داخل صفحة تفاصيل أمر البيع). مسارات Dashboard ستُضاف لاحقًا.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/units" element={<UnitsPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/warehouses" element={<WarehousesPage />} />

          <Route path="/purchasing" element={<PurchaseOrdersPage />} />
          <Route path="/purchasing/new" element={<CreatePurchaseOrderPage />} />
          <Route path="/purchasing/overdue" element={<PurchaseOrdersOverduePage />} />
          <Route path="/purchasing/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="/receiving/:poId" element={<ReceivingPage />} />

          <Route path="/inventory/balances" element={<InventoryBalancesPage />} />
          <Route path="/inventory/transactions" element={<InventoryTransactionsPage />} />
          <Route path="/inventory/low-stock" element={<InventoryLowStockPage />} />
          <Route path="/inventory/adjustments" element={<InventoryAdjustmentsPage />} />

          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/sales" element={<SalesOrdersPage />} />
          <Route path="/sales/new" element={<CreateSalesOrderPage />} />
          <Route path="/sales/:id" element={<SalesOrderDetailPage />} />

          <Route path="/returns" element={<ReturnsPage />} />
          <Route path="/returns/new" element={<CreateReturnPage />} />
          <Route path="/returns/:id" element={<ReturnDetailPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/audit-logs" element={<AuditLogPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
