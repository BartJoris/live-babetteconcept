import React from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

export default function ProductImagesImportPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-4">🖼️ Product Images Import</h1>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 mb-4">This product images import tool is currently under development.</p>
          <p className="text-gray-600">For now, please use the product management tools in other sections.</p>
        </div>
      </div>
    </div>
  );
}

