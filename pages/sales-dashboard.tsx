import { useAuth } from '@/lib/hooks/useAuth';

export default function SalesDashboardPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  if (!isLoggedIn && !authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">⚠️ Access Denied</h1>
          <p className="text-gray-600">Please log in to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">📊 Sales Dashboard</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 mb-4">This sales dashboard is currently under development.</p>
          <p className="text-gray-600">For now, please use the sales analytics tools in other sections.</p>
        </div>
      </div>
    </div>
  );
}
