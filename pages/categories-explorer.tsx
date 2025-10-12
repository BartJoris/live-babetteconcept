import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function CategoriesExplorer() {
  const [data, setData] = useState<{ success: boolean; summary: Record<string, number>; internalCategories: unknown[]; publicCategories: unknown[]; productTags: unknown[]; posCategories: unknown[]; error?: string; publicCategoriesError?: unknown; productTagsError?: unknown; sampleProductWithPublicCategs?: unknown; sampleProductsWithTags?: unknown } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('internal');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const uid = localStorage.getItem('odoo_uid');
      const password = localStorage.getItem('odoo_pass');
      
      if (!uid || !password) {
        console.error('No Odoo credentials found');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/debug-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      const result = await response.json();
      setData(result);
      console.log('Categories data:', result);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = (dataObj: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <div className="text-xl">Loading categories...</div>
        </div>
      </div>
    );
  }

  if (!data || !data.success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <div className="text-4xl mb-4">❌</div>
          <div className="text-xl">Error loading categories</div>
          <pre className="mt-4 text-left bg-red-50 p-4 rounded">
            {JSON.stringify(data?.error, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Categories Explorer - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🔍 Categories Explorer
            </h1>
            <p className="text-gray-600">
              Explore all available categories in your Odoo system
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-600 text-sm mb-1">📁 Internal Categories</div>
              <div className="text-3xl font-bold">{data.summary.internalCategories}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-600 text-sm mb-1">🌐 Public Categories</div>
              <div className="text-3xl font-bold">{data.summary.publicCategories}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-600 text-sm mb-1">🏷️ Product Tags</div>
              <div className="text-3xl font-bold">{data.summary.productTags}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-gray-600 text-sm mb-1">💰 POS Categories</div>
              <div className="text-3xl font-bold">{data.summary.posCategories}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('internal')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'internal'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📁 Internal ({data.summary.internalCategories})
                </button>
                <button
                  onClick={() => setActiveTab('public')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'public'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🌐 Public ({data.summary.publicCategories})
                </button>
                <button
                  onClick={() => setActiveTab('tags')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'tags'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🏷️ Tags ({data.summary.productTags})
                </button>
                <button
                  onClick={() => setActiveTab('pos')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'pos'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  💰 POS ({data.summary.posCategories})
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Internal Categories */}
              {activeTab === 'internal' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Internal Categories (product.category)</h2>
                    <button
                      onClick={() => downloadJSON(data.internalCategories, 'internal-categories.json')}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                      📥 Download JSON
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">ID</th>
                          <th className="p-2 text-left">Name</th>
                          <th className="p-2 text-left">Complete Name</th>
                          <th className="p-2 text-left">Parent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.internalCategories as Array<{ id: number; name: string; display_name: string; parent_id?: [number, string] | false }>).map((cat) => (
                          <tr key={cat.id} className="border-b hover:bg-gray-50">
                            <td className="p-2">{cat.id}</td>
                            <td className="p-2 font-medium">{cat.name}</td>
                            <td className="p-2 text-xs text-gray-600">{cat.display_name}</td>
                            <td className="p-2 text-xs">
                              {cat.parent_id ? `${cat.parent_id[0]} - ${cat.parent_id[1]}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Public Categories */}
              {activeTab === 'public' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Public/eCommerce Categories (product.public.category)</h2>
                    {data.publicCategories.length > 0 && (
                      <button
                        onClick={() => downloadJSON(data.publicCategories, 'public-categories.json')}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        📥 Download JSON
                      </button>
                    )}
                  </div>

                  {data.publicCategories.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h3 className="font-bold text-yellow-800 mb-2">⚠️ No Public Categories Found</h3>
                      <p className="text-sm text-yellow-700 mb-3">
                        This could mean public categories don&apos;t exist or there&apos;s an access issue.
                      </p>
                      
                      {Boolean(data.publicCategoriesError) && (
                        <details className="mt-3">
                          <summary className="cursor-pointer font-medium">Error Details</summary>
                          <pre className="mt-2 text-xs bg-white p-3 rounded overflow-x-auto">
                            {JSON.stringify(data.publicCategoriesError, null, 2)}
                          </pre>
                        </details>
                      )}

                      {data.sampleProductWithPublicCategs && Array.isArray(data.sampleProductWithPublicCategs) && data.sampleProductWithPublicCategs.length > 0 ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer font-medium">Sample Products with Public Category IDs</summary>
                          <pre className="mt-2 text-xs bg-white p-3 rounded overflow-x-auto">
                            {JSON.stringify(data.sampleProductWithPublicCategs, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">ID</th>
                            <th className="p-2 text-left">Name</th>
                            <th className="p-2 text-left">Display Name</th>
                            <th className="p-2 text-left">Parent</th>
                          </tr>
                        </thead>
                      <tbody>
                        {(data.publicCategories as Array<{ id: number; name: string; display_name: string; parent_id?: [number, string] | false }>).map((cat) => (
                          <tr key={cat.id} className="border-b hover:bg-gray-50">
                              <td className="p-2">{cat.id}</td>
                              <td className="p-2 font-medium">{cat.name}</td>
                              <td className="p-2 text-xs text-gray-600">{cat.display_name}</td>
                              <td className="p-2 text-xs">
                                {cat.parent_id ? `${cat.parent_id[0]} - ${cat.parent_id[1]}` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Product Tags */}
              {activeTab === 'tags' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Product Template Tags</h2>
                    {data.productTags.length > 0 && (
                      <button
                        onClick={() => downloadJSON(data.productTags, 'product-tags.json')}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        📥 Download JSON
                      </button>
                    )}
                  </div>

                  {data.productTags.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h3 className="font-bold text-yellow-800 mb-2">⚠️ No Product Tags Found</h3>
                      <p className="text-sm text-yellow-700 mb-3">
                        Product tags may not exist in this Odoo installation or the model name is different.
                      </p>
                      
                      {Boolean(data.productTagsError) && (
                        <details className="mt-3">
                          <summary className="cursor-pointer font-medium">Error Details</summary>
                          <pre className="mt-2 text-xs bg-white p-3 rounded overflow-x-auto">
                            {JSON.stringify(data.productTagsError, null, 2)}
                          </pre>
                        </details>
                      )}

                      {data.sampleProductsWithTags && Array.isArray(data.sampleProductsWithTags) && data.sampleProductsWithTags.length > 0 ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer font-medium">Sample Products with Tag IDs</summary>
                          <pre className="mt-2 text-xs bg-white p-3 rounded overflow-x-auto">
                            {JSON.stringify(data.sampleProductsWithTags, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">ID</th>
                            <th className="p-2 text-left">Name</th>
                          </tr>
                        </thead>
                      <tbody>
                        {(data.productTags as Array<{ id: number; name: string }>).map((tag) => (
                          <tr key={tag.id} className="border-b hover:bg-gray-50">
                              <td className="p-2">{tag.id}</td>
                              <td className="p-2 font-medium">{tag.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* POS Categories */}
              {activeTab === 'pos' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">POS Categories (pos.category)</h2>
                    <button
                      onClick={() => downloadJSON(data.posCategories, 'pos-categories.json')}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                      📥 Download JSON
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">ID</th>
                          <th className="p-2 text-left">Name</th>
                          <th className="p-2 text-left">Parent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.posCategories as Array<{ id: number; name: string; parent_id?: [number, string] | false }>).map((cat) => (
                          <tr key={cat.id} className="border-b hover:bg-gray-50">
                            <td className="p-2">{cat.id}</td>
                            <td className="p-2 font-medium">{cat.name}</td>
                            <td className="p-2 text-xs">
                              {cat.parent_id ? `${cat.parent_id[0]} - ${cat.parent_id[1]}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Raw Data */}
          <details className="mt-6 bg-white rounded-lg shadow p-4">
            <summary className="cursor-pointer font-bold">Show Raw JSON Data</summary>
            <pre className="mt-4 text-xs overflow-x-auto bg-gray-50 p-4 rounded">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </>
  );
}

