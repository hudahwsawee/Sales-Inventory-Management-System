import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '../../lib/api-client';
import { Modal } from '../../shared/components/Modal';
import { usePermission } from '../../shared/permissions/usePermission';
import { useToast, extractErrorMessage } from '../../shared/notifications/ToastProvider';

interface CustomerItem {
  id: string;
  name: string;
  mobileNumber: string;
  region: string | null;
  customerType: 'cash' | 'credit';
  creditLimit: string;
  currentBalance: string;
  isActive: boolean;
}

const schema = z.object({
  name: z.string().min(1, 'اسم العميل مطلوب'),
  mobileNumber: z.string().min(1, 'رقم الجوال مطلوب'),
  region: z.string().optional(),
  contactPerson: z.string().optional(),
  taxNumber: z.string().optional(),
  customerType: z.enum(['cash', 'credit']),
  creditLimit: z.coerce.number().min(0).optional(),
  paymentTermsDays: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof schema>;

const emptyDefaults: FormValues = {
  name: '',
  mobileNumber: '',
  region: '',
  contactPerson: '',
  taxNumber: '',
  customerType: 'cash',
  creditLimit: 0,
  paymentTermsDays: undefined,
};

export default function CustomersPage() {
  const canView = usePermission('customers.view');
  const canManage = usePermission('customers.manage');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);

  const customersQuery = useQuery({
    queryKey: ['customers', search],
    queryFn: async () =>
      (await apiClient.get<CustomerItem[]>('/customers', { params: { search: search || undefined, includeInactive: 'true' } })).data,
    enabled: canView,
  });

  const createMutation = useMutation({
    mutationFn: async (dto: FormValues) => (await apiClient.post('/customers', dto)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: Partial<FormValues> | { isActive: boolean } }) =>
      (await apiClient.patch(`/customers/${id}`, dto)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyDefaults });

  function openCreateModal() {
    setEditingCustomer(null);
    reset(emptyDefaults);
    setModalOpen(true);
  }

  function openEditModal(c: CustomerItem) {
    setEditingCustomer(c);
    reset({
      name: c.name,
      mobileNumber: c.mobileNumber,
      region: c.region ?? '',
      customerType: c.customerType,
      creditLimit: Number(c.creditLimit),
    });
    setModalOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editingCustomer) {
        await updateMutation.mutateAsync({ id: editingCustomer.id, dto: values });
        showSuccess('تم تحديث العميل بنجاح');
      } else {
        await createMutation.mutateAsync(values);
        showSuccess('تم إنشاء العميل بنجاح');
      }
      setModalOpen(false);
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  async function toggleActive(c: CustomerItem) {
    try {
      await updateMutation.mutateAsync({ id: c.id, dto: { isActive: !c.isActive } });
      showSuccess(c.isActive ? 'تم تعطيل العميل' : 'تم تفعيل العميل');
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  if (!canView) return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">العملاء</h1>
        {canManage && (
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + إضافة عميل
          </button>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو رقم الجوال..."
        className="input mb-4 max-w-sm"
      />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {customersQuery.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
        {customersQuery.isError && <p className="p-4 text-sm text-red-600">تعذّر تحميل العملاء</p>}
        {customersQuery.data && (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">الاسم</th>
                <th className="px-4 py-2">الجوال</th>
                <th className="px-4 py-2">النوع</th>
                <th className="px-4 py-2">الحد الائتماني</th>
                <th className="px-4 py-2">الرصيد الحالي</th>
                <th className="px-4 py-2">الحالة</th>
                {canManage && <th className="px-4 py-2">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {customersQuery.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    لا يوجد عملاء بعد
                  </td>
                </tr>
              )}
              {customersQuery.data.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.mobileNumber}</td>
                  <td className="px-4 py-2">{c.customerType === 'credit' ? 'آجل' : 'نقدي'}</td>
                  <td className="px-4 py-2">{c.customerType === 'credit' ? c.creditLimit : '—'}</td>
                  <td className="px-4 py-2">{c.customerType === 'credit' ? c.currentBalance : '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {c.isActive ? 'نشط' : 'موقَف'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 space-x-2 space-x-reverse">
                      <button onClick={() => openEditModal(c)} className="text-blue-600 hover:underline text-xs">
                        تعديل
                      </button>
                      <button onClick={() => toggleActive(c)} className="text-orange-600 hover:underline text-xs">
                        {c.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal title={editingCustomer ? 'تعديل عميل' : 'إضافة عميل'} isOpen={isModalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">الاسم</label>
            <input {...register('name')} className="input" />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">رقم الجوال</label>
            <input {...register('mobileNumber')} className="input" />
            {errors.mobileNumber && <p className="text-xs text-red-600 mt-1">{errors.mobileNumber.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">المنطقة (اختياري)</label>
            <input {...register('region')} className="input" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">نوع العميل</label>
            <select {...register('customerType')} className="input">
              <option value="cash">نقدي</option>
              <option value="credit">آجل</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">الحد الائتماني (للعميل الآجل)</label>
            <input type="number" step="any" {...register('creditLimit')} className="input" />
          </div>
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
