import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth.store';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    roles: string[];
    permissions: string[];
  };
}

/**
 * useAuth — يوفر:
 * - login(username, password)
 * - logout()
 * - isBootstrapping: true أثناء محاولة استعادة الجلسة عند إقلاع التطبيق
 *   (F5) عبر /auth/refresh المعتمد على httpOnly Cookie، لأن Access Token
 *   نفسه لا يُحفَظ إلا في الذاكرة ويُفرَّغ عند أي تحديث للصفحة.
 */
export function useAuth() {
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { data } = await apiClient.post<LoginResponse>('/auth/refresh');
        if (!cancelled) {
          // /auth/refresh يُرجع الآن accessToken + user معًا (نفس منطق login) —
          // هذا يعيد بناء حالة المصادقة كاملة (roles + permissions) بعد F5،
          // دون الحاجة لأي استدعاء إضافي لـ /users/me.
          setAuth(data.accessToken, data.user);
        }
      } catch {
        // لا جلسة سابقة صالحة — طبيعي عند أول زيارة، لا حاجة لأي إجراء
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await apiClient.post<LoginResponse>('/auth/login', {
        username,
        password,
      });
      setAuth(data.accessToken, data.user);
      return data.user;
    },
    [setAuth],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  return {
    accessToken,
    user,
    isAuthenticated: Boolean(accessToken && user),
    isBootstrapping,
    login,
    logout,
  };
}
