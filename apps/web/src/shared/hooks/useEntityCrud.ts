import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';

/**
 * useEntityCrud — Hook عام لعمليات Create/List/Update المتكررة عبر شاشات
 * الكتالوج/الموردين/المخازن. يتفادى تكرار نفس منطق TanStack Query 6 مرات.
 *
 * لا يُستخدم لعمليات أكثر تعقيدًا (مثل Sales Workflow لاحقًا) — هذا
 * مخصَّص فقط لأنماط CRUD البسيطة (اسم + isActive) في هذه المرحلة.
 */
export function useEntityCrud<TItem, TCreateDto, TUpdateDto>(
  resourcePath: string,
  queryKey: string,
  listParams?: Record<string, string | undefined>,
) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [queryKey, listParams],
    queryFn: async () => {
      const { data } = await apiClient.get<TItem[] | { items: TItem[] }>(resourcePath, {
        params: listParams,
      });
      // بعض القوائم (مثل المنتجات) تُرجع {items, pagination}، والبعض الآخر مصفوفة مباشرة
      return Array.isArray(data) ? data : data.items;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (dto: TCreateDto) => {
      const { data } = await apiClient.post<TItem>(resourcePath, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: TUpdateDto }) => {
      const { data } = await apiClient.patch<TItem>(`${resourcePath}/${id}`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
  });

  return { listQuery, createMutation, updateMutation };
}
