import { z } from 'zod';
import { SimpleCrudPage } from '../../shared/components/SimpleCrudPage';

const unitSchema = z.object({
  nameAr: z.string().min(1, 'اسم الوحدة مطلوب'),
  symbol: z.string().optional(),
});

interface UnitItem {
  id: string;
  nameAr: string;
  symbol: string | null;
  isActive: boolean;
}

export default function UnitsPage() {
  return (
    <SimpleCrudPage<UnitItem>
      title="الوحدات"
      resourcePath="/units"
      queryKey="units"
      viewPermission="catalog.view"
      managePermission="catalog.manage"
      entityLabelForMessages="الوحدة"
      columns={[
        { key: 'nameAr', label: 'الاسم' },
        { key: 'symbol', label: 'الرمز', render: (item) => item.symbol ?? '—' },
      ]}
      fields={[
        { name: 'nameAr', label: 'اسم الوحدة', type: 'text' },
        { name: 'symbol', label: 'الرمز (اختياري)', type: 'text' },
      ]}
      schema={unitSchema}
      defaultValues={{ nameAr: '', symbol: '' }}
    />
  );
}
