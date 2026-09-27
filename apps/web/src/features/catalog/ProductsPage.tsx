import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../lib/api-client';
import { Modal } from '../../shared/components/Modal';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface RefItem {
  id: string;
  nameAr: string;
}

interface ProductItem {
  id: string;
  code: string;
  nameAr: string;
  categoryId: string;
  brandId: string | null;
  unitId: string;
  barcode: string | null;
  purchasePrice: string;
  sellingPrice: string;
  averageCost: string;
  defaultMinimumStock: number | null;
  isActive: boolean;
  category: RefItem;
  brand: RefItem | null;
  unit: RefItem;
}

interface ProductsResponse {
  items: ProductItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// نفس قواعد التحقق المطبَّقة في Backend DTOs (code/nameAr/categoryId/unitId
// إلزامية، الأسعار >= 0) — تكرار مقصود ومتزامن يدويًا لتسريع تجربة
// المستخدم؛ Backend يبقى الحارس الفعلي الوحيد الموثوق به (لا نثق بهذا
// التحقق وحده، فقط تجربة استخدام أسرع).
const productSchema = z.object({
  code: z.string().min(1, 'كود المنتج مطلوب'),
  nameAr: z.string().min(1, 'اسم المنتج مطلوب'),
  categoryId: z.string().min(1, 'الفئة مطلوبة'),
  brandId: z.string().optional(),
  unitId: z.string().min(1, 'وحدة القياس مطلوبة'),
  barcode: z.string().optional(),
  purchasePrice: z.coerce.number().min(0, 'سعر الشراء لا يمكن أن يكون سالبًا'),
  sellingPrice: z.coerce.number().min(0, 'سعر البيع لا يمكن أن يكون سالبًا'),
  defaultMinimumStock: z.coerce.number().min(0).optional().or(z.literal('')),
});

type ProductFormValues = z.infer<typeof productSchema>;

const emptyDefaults: ProductFormValues = {
  code: '',
  nameAr: '',
  categoryId: '',
  brandId: '',
  unitId: '',
  barcode: '',
  purchasePrice: 0,
  sellingPrice: 0,
  defaultMinimumStock: '',
};

export default function ProductsPage() {
  const canView = usePermission('catalog.view');
  const canManage = usePermission('catalog.manage');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/categories')).data,
    enabled: canView,
  });
  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/brands')).data,
    enabled: canView,
  });
  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/units')).data,
    enabled: canView,
  });

  const productsQuery = useQuery({
    queryKey: ['products', { search, categoryFilter, page }],
    queryFn: async () => {
      const { data } = await apiClient.get<ProductsResponse>('/products', {
        params: {
          search: search || undefined,
          categoryId: categoryFilter || undefined,
          page,
          limit: 20,
          includeInactive: 'true',
        },
      });
      return data;
    },
    enabled: canView,
  });

  const invalidateProducts = () => queryClient.invalidateQueries({ queryKey: ['products'] });

  const createMutation = useMutation({
    mutationFn: async (dto: ProductFormValues) => {
      const { data } = await apiClient.post<ProductItem>('/products', cleanPayload(dto));
      return data;
    },
    onSuccess: invalidateProducts,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: Partial<ProductFormValues> | { isActive: boolean } }) => {
      const { data } = await apiClient.patch<ProductItem>(`/products/${id}`, dto);
      return data;
    },
    onSuccess: invalidateProducts,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({ resolver: zodResolver(productSchema), defaultValues: emptyDefaults });

  function openCreateModal() {
    setEditingProduct(null);
    reset(emptyDefaults);
    setModalOpen(true);
  }

  function openEditModal(product: ProductItem) {
    setEditingProduct(product);
    reset({
      code: product.code,
      nameAr: product.nameAr,
      categoryId: product.categoryId,
      brandId: product.brandId ?? '',
      unitId: product.unitId,
      barcode: product.barcode ?? '',
      purchasePrice: Number(product.purchasePrice),
      sellingPrice: Number(product.sellingPrice),
      defaultMinimumStock: product.defaultMinimumStock ?? '',
    });
    setModalOpen(true);
  }

  async function onSubmit(values: ProductFormValues) {
    try {
      if (editingProduct) {
        await updateMutation.mutateAsync({ id: editingProduct.id, dto: cleanPayload(values) });
        showSuccess('تم تحديث المنتج بنجاح');
      } else {
        await createMutation.mutateAsync(values);
        showSuccess('تم إنشاء المنتج بنجاح');
      }
      setModalOpen(false);
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  async function toggleActive(product: ProductItem) {
    try {
      await updateMutation.mutateAsync({ id: product.id, dto: { isActive: !product.isActive } });
      showSuccess(product.isActive ? 'تم تعطيل المنتج' : 'تم تفعيل المنتج');
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">المنتجات</h1>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + إضافة منتج
          </button>
        )}
      </div>

      {!canView ? (
        <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="بحث بالاسم أو الكود أو الباركود..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]"
            />
            <select
              value={categoryFilter}
              onChange={(e) => {
                setPage(1);
                setCategoryFilter(e.target.value);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">كل الفئات</option>
              {categoriesQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {productsQuery.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
            {productsQuery.isError && (
              <p className="p-4 text-sm text-red-600">تعذّر تحميل المنتجات، الرجاء المحاولة لاحقًا</p>
            )}
            {productsQuery.data && (
              <>
                <table className="w-full text-sm text-right">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-2">الكود</th>
                      <th className="px-4 py-2">الاسم</th>
                      <th className="px-4 py-2">الفئة</th>
                      <th className="px-4 py-2">سعر البيع</th>
                      <th className="px-4 py-2">الحالة</th>
                      {canManage && <th className="px-4 py-2">إجراءات</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {productsQuery.data.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                          لا توجد منتجات مطابقة
                        </td>
                      </tr>
                    )}
                    {productsQuery.data.items.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{p.code}</td>
                        <td className="px-4 py-2">{p.nameAr}</td>
                        <td className="px-4 py-2">{p.category?.nameAr}</td>
                        <td className="px-4 py-2">{p.sellingPrice}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {p.isActive ? 'نشط' : 'موقَف'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-2 space-x-2 space-x-reverse">
                            <button
                              onClick={() => openEditModal(p)}
                              className="text-blue-600 hover:underline text-xs"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => toggleActive(p)}
                              className="text-orange-600 hover:underline text-xs"
                            >
                              {p.isActive ? 'تعطيل' : 'تفعيل'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
                  <span>
                    صفحة {productsQuery.data.pagination.page} من{' '}
                    {productsQuery.data.pagination.totalPages || 1} — إجمالي{' '}
                    {productsQuery.data.pagination.total} منتج
                  </span>
                  <div className="space-x-2 space-x-reverse">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1 border rounded disabled:opacity-40"
                    >
                      السابق
                    </button>
                    <button
                      disabled={page >= productsQuery.data.pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1 border rounded disabled:opacity-40"
                    >
                      التالي
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Modal
        title={editingProduct ? 'تعديل منتج' : 'إضافة منتج'}
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="كود المنتج" error={errors.code?.message}>
            <input {...register('code')} className="input" />
          </Field>
          <Field label="اسم المنتج" error={errors.nameAr?.message}>
            <input {...register('nameAr')} className="input" />
          </Field>
          <Field label="الفئة" error={errors.categoryId?.message}>
            <select {...register('categoryId')} className="input">
              <option value="">اختر الفئة</option>
              {categoriesQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="العلامة التجارية (اختياري)">
            <select {...register('brandId')} className="input">
              <option value="">بدون</option>
              {brandsQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="وحدة القياس" error={errors.unitId?.message}>
            <select {...register('unitId')} className="input">
              <option value="">اختر الوحدة</option>
              {unitsQuery.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الباركود (اختياري)">
            <input {...register('barcode')} className="input" />
          </Field>
          <Field label="سعر الشراء" error={errors.purchasePrice?.message}>
            <input type="number" step="any" {...register('purchasePrice')} className="input" />
          </Field>
          <Field label="سعر البيع" error={errors.sellingPrice?.message}>
            <input type="number" step="any" {...register('sellingPrice')} className="input" />
          </Field>
          <Field label="الحد الأدنى الافتراضي (قالب اختياري)">
            <input type="number" {...register('defaultMinimumStock')} className="input" />
          </Field>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

/** يزيل الحقول الفارغة الاختيارية (سلسلة فارغة) قبل الإرسال بدل إرسالها كنص فارغ */
function cleanPayload(values: ProductFormValues) {
  return {
    ...values,
    brandId: values.brandId || undefined,
    barcode: values.barcode || undefined,
    defaultMinimumStock:
      values.defaultMinimumStock === '' || values.defaultMinimumStock === undefined
        ? undefined
        : Number(values.defaultMinimumStock),
  };
}
