import { create } from 'zustand';

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  clearAuth: () => void;
  hasPermission: (permission: string) => boolean;
}

/**
 * Auth Store — الذاكرة فقط (RAM)، بدون أي persist إلى LocalStorage/SessionStorage.
 * هذا قرار أمني معتمد صراحة (تقليل خطر سرقة التوكن عبر XSS).
 * الأثر الجانبي المقبول: تحديث الصفحة (F5) يفرغ الحالة، لذا التطبيق يحاول
 * تجديد الجلسة تلقائيًا عبر /auth/refresh (المعتمد على httpOnly Cookie)
 * عند إقلاع التطبيق — انظر src/features/auth/useAuth.ts
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearAuth: () => set({ accessToken: null, user: null }),
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
}));
