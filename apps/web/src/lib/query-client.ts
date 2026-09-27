import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // 30 ثانية — بيانات "قليلة التغيير" فقط، وليس المخزون/الأرصدة
      refetchOnWindowFocus: false,
    },
  },
});
