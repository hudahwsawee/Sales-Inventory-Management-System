import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../lib/api-client';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface RefItem {
  id: string;
  name?: string;
  nameAr?: string;
}

const lineSchema = z.object({
  productId: z.string().min(1, 'المنتج مطلوب'),
  quantityOrdered: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالبًا'),
});

const formSchema = z.object({
  supplierId: z.string().min(1, 'المورد مطلوب'),
  warehouseId: z.string().min(1, 'المخزن مطلوب'),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(lineSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreatePurchaseOrderPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/suppliers')).data,
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/warehouses')).data,
  });
  const productsQuery = useQuery({
    queryKey: ['products', { forPurchaseOrder: true }],
    queryFn: async () =>
      (await apiClient.get<{ items: RefItem[] }>('/products', { params: { limit: 100 } })).data.items,
  });

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierId: '',
      warehouseId: '',
      expectedDeliveryDate: '',
      notes: '',
      items: [{ productId: '', quantityOrdered: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await apiClient.post('/purchase-orders', {
        ...values,
        expectedDeliveryDate: values.expectedDeliveryDate || undefined,
        notes: values.notes || undefined,
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      showSuccess('تم إنشاء أمر الشراء بنجاح');
      navigate(`/purchasing/${data.id}`);
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  async function onSubmit(values: FormValues) {
    await createMutation.mutateAsync(values);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold mb-4">إنشاء أمر شراء</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 bg-white rounded-lg border border-gray-200 p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">المورد</label>
            <select {...register('supplierId')} className="input">
              <option value="">اختر المورد</option>
              {suppliersQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.supplierId && <p className="text-xs text-red-600 mt-1">{errors.supplierId.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">المخزن</label>
            <select {...register('warehouseId')} className="input">
              <option value="">اختر المخزن</option>
              {warehousesQuery.data?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {errors.warehouseId && <p className="text-xs text-red-600 mt-1">{errors.warehouseId.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">تاريخ التوريد المتوقع (اختياري)</label>
            <input type="date" {...register('expectedDeliveryDate')} className="input" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">ملاحظات (اختياري)</label>
            <input {...register('notes')} className="input" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">بنود أمر الشراء</h2>
            <button
              type="button"
              onClick={() => append({ productId: '', quantityOrdered: 1, unitPrice: 0 })}
              className="text-xs text-blue-600 hover:underline"
            >
              + إضافة بند
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="flex-1">
                  <select {...register(`items.${index}.productId` as const)} className="input">
                    <option value="">اختر المنتج</option>
                    {productsQuery.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}
                      </option>
                    ))}
                  </select>
                  {errors.items?.[index]?.productId && (
                    <p className="text-xs text-red-600 mt-1">{errors.items[index]?.productId?.message}</p>
                  )}
                </div>
                <div className="w-28">
                  <input
                    type="number"
                    step="any"
                    placeholder="الكمية"
                    {...register(`items.${index}.quantityOrdered` as const)}
                    className="input"
                  />
                </div>
                <div className="w-28">
                  <input
                    type="number"
                    step="any"
                    placeholder="سعر الوحدة"
                    {...register(`items.${index}.unitPrice` as const)}
                    className="input"
                  />
                </div>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-red-600 text-xs px-2 py-2"
                  >
                    حذف
                  </button>
                )}
              </div>
            ))}
          </div>
          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-xs text-red-600 mt-2">{errors.items.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'جارٍ الحفظ...' : 'إنشاء أمر الشراء'}
        </button>
      </form>
    </div>
  );
}
