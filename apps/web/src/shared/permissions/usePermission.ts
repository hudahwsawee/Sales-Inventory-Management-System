import { useAuthStore } from '../../store/auth.store';

/**
 * usePermission('sales.create_order') → boolean
 * غلاف بسيط حول Auth Store لقراءة صلاحية واحدة داخل أي مكوّن.
 * تذكير: للعرض فقط (تحسين تجربة استخدام) — Backend هو مصدر القرار النهائي دائمًا.
 */
export function usePermission(permission: string): boolean {
  return useAuthStore((s) => s.hasPermission(permission));
}
