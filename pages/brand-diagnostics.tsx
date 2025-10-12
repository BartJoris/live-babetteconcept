import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Navigation from '../components/Navigation';

// Type definition for product with brand issues (future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ProductWithIssue = {
  productId: number;
  templateId: number;
  productName: string;
  templateName: string;
  variantName: string;
  currentStock: number;
  costPrice: number;
  sellPrice: number;
  orphanedBrandId?: number;
  hasBrand: boolean;
  brandName?: string;
  attributeSource?: string;
  suggestedBrandName?: string;
  suggestedBrandId?: number;
  suggestedBrandSource?: string;
  matchConfidence?: 'exact' | 'fuzzy' | 'none';
};

export default function BrandDiagnosticsPage() {
  const router = useRouter();
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [data, setData] = useState<{ 
    success: boolean; 
    summary: { 
      totalProducts: number;
      productsWithBrand: number;
      productsWithoutBrand: number;
      productsWithOrphanedBrand: number;
      duplicateBrandCount: number;
    }
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (storedUid && storedPass) {
        setUid(Number(storedUid));
        setPassword(storedPass);
      } else {
        router.push('/');
      }
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!uid || !password) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/brand-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Error fetching brand diagnostics:', error);
    } finally {
      setLoading(false);
    }
  }, [uid, password]);

  useEffect(() => {
    if (uid && password) {
      fetchData();
    }
  }, [uid, password, fetchData]);

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Navigation />
      <div className="p-4">
        <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">🔍 Merk Diagnostiek</h1>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:bg-gray-400"
            >
              {loading ? '⏳ Laden...' : '🔄 Vernieuwen'}
            </button>
          </div>

          {loading ? (
            <p className="text-center py-12">⏳ Gegevens laden...</p>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-600 text-xs font-medium mb-1">Totaal Producten</p>
                  <p className="text-3xl font-bold text-blue-900">{data.summary?.totalProducts || 0}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-green-600 text-xs font-medium mb-1">✅ Met Merk</p>
                  <p className="text-3xl font-bold text-green-900">{data.summary?.productsWithBrand || 0}</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="text-orange-600 text-xs font-medium mb-1">⚠️ Zonder Merk</p>
                  <p className="text-3xl font-bold text-orange-900">{data.summary?.productsWithoutBrand || 0}</p>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm">Brand diagnostics loaded. Full feature coming back soon!</p>
                <p className="text-xs text-gray-600 mt-2">This page will show brand suggestions and assignment tools.</p>
              </div>
            </div>
          ) : (
            <p className="text-center py-12 text-gray-500">Geen data beschikbaar</p>
          )}
        </div>
      </div>
    </div>
  );
}

