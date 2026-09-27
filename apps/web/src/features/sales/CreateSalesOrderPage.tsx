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
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالبًا'),
});

const formSchema = z.object({
  customerId: z.string().min(1, 'العميل مطلوب'),
  warehouseId: z.string().min(1, 'المخزن مطلوب'),
  paymentType: z.enum(['cash', 'credit']),
  items: z.array(lineSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateSalesOrderPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ['customers', 'for-sales-order'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/customers')).data,
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/warehouses')).data,
  });
  const productsQuery = useQuery({
    queryKey: ['products', { forSalesOrder: true }],
    queryFn: async () =>
      (await apiClient.get<{ items: RefItem[] }>('/products', { params: { limit: 100 } })).data.items,
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      warehouseId: '',
      paymentType: 'cash',
      items: [{ productId: '', quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');
  const estimatedTotal = watchedItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0,
  );

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await apiClient.post('/sales-orders', values);
      return data as { id: string; stockWarnings?: { productId: string }[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      if (data.stockWarnings && data.stockWarnings.length > 0) {
        showError('تنبيه: بعض المنتجات كميتها المتاحة أقل من المطلوب — سيتم التحقق الحاسم عند التأكيد');
      }
      showSuccess('تم إنشاء أمر البيع بنجاح (مسودة)');
      navigate(`/sales/${data.id}`);
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold mb-4">إنشاء أمر بيع</h1>

      <form
        onSubmit={handleSubmit((v) => createMutation.mutateAsync(v))}
        className="space-y-5 bg-white rounded-lg border border-gray-200 p-5"
      >
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">العميل</label>
            <select {...register('customerId')} className="input">
              <option value="">اختر العميل</option>
              {customersQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.customerId && <p className="text-xs text-red-600 mt-1">{errors.customerId.message}</p>}
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
          <div>
            <label className="block text-sm text-gray-700 mb-1">طريقة البيع</label>
            <select {...register('paymentType')} className="input">
              <option value="cash">نقدي</option>
              <option value="credit">آجل</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">بنود الطلب</h2>
            <button
              type="button"
              onClick={() => append({ productId: '', quantity: 1, unitPrice: 0 })}
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
                  <input type="number" step="any" placeholder="الكمية" {...register(`items.${index}.quantity` as const)} className="input" />
                </div>
                <div className="w-28">
                  <input type="number" step="any" placeholder="السعر" {...register(`items.${index}.unitPrice` as const)} className="input" />
                </div>
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(index)} className="text-red-600 text-xs px-2 py-2">
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

        <div className="text-sm text-gray-600 border-t border-gray-100 pt-3">
          الإجمالي التقديري: <span className="font-bold">{estimatedTotal.toFixed(2)}</span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'جارٍ الحفظ...' : 'إنشاء الطلب (مسودة)'}
        </button>
      </form>
    </div>
  );
}
