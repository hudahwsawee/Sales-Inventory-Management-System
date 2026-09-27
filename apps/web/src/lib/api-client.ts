import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth.store';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // إلزامي لإرسال httpOnly Refresh Token Cookie
});

// إرفاق Access Token تلقائيًا من الذاكرة (Zustand Store) على كل طلب
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

interface RefreshResponse {
  accessToken: string;
  user: {
    id: string;
    fullName: string;
    username: string;
    roles: string[];
    permissions: string[];
  };
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<RefreshResponse>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    // تحديث accessToken وuser معًا — يبقي الصلاحيات محدَّثة حتى لو تغيّرت
    // أدوار المستخدم منذ آخر تسجيل دخول (خلال حد أقصى 15 دقيقة كما هو مقرر)
    useAuthStore.getState().setAuth(data.accessToken, data.user);
    return data.accessToken;
  } catch {
    useAuthStore.getState().clearAuth();
    return null;
  }
}

// عند انتهاء صلاحية Access Token (401) — محاولة تجديد صامت واحدة، ثم إعادة الطلب الأصلي
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean });

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      // تجميع محاولات التجديد المتزامنة في وعد واحد (تفادي عدة طلبات refresh معًا)
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (newToken && originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message_ar: string;
  message_en?: string;
}
