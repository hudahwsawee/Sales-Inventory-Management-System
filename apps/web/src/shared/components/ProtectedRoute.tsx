import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';

/**
 * ProtectedRoute — يمنع الوصول لأي صفحة تتطلب تسجيل دخول.
 *
 * تذكير مهم (موثّق أيضًا في Architecture): هذا الفحص هنا هو تحسين تجربة
 * استخدام فقط (إخفاء/إعادة توجيه) — الحماية الحقيقية الوحيدة الموثوقة هي
 * Backend Guards (JwtAuthGuard + PermissionsGuard). لا يجب الاعتماد على
 * هذا المكوّن كطبقة أمان.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        جارٍ التحقق من الجلسة...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}

/**
 * RequirePermission — لإخفاء/حجب أجزاء واجهة معيّنة حسب الصلاحية.
 * استخدام: <RequirePermission permission="users.manage"><Button/></RequirePermission>
 */
import { useAuthStore } from '../../store/auth.store';
import type { ReactNode } from 'react';

export function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission(permission));
  return hasPermission ? <>{children}</> : <>{fallback}</>;
}
