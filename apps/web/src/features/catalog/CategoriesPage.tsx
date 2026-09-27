import { z } from 'zod';
import { SimpleCrudPage } from '../../shared/components/SimpleCrudPage';

const categorySchema = z.object({
  nameAr: z.string().min(1, 'اسم الفئة مطلوب'),
});

interface CategoryItem {
  id: string;
  nameAr: string;
  isActive: boolean;
}

export default function CategoriesPage() {
  return (
    <SimpleCrudPage<CategoryItem>
      title="التصنيفات"
      resourcePath="/categories"
      queryKey="categories"
      viewPermission="catalog.view"
      managePermission="catalog.manage"
      entityLabelForMessages="الفئة"
      columns={[{ key: 'nameAr', label: 'الاسم' }]}
      fields={[{ name: 'nameAr', label: 'اسم الفئة', type: 'text' }]}
      schema={categorySchema}
      defaultValues={{ nameAr: '' }}
    />
  );
}
