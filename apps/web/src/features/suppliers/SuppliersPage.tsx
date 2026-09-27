import { z } from 'zod';
import { SimpleCrudPage } from '../../shared/components/SimpleCrudPage';

const supplierSchema = z.object({
  name: z.string().min(1, 'اسم المورد مطلوب'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

interface SupplierItem {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

/**
 * ملاحظة نطاق: هذه الصفحة تغطي إدارة الموردين أنفسهم (Create/List/Update/
 * Activate-Deactivate) فقط. ربط المنتجات بالموردين (Supplier Products) عبر
 * `POST /suppliers/:id/products` مبني في الـBackend، لكن واجهة إدارته
 * (اختيار المورد المفضّل، عرض قائمة منتجات كل مورد) لم تُبنَ في هذه
 * الشاشة عمدًا — تفاديًا لتوسيع النطاق، ويمكن إضافتها كتحسين لاحق بسيط
 * (شاشة فرعية أو تبويب) دون أي تغيير في الـAPI الموجود بالفعل.
 */
export default function SuppliersPage() {
  return (
    <SimpleCrudPage<SupplierItem>
      title="الموردون"
      resourcePath="/suppliers"
      queryKey="suppliers"
      viewPermission="suppliers.view"
      managePermission="suppliers.manage"
      entityLabelForMessages="المورد"
      columns={[
        { key: 'name', label: 'الاسم' },
        { key: 'phone', label: 'الجوال', render: (item) => item.phone ?? '—' },
        { key: 'address', label: 'العنوان', render: (item) => item.address ?? '—' },
      ]}
      fields={[
        { name: 'name', label: 'اسم المورد', type: 'text' },
        { name: 'phone', label: 'رقم الجوال (اختياري)', type: 'text' },
        { name: 'address', label: 'العنوان (اختياري)', type: 'textarea' },
      ]}
      schema={supplierSchema}
      defaultValues={{ name: '', phone: '', address: '' }}
    />
  );
}
