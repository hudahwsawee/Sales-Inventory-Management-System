import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface RefItem {
  id: string;
  name?: string;
  nameAr?: string;
}

const schema = z.object({
  productId: z.string().min(1, 'المنتج مطلوب'),
  warehouseId: z.string().min(1, 'المخزن مطلوب'),
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  reason: z.string().min(1, 'سبب التسوية مطلوب'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function InventoryAdjustmentsPage() {
  const canAdjust = usePermission('inventory.adjust');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ['products', { forAdjustment: true }],
    queryFn: async () =>
      (await apiClient.get<{ items: RefItem[] }>('/products', { params: { limit: 100 } })).data.items,
    enabled: canAdjust,
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/warehouses')).data,
    enabled: canAdjust,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: '',
      warehouseId: '',
      type: 'ADJUSTMENT_IN',
      quantity: 1,
      reason: '',
      notes: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await apiClient.post('/inventory/adjustments', {
        ...values,
        notes: values.notes || undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] });
      showSuccess('تم تنفيذ التسوية بنجاح');
      reset();
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  if (!canAdjust) return <p className="text-sm text-gray-500">لا تملك صلاحية تنفيذ تسويات المخزون.</p>;

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-bold mb-4">تسويات المخزون</h1>

      <form
        onSubmit={handleSubmit((v) => mutation.mutateAsync(v))}
        className="space-y-4 bg-white rounded-lg border border-gray-200 p-5"
      >
        <div>
          <label className="block text-sm text-gray-700 mb-1">المنتج</label>
          <select {...register('productId')} className="input">
            <option value="">اختر المنتج</option>
            {productsQuery.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameAr}
              </option>
            ))}
          </select>
          {errors.productId && <p className="text-xs text-red-600 mt-1">{errors.productId.message}</p>}
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
          <label className="block text-sm text-gray-700 mb-1">نوع التسوية</label>
          <select {...register('type')} className="input">
            <option value="ADJUSTMENT_IN">زيادة (ADJUSTMENT_IN)</option>
            <option value="ADJUSTMENT_OUT">نقص (ADJUSTMENT_OUT)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">الكمية</label>
          <input type="number" step="any" {...register('quantity')} className="input" />
          {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity.message}</p>}
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">سبب التسوية</label>
          <input {...register('reason')} placeholder="مثال: جرد دوري — فرق تالف" className="input" />
          {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">ملاحظات (اختياري)</label>
          <input {...register('notes')} className="input" />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'جارٍ التنفيذ...' : 'تنفيذ التسوية'}
        </button>
      </form>
    </div>
  );
}
