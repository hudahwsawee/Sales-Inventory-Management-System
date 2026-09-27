import { z } from 'zod';
import { SimpleCrudPage } from '../../shared/components/SimpleCrudPage';

const warehouseSchema = z.object({
  name: z.string().min(1, 'اسم المخزن مطلوب'),
  code: z.string().min(1, 'كود المخزن مطلوب'),
  address: z.string().optional(),
});

interface WarehouseItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean;
}

/**
 * ملاحظة نطاق: تغطي هذه الشاشة إدارة المخازن نفسها فقط. شاشة ضبط "الحد
 * الأدنى لكل منتج" (`/warehouses/:id/product-settings`) لم تُبنَ هنا
 * عمدًا — الـAPI (GET/PUT) جاهز في الـBackend، لكن واجهته (اختيار منتجات
 * متعددة دفعة واحدة) تحتاج تصميم UX خاص يتجاوز نطاق هذه الخطوة، ويُفضَّل
 * بناؤه لاحقًا كشاشة/تبويب منفصل مرتبط بشاشة Inventory عند بنائها.
 */
export default function WarehousesPage() {
  return (
    <SimpleCrudPage<WarehouseItem>
      title="المخازن"
      resourcePath="/warehouses"
      queryKey="warehouses"
      viewPermission="warehouses.view"
      managePermission="warehouses.manage"
      entityLabelForMessages="المخزن"
      columns={[
        { key: 'name', label: 'الاسم' },
        { key: 'code', label: 'الكود' },
        { key: 'address', label: 'العنوان', render: (item) => item.address ?? '—' },
      ]}
      fields={[
        { name: 'name', label: 'اسم المخزن', type: 'text' },
        { name: 'code', label: 'كود المخزن', type: 'text' },
        { name: 'address', label: 'العنوان (اختياري)', type: 'textarea' },
      ]}
      schema={warehouseSchema}
      defaultValues={{ name: '', code: '', address: '' }}
    />
  );
}
