import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

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
      productsWithSuggestions?: number;
      productsWithExactMatch?: number;
    };
    productsWithoutBrand?: Array<{
      templateId: number;
      templateName: string;
      currentStock: number;
      suggestedBrandName?: string;
      suggestedBrandId?: number;
      suggestedBrandSource?: string;
      matchConfidence?: 'exact' | 'fuzzy' | 'none';
    }>;
    brandSuggestions?: Array<{
      suggestedBrandName: string;
      matchedBrandId: number | null;
      matchedBrandName: string | null;
      matchedBrandSource: string | null;
      matchConfidence: string;
      products: Array<{
        templateId: number;
        templateName: string;
      }>;
      totalStock: number;
    }>;
    validBrands?: Array<{ id: number; name: string; source: string }>;
    attributeIds?: Record<number, string>; // Maps attribute ID to name (18 -> 'MERK', etc.)
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedForTest, setSelectedForTest] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);

  // Helper to get attribute ID from source name
  const getAttributeId = (sourceName: string): number | null => {
    if (!data?.attributeIds) return null;
    const entry = Object.entries(data.attributeIds).find(([, name]) => name === sourceName);
    return entry ? parseInt(entry[0]) : null;
  };

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const testBrandAssignment = async (templateId: number, brandId: number, brandSource: string) => {
    if (!uid || !password) return;
    
    const attributeId = getAttributeId(brandSource);
    if (!attributeId) {
      alert(`❌ Kon attribute ID niet vinden voor ${brandSource}`);
      return;
    }
    
    setUpdating(true);
    try {
      const response = await fetch('/api/assign-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          password,
          templateIds: [templateId],
          brandId,
          attributeId,
          testMode: true,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Test succesvol! Product ID ${templateId} bijgewerkt met merk.`);
        fetchData(); // Reload data
      } else {
        alert(`❌ Test mislukt: ${result.error}`);
      }
    } catch (error) {
      console.error('Error testing brand assignment:', error);
      alert('❌ Fout bij test');
    } finally {
      setUpdating(false);
    }
  };

  const bulkAssignBrand = async (templateIds: number[], brandId: number, brandSource: string) => {
    if (!uid || !password) return;
    
    const attributeId = getAttributeId(brandSource);
    if (!attributeId) {
      alert(`❌ Kon attribute ID niet vinden voor ${brandSource}`);
      return;
    }
    
    const confirmed = confirm(
      `Weet je zeker dat je ${templateIds.length} producten wilt bijwerken met deze merk?\n\nDit kan niet ongedaan worden gemaakt.`
    );
    
    if (!confirmed) return;

    setUpdating(true);
    try {
      const response = await fetch('/api/assign-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          password,
          templateIds,
          brandId,
          attributeId,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Succesvol! ${result.processed} van ${templateIds.length} producten bijgewerkt.`);
        fetchData(); // Reload data
      } else {
        alert(`❌ Bulk update mislukt: ${result.error}`);
      }
    } catch (error) {
      console.error('Error bulk assigning brand:', error);
      alert('❌ Fout bij bulk update');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">🔍 Merk Diagnostiek</h1>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <p className="text-purple-600 text-xs font-medium mb-1">🤖 AI Suggesties</p>
                  <p className="text-3xl font-bold text-purple-900">{data.summary?.productsWithSuggestions || 0}</p>
                </div>
              </div>

              {/* Products Without Brand with AI Suggestions */}
              {data.productsWithoutBrand && data.productsWithoutBrand.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    🤖 AI Merk Suggesties ({data.summary?.productsWithSuggestions || 0} met suggesties)
                  </h2>
                  
                  {data.brandSuggestions?.filter(group => group.matchedBrandId).map((group, idx) => (
                    <div key={idx} className="border rounded-lg p-4 mb-4 bg-white">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg text-gray-900">
                            {group.suggestedBrandName}
                            {group.matchConfidence === 'exact' && (
                              <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">✓ Exact Match</span>
                            )}
                            {group.matchConfidence === 'fuzzy' && (
                              <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">~ Fuzzy Match</span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-800">
                            Gevonden merk: <strong>{group.matchedBrandName}</strong> ({group.matchedBrandSource})
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {group.products.length} producten • {group.totalStock} stuks voorraad
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const firstProduct = group.products[0];
                              if (group.matchedBrandId && firstProduct) {
                                setSelectedForTest(firstProduct.templateId);
                                testBrandAssignment(
                                  firstProduct.templateId,
                                  group.matchedBrandId,
                                  group.matchedBrandSource || 'MERK'
                                );
                              }
                            }}
                            disabled={updating || !group.matchedBrandId}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 text-sm"
                          >
                            🧪 Test met 1 Product
                          </button>
                          <button
                            onClick={() => {
                              if (group.matchedBrandId) {
                                const templateIds = group.products.map(p => p.templateId);
                                bulkAssignBrand(
                                  templateIds,
                                  group.matchedBrandId,
                                  group.matchedBrandSource || 'MERK'
                                );
                              }
                            }}
                            disabled={updating || !group.matchedBrandId}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 text-sm"
                          >
                            ✅ Update Alle ({group.products.length})
                          </button>
                        </div>
                      </div>

                      {/* Product List */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-gray-800 hover:text-gray-900">
                          Toon {group.products.length} producten
                        </summary>
                        <div className="mt-3 space-y-1">
                          {group.products.map((product) => (
                            <div
                              key={product.templateId}
                              className={`text-sm p-2 rounded ${
                                selectedForTest === product.templateId ? 'bg-blue-100' : 'bg-gray-50'
                              }`}
                            >
                              <span className="font-medium">{product.templateName}</span>
                              <span className="text-gray-500 ml-2">(ID: {product.templateId})</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}

                  {/* Products without suggestions */}
                  {data.productsWithoutBrand.filter(p => !p.suggestedBrandName).length > 0 && (
                    <div className="border rounded-lg p-4 bg-yellow-50">
                      <h3 className="font-bold text-lg text-gray-900 mb-3">
                        ⚠️ Geen AI Suggestie ({data.productsWithoutBrand.filter(p => !p.suggestedBrandName).length} producten)
                      </h3>
                      <p className="text-sm text-gray-800 mb-3">
                        Deze producten hebben geen duidelijke merknaam in de titel. Handmatige toewijzing vereist.
                      </p>
                      <details>
                        <summary className="cursor-pointer text-sm font-medium hover:text-gray-900">
                          Toon producten zonder suggestie
                        </summary>
                        <div className="mt-3 space-y-1">
                          {data.productsWithoutBrand
                            .filter(p => !p.suggestedBrandName)
                            .map((product) => (
                              <div key={product.templateId} className="text-sm p-2 rounded bg-white">
                                <span className="font-medium">{product.templateName}</span>
                                <span className="text-gray-500 ml-2">(ID: {product.templateId})</span>
                                <span className="text-gray-400 ml-2">• {product.currentStock} stuks</span>
                              </div>
                            ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}

              {data.productsWithoutBrand && data.productsWithoutBrand.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <div className="text-4xl mb-3">🎉</div>
                  <h3 className="text-xl font-bold text-green-900 text-gray-900 mb-2">Alle Producten Hebben een Merk!</h3>
                  <p className="text-green-700">Er zijn geen producten zonder merk gevonden.</p>
              </div>
              )}
            </div>
          ) : (
            <p className="text-center py-12 text-gray-500">Geen data beschikbaar</p>
          )}
        </div>
      </div>
    </div>
  );
}

