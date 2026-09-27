import { useState } from 'react';
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
  orderNumber?: string;
  poNumber?: string;
}

const lineSchema = z.object({
  productId: z.string().min(1, 'المنتج مطلوب'),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitPrice: z.coerce.number().min(0, 'السعر لا يمكن أن يكون سالبًا'),
  reason: z.string().optional(),
});

const formSchema = z.object({
  returnType: z.enum(['customer_return', 'supplier_return']),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  referenceSalesOrderId: z.string().optional(),
  referencePurchaseOrderId: z.string().optional(),
  warehouseId: z.string().min(1, 'المخزن مطلوب'),
  items: z.array(lineSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateReturnPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();
  const [returnType, setReturnType] = useState<'customer_return' | 'supplier_return'>('customer_return');

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/warehouses')).data,
  });
  const productsQuery = useQuery({
    queryKey: ['products', { forReturn: true }],
    queryFn: async () => (await apiClient.get<{ items: RefItem[] }>('/products', { params: { limit: 100 } })).data.items,
  });
  const customersQuery = useQuery({
    queryKey: ['customers', 'for-return'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/customers')).data,
    enabled: returnType === 'customer_return',
  });
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'for-return'],
    queryFn: async () => (await apiClient.get<RefItem[]>('/suppliers')).data,
    enabled: returnType === 'supplier_return',
  });
  const salesOrdersQuery = useQuery({
    queryKey: ['sales-orders', 'delivered-for-return'],
    queryFn: async () =>
      (await apiClient.get<{ items: RefItem[] }>('/sales-orders', { params: { status: 'delivered', limit: 100 } })).data.items,
    enabled: returnType === 'customer_return',
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: ['purchase-orders', 'for-return'],
    queryFn: async () => (await apiClient.get<{ items: RefItem[] }>('/purchase-orders', { params: { limit: 100 } })).data.items,
    enabled: returnType === 'supplier_return',
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      returnType: 'customer_return',
      warehouseId: '',
      items: [{ productId: '', quantity: 1, unitPrice: 0, reason: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await apiClient.post('/returns', values);
      return data as { id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      showSuccess('تم إنشاء المرتجع بنجاح (مسودة)');
      navigate(`/returns/${data.id}`);
    },
    onError: (error) => showError(extractErrorMessage(error)),
  });

  function handleTypeChange(value: 'customer_return' | 'supplier_return') {
    setReturnType(value);
    setValue('returnType', value);
    setValue('customerId', undefined);
    setValue('supplierId', undefined);
    setValue('referenceSalesOrderId', undefined);
    setValue('referencePurchaseOrderId', undefined);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold mb-4">إنشاء مرتجع</h1>

      <form onSubmit={handleSubmit((v) => createMutation.mutateAsync(v))} className="space-y-5 bg-white rounded-lg border border-gray-200 p-5">
        <div>
          <label className="block text-sm text-gray-700 mb-1">نوع المرتجع</label>
          <select
            value={returnType}
            onChange={(e) => handleTypeChange(e.target.value as 'customer_return' | 'supplier_return')}
            className="input"
          >
            <option value="customer_return">مرتجع عميل</option>
            <option value="supplier_return">مرتجع مورد</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {returnType === 'customer_return' ? (
            <>
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
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">أمر البيع الأصلي (المُسلَّم)</label>
                <select {...register('referenceSalesOrderId')} className="input">
                  <option value="">اختر أمر البيع</option>
                  {salesOrdersQuery.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
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
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">أمر الشراء الأصلي</label>
                <select {...register('referencePurchaseOrderId')} className="input">
                  <option value="">اختر أمر الشراء</option>
                  {purchaseOrdersQuery.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.poNumber}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">المخزن</label>
          <select {...register('warehouseId')} className="input">
            <option value="">اختر المخزن</option>
            {warehousesQuery.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nameAr ?? w.name}
              </option>
            ))}
          </select>
          {errors.warehouseId && <p className="text-xs text-red-600 mt-1">{errors.warehouseId.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">بنود المرتجع</h2>
            <button type="button" onClick={() => append({ productId: '', quantity: 1, unitPrice: 0, reason: '' })} className="text-xs text-blue-600 hover:underline">
              + إضافة بند
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start flex-wrap">
                <div className="flex-1 min-w-[160px]">
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
                <div className="w-24">
                  <input type="number" step="any" placeholder="الكمية" {...register(`items.${index}.quantity` as const)} className="input" />
                </div>
                <div className="w-24">
                  <input type="number" step="any" placeholder="السعر" {...register(`items.${index}.unitPrice` as const)} className="input" />
                </div>
                <div className="w-40">
                  <input placeholder="السبب (اختياري)" {...register(`items.${index}.reason` as const)} className="input" />
                </div>
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(index)} className="text-red-600 text-xs px-2 py-2">
                    حذف
                  </button>
                )}
              </div>
            ))}
          </div>
          {errors.items && !Array.isArray(errors.items) && <p className="text-xs text-red-600 mt-2">{errors.items.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'جارٍ الحفظ...' : 'إنشاء المرتجع (مسودة)'}
        </button>
      </form>
    </div>
  );
}
