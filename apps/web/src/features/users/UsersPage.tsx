import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { usePermission } from '../../shared/permissions/usePermission';

interface UserRow {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  isActive: boolean;
  userRoles: { role: { nameAr: string } }[];
}

export default function UsersPage() {
  const canView = usePermission('users.view');

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await apiClient.get<UserRow[]>('/users');
      return data;
    },
    enabled: canView,
  });

  if (!canView) {
    return <p className="text-sm text-gray-500">لا تملك صلاحية عرض هذه الصفحة.</p>;
  }

  if (isLoading) return <p className="text-sm text-gray-500">جارٍ التحميل...</p>;
  if (error) return <p className="text-sm text-red-600">تعذّر تحميل المستخدمين</p>;

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">المستخدمون</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2">الاسم الكامل</th>
              <th className="px-4 py-2">اسم المستخدم</th>
              <th className="px-4 py-2">الأدوار</th>
              <th className="px-4 py-2">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{u.fullName}</td>
                <td className="px-4 py-2">{u.username}</td>
                <td className="px-4 py-2">{u.userRoles.map((ur) => ur.role.nameAr).join('، ')}</td>
                <td className="px-4 py-2">{u.isActive ? 'نشط' : 'موقَف'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
