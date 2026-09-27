import { z } from 'zod';
import { SimpleCrudPage } from '../../shared/components/SimpleCrudPage';

const brandSchema = z.object({
  nameAr: z.string().min(1, 'اسم العلامة التجارية مطلوب'),
});

interface BrandItem {
  id: string;
  nameAr: string;
  isActive: boolean;
}

export default function BrandsPage() {
  return (
    <SimpleCrudPage<BrandItem>
      title="العلامات التجارية"
      resourcePath="/brands"
      queryKey="brands"
      viewPermission="catalog.view"
      managePermission="catalog.manage"
      entityLabelForMessages="العلامة التجارية"
      columns={[{ key: 'nameAr', label: 'الاسم' }]}
      fields={[{ name: 'nameAr', label: 'اسم العلامة التجارية', type: 'text' }]}
      schema={brandSchema}
      defaultValues={{ nameAr: '' }}
    />
  );
}
