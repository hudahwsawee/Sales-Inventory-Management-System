import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

/**
 * ToastProvider — نظام إشعارات بسيط بدون أي مكتبة خارجية إضافية (تفاديًا
 * لإضافة تبعية جديدة لهذه المرحلة). يكفي تمامًا لرسائل النجاح/الخطأ
 * المطلوبة (Success/Error notifications) في شاشات الكتالوج والموردين والمخازن.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, type: Toast['type']) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const showSuccess = useCallback((message: string) => push(message, 'success'), [push]);
  const showError = useCallback((message: string) => push(message, 'error'), [push]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="fixed bottom-4 left-4 z-50 space-y-2" dir="rtl">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm text-white min-w-[220px] ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast يجب أن يُستخدم داخل ToastProvider');
  return ctx;
}

/** يستخرج رسالة الخطأ العربية من استجابة Axios الموحّدة (message_ar) */
export function extractErrorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع'): string {
  const anyError = error as { response?: { data?: { message_ar?: string } } };
  return anyError?.response?.data?.message_ar ?? fallback;
}
