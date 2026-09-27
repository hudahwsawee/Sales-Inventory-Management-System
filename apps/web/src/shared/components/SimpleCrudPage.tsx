import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useEntityCrud } from '../hooks/useEntityCrud';
import { Modal } from './Modal';
import { RequirePermission } from './ProtectedRoute';
import { useToast, extractErrorMessage } from '../notifications/ToastProvider';

export interface SimpleFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'textarea';
}

export interface SimpleColumnConfig<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface BaseItem {
  id: string;
  isActive?: boolean;
}

/**
 * SimpleCrudPage — مكوّن عام يغطي نمط "قائمة + إضافة + تعديل + تفعيل/تعطيل"
 * المتكرر عبر الفئات/العلامات التجارية/الوحدات/الموردين/المخازن، بدل تكرار
 * نفس الجدول والنموذج 5 مرات. المنتجات (أكثر تعقيدًا: بحث، فلترة، علاقات)
 * لها صفحة خاصة منفصلة (ProductsPage) لا تستخدم هذا المكوّن.
 */
export function SimpleCrudPage<T extends BaseItem>({
  title,
  resourcePath,
  queryKey,
  viewPermission,
  managePermission,
  columns,
  fields,
  schema,
  defaultValues,
  entityLabelForMessages,
}: {
  title: string;
  resourcePath: string;
  queryKey: string;
  viewPermission: string;
  managePermission: string;
  columns: SimpleColumnConfig<T>[];
  fields: SimpleFieldConfig[];
  schema: z.ZodTypeAny;
  defaultValues: Record<string, unknown>;
  entityLabelForMessages: string;
}) {
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const { showSuccess, showError } = useToast();

  const { listQuery, createMutation, updateMutation } = useEntityCrud<T, unknown, unknown>(
    resourcePath,
    queryKey,
    { include_inactive: 'true' },
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues });

  function openCreateModal() {
    setEditingItem(null);
    reset(defaultValues);
    setModalOpen(true);
  }

  function openEditModal(item: T) {
    setEditingItem(item);
    reset(item as unknown as Record<string, unknown>);
    setModalOpen(true);
  }

  async function onSubmit(values: Record<string, unknown>) {
    try {
      if (editingItem) {
        await updateMutation.mutateAsync({ id: editingItem.id, dto: values });
        showSuccess(`تم تحديث ${entityLabelForMessages} بنجاح`);
      } else {
        await createMutation.mutateAsync(values);
        showSuccess(`تم إنشاء ${entityLabelForMessages} بنجاح`);
      }
      setModalOpen(false);
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  async function toggleActive(item: T) {
    try {
      await updateMutation.mutateAsync({ id: item.id, dto: { isActive: !item.isActive } });
      showSuccess(item.isActive ? 'تم التعطيل بنجاح' : 'تم التفعيل بنجاح');
    } catch (error) {
      showError(extractErrorMessage(error));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">{title}</h1>
        <RequirePermission permission={managePermission}>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + إضافة {entityLabelForMessages}
          </button>
        </RequirePermission>
      </div>

      <RequirePermission
        permission={viewPermission}
        fallback={<p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الشاشة.</p>}
      >
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {listQuery.isLoading && <p className="p-4 text-sm text-gray-500">جارٍ التحميل...</p>}
          {listQuery.isError && (
            <p className="p-4 text-sm text-red-600">تعذّر تحميل البيانات، الرجاء المحاولة لاحقًا</p>
          )}
          {listQuery.data && (
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-2">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-2">الحالة</th>
                  <RequirePermission permission={managePermission}>
                    <th className="px-4 py-2">إجراءات</th>
                  </RequirePermission>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-gray-400">
                      لا توجد بيانات بعد
                    </td>
                  </tr>
                )}
                {listQuery.data.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-2">
                        {c.render ? c.render(item) : String((item as any)[c.key] ?? '')}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          item.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.isActive ? 'نشط' : 'موقَف'}
                      </span>
                    </td>
                    <RequirePermission permission={managePermission}>
                      <td className="px-4 py-2 space-x-2 space-x-reverse">
                        <button
                          onClick={() => openEditModal(item)}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => toggleActive(item)}
                          className="text-orange-600 hover:underline text-xs"
                        >
                          {item.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </td>
                    </RequirePermission>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </RequirePermission>

      <Modal
        title={editingItem ? `تعديل ${entityLabelForMessages}` : `إضافة ${entityLabelForMessages}`}
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="block text-sm text-gray-700 mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  {...register(f.name)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                />
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  {...register(f.name, f.type === 'number' ? { valueAsNumber: true } : {})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              )}
              {errors[f.name] && (
                <p className="text-xs text-red-600 mt-1">{String(errors[f.name]?.message)}</p>
              )}
            </div>
          ))}
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
