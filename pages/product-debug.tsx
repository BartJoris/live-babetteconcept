import { useState } from 'react';
import Head from 'next/head';

export default function ProductDebug() {
  const [productId, setProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ 
    success: boolean; 
    productId: number; 
    template: Record<string, unknown>; 
    variants?: Array<{ 
      id: number; 
      display_name: string; 
      barcode?: string; 
      standard_price: number; 
      lst_price: number; 
      qty_available: number 
    }>;
    attributeLines?: Array<{
      id: number;
      display_name: string;
      value_count: number;
      attribute_id: [number, string];
    }>;
    publicCategories?: Array<{
      id: number;
      display_name: string;
    }>;
  } | null>(null);
  const [error, setError] = useState('');

  const fetchProduct = async () => {
    if (!productId) {
      setError('Please enter a product ID');
      return;
    }

    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    if (!uid || !password) {
      setError('No Odoo credentials found');
      return;
    }

    setLoading(true);
    setError('');
    setData(null);

    try {
      const response = await fetch(`/api/product-debug?id=${productId}&uid=${uid}&password=${encodeURIComponent(password)}`);
      const result = await response.json();

      if (result.success) {
        setData(result);
      } else {
        setError(result.error || 'Failed to fetch product');
      }
    } catch (err) {
      const error = err as { message?: string };
      setError(error.message || 'Failed to fetch product');
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-${productId}-debug.json`;
    a.click();
  };

  const copyToClipboard = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert('Copied to clipboard!');
  };

  return (
    <>
      <Head>
        <title>Product Debug - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🔍 Product Debug
            </h1>
            <p className="text-gray-800">
              Inspect complete product structure from Odoo
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchProduct()}
                placeholder="Enter Product Template ID (e.g., 7794)"
                className="flex-1 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={fetchProduct}
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? '⏳ Loading...' : '🔍 Fetch Product'}
              </button>
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded p-4 text-red-800">
                {error}
              </div>
            )}
          </div>

          {data && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-gray-800 text-sm mb-1">Product ID</div>
                  <div className="text-2xl font-bold">{data.productId}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-gray-800 text-sm mb-1">Variants</div>
                  <div className="text-2xl font-bold">{data.variants?.length || 0}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-gray-800 text-sm mb-1">Price</div>
                  <div className="text-2xl font-bold">€{String(data.template?.list_price || 0)}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-gray-800 text-sm mb-1">Cost Price</div>
                  <div className="text-2xl font-bold">€{String(data.template?.standard_price || 0)}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={downloadJSON}
                  className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                >
                  📥 Download JSON
                </button>
                <button
                  onClick={copyToClipboard}
                  className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700"
                >
                  📋 Copy to Clipboard
                </button>
              </div>

              {/* Template Info */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Product Template</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Name:</span>{' '}
                    <span className="text-gray-900">{String(data.template?.name || '')}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Category:</span>{' '}
                    <span className="text-gray-900">{String((data.template?.categ_id as [number, string] | undefined)?.[1] || '')}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Type:</span>{' '}
                    <span className="text-gray-900">{String(data.template?.type || '')}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Published:</span>{' '}
                    <span className="text-gray-900">{data.template?.website_published ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Public Categories:</span>{' '}
                    <span className="text-gray-900">{((data.template?.public_categ_ids as number[] | undefined)?.length || 0)} assigned</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Product Tags:</span>{' '}
                    <span className="text-gray-900">{((data.template?.product_tag_ids as number[] | undefined)?.length || 0)} assigned</span>
                  </div>
                </div>
              </div>

              {/* Variants */}
              {data.variants && data.variants.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Variants ({data.variants.length})</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-left">ID</th>
                          <th className="p-2 text-left">Name</th>
                          <th className="p-2 text-left">Barcode</th>
                          <th className="p-2 text-left">Cost Price</th>
                          <th className="p-2 text-left">List Price</th>
                          <th className="p-2 text-left">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.variants.map((variant) => (
                          <tr key={variant.id} className="border-b">
                            <td className="p-2">{variant.id}</td>
                            <td className="p-2 font-medium">{variant.display_name}</td>
                            <td className="p-2">
                              {variant.barcode ? (
                                <span className="text-green-600">{variant.barcode}</span>
                              ) : (
                                <span className="text-red-600">❌ Missing</span>
                              )}
                            </td>
                            <td className="p-2">
                              {variant.standard_price > 0 ? (
                                <span className="text-green-600">€{variant.standard_price}</span>
                              ) : (
                                <span className="text-red-600">€0 ❌</span>
                              )}
                            </td>
                            <td className="p-2">€{variant.lst_price}</td>
                            <td className="p-2">{variant.qty_available}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Attribute Lines */}
              {data.attributeLines && data.attributeLines.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Attributes</h2>
                  {data.attributeLines.map((attr) => (
                    <div key={attr.id} className="mb-4 pb-4 border-b last:border-0">
                      <div className="font-bold text-gray-900">{attr.display_name}</div>
                      <div className="text-sm text-gray-800 mt-1">
                        {attr.value_count} values • Attribute ID: {attr.attribute_id[0]}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Public Categories */}
              {data.publicCategories && data.publicCategories.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Public/eCommerce Categories</h2>
                  {data.publicCategories.map((cat) => (
                    <div key={cat.id} className="mb-2">
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm">
                        {cat.id} - {cat.display_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Raw JSON */}
              <details className="bg-white rounded-lg shadow p-6">
                <summary className="cursor-pointer font-bold text-gray-900">
                  Show Complete Raw JSON
                </summary>
                <pre className="mt-4 text-xs overflow-x-auto bg-gray-50 p-4 rounded">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

