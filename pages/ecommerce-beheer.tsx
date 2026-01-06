import { useState, useEffect } from 'react';
import Head from 'next/head';

interface ProductMissingWeight {
  id: number;
  name: string;
  display_name: string;
  product_tmpl_id?: [number, string];
  weight: number | null;
  barcode: string | null;
  default_code: string | null;
  qty_available?: number;
  list_price: number;
  type: 'variant' | 'template';
}

export default function EcommerceBeheerPage() {
  const [products, setProducts] = useState<ProductMissingWeight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [bulkWeight, setBulkWeight] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateType, setUpdateType] = useState<'variant' | 'template'>('variant');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ecommerce/products-missing-weight');
      if (!response.ok) {
        throw new Error('Failed to load products');
      }
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProduct = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const selectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map((p) => p.id)));
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedProducts.size === 0) {
      setError('Selecteer minimaal één product');
      return;
    }

    const weight = parseFloat(bulkWeight);
    if (isNaN(weight) || weight <= 0) {
      setError('Voer een geldig gewicht in (in kg)');
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/ecommerce/bulk-update-weight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productIds: Array.from(selectedProducts),
          weight,
          updateType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update weights');
      }

      const data = await response.json();
      setSuccessMessage(
        `Gewicht succesvol bijgewerkt voor ${data.updatedCount} product(en)`
      );

      // Clear selection and reload products
      setSelectedProducts(new Set());
      setBulkWeight('');
      setTimeout(() => {
        loadProducts();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update weights');
    } finally {
      setIsUpdating(false);
    }
  };

  const commonWeights = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0];

  return (
    <>
      <Head>
        <title>E-commerce Beheer - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              E-commerce Beheer - Gewicht Beheer
            </h1>

            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Overzicht van alle gepubliceerde productvarianten zonder gewicht. Selecteer varianten
              en wijs in bulk een gewicht toe. Alleen varianten worden getoond omdat deze daadwerkelijk verzonden worden.
            </p>

            {/* Bulk Update Controls */}
            {products.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Gewicht (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={bulkWeight}
                      onChange={(e) => setBulkWeight(e.target.value)}
                      placeholder="0.2"
                      className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-medium focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {commonWeights.map((w) => (
                        <button
                          key={w}
                          onClick={() => setBulkWeight(w.toString())}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                        >
                          {w}kg
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-[150px]">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Update Type
                    </label>
                    <select
                      value={updateType}
                      onChange={(e) =>
                        setUpdateType(e.target.value as 'variant' | 'template')
                      }
                      className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-medium focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="variant">Variant</option>
                      <option value="template">Template</option>
                    </select>
                  </div>

                  <div>
                    <button
                      onClick={handleBulkUpdate}
                      disabled={
                        isUpdating ||
                        selectedProducts.size === 0 ||
                        !bulkWeight ||
                        parseFloat(bulkWeight) <= 0
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {isUpdating
                        ? 'Bijwerken...'
                        : `Gewicht toekennen (${selectedProducts.size})`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-green-800 dark:text-green-200">{successMessage}</p>
              </div>
            )}

            {/* Products Table */}
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">Laden...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  Geen producten gevonden zonder gewicht.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={selectAll}
                      className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      {selectedProducts.size === products.length
                        ? 'Alles deselecteren'
                        : 'Alles selecteren'}
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedProducts.size} van {products.length} geselecteerd
                    </span>
                  </div>
                  <button
                    onClick={loadProducts}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    🔄 Vernieuwen
                  </button>
                </div>

                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={
                            products.length > 0 &&
                            selectedProducts.size === products.length
                          }
                          onChange={selectAll}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Barcode
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        SKU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Voorraad
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Prijs
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Gewicht
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {products.map((product) => (
                      <tr
                        key={product.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          selectedProducts.has(product.id)
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {product.display_name || product.name}
                          </div>
                          {product.product_tmpl_id && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Template: {product.product_tmpl_id[1]}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.barcode || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.default_code || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.qty_available ?? '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          €{product.list_price?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.weight ? `${product.weight}kg` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

