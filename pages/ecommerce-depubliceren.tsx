import { useState, useEffect } from 'react';
import Head from 'next/head';

interface ProductNoStock {
  id: number;
  name: string;
  display_name: string;
  product_tmpl_id: [number, string];
  qty_available: number;
  list_price: number;
  website_published: boolean;
  total_variants: number;
  variants_with_stock: number;
  variants_with_unlimited: number;
  has_unlimited_stock: boolean;
}

interface ProductVariant {
  id: number;
  name: string;
  display_name: string;
  qty_available: number;
  barcode: string | null;
  default_code: string | null;
  list_price: number;
  standard_price: number;
}

export default function EcommerceDepublicerenPage() {
  const [products, setProducts] = useState<ProductNoStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(new Set());
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [variants, setVariants] = useState<Map<number, ProductVariant[]>>(new Map());
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);
  const [hideUnlimited, setHideUnlimited] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ecommerce/published-products-no-stock');
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

  const toggleTemplate = (templateId: number) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  const selectAll = () => {
    const filteredIds = filteredProducts.map((p) => p.id);
    const allFilteredSelected = filteredIds.every((id) => selectedTemplates.has(id));
    
    if (allFilteredSelected && filteredProducts.length > 0) {
      // Deselect all filtered products
      const newSelected = new Set(selectedTemplates);
      filteredIds.forEach((id) => newSelected.delete(id));
      setSelectedTemplates(newSelected);
    } else {
      // Select all filtered products
      const newSelected = new Set(selectedTemplates);
      filteredIds.forEach((id) => newSelected.add(id));
      setSelectedTemplates(newSelected);
    }
  };

  const handleBulkUnpublish = async () => {
    if (selectedTemplates.size === 0) {
      setError('Selecteer minimaal één product');
      return;
    }

    if (!confirm(`Weet je zeker dat je ${selectedTemplates.size} product(en) wilt depubliceren?`)) {
      return;
    }

    setIsUnpublishing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/ecommerce/bulk-unpublish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateIds: Array.from(selectedTemplates),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unpublish products');
      }

      const data = await response.json();
      setSuccessMessage(
        `${data.updatedCount} product(en) succesvol gedepubliceerd`
      );

      // Clear selection and reload products
      setSelectedTemplates(new Set());
      setSelectedProductId(null);
      setVariants(new Map());
      setTimeout(() => {
        loadProducts();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish products');
    } finally {
      setIsUnpublishing(false);
    }
  };

  const handleProductClick = async (productId: number) => {
    if (selectedProductId === productId) {
      // Close if already open
      setSelectedProductId(null);
      return;
    }

    setSelectedProductId(productId);
    
    // Check if variants are already loaded
    if (variants.has(productId)) {
      return;
    }

    setIsLoadingVariants(true);
    setError(null);

    try {
      const response = await fetch(`/api/ecommerce/template-variants?templateId=${productId}`);
      if (!response.ok) {
        throw new Error('Failed to load variants');
      }
      const data = await response.json();
      const newVariants = new Map(variants);
      newVariants.set(productId, data.variants || []);
      setVariants(newVariants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variants');
      setSelectedProductId(null);
    } finally {
      setIsLoadingVariants(false);
    }
  };

  // Filter products based on hideUnlimited setting
  const filteredProducts = hideUnlimited
    ? products.filter((p) => !p.has_unlimited_stock)
    : products;

  return (
    <>
      <Head>
        <title>E-commerce Depubliceren - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              E-commerce Depubliceren
            </h1>

            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Overzicht van alle gepubliceerde producten zonder beschikbare voorraad. 
              Selecteer producten om ze te depubliceren (niet meer zichtbaar in de webshop).
            </p>

            {/* Filter Controls */}
            <div className="mb-4 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideUnlimited}
                  onChange={(e) => setHideUnlimited(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Verberg producten met onbeperkte voorraad (-1)
                </span>
              </label>
              {hideUnlimited && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({products.length - filteredProducts.length} verborgen)
                </span>
              )}
            </div>

            {/* Bulk Unpublish Controls */}
            {filteredProducts.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      {selectedTemplates.size} product(en) geselecteerd
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-300">
                      Deze producten worden niet meer zichtbaar in de webshop na depubliceren
                    </p>
                  </div>
                  <button
                    onClick={handleBulkUnpublish}
                    disabled={isUnpublishing || selectedTemplates.size === 0}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isUnpublishing
                      ? 'Depubliceren...'
                      : `Depubliceren (${selectedTemplates.size})`}
                  </button>
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
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  {hideUnlimited && products.length > 0
                    ? 'Geen producten gevonden zonder onbeperkte voorraad.'
                    : 'Geen gepubliceerde producten gevonden zonder voorraad.'}
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
                      {selectedTemplates.size === filteredProducts.length && filteredProducts.length > 0
                        ? 'Alles deselecteren'
                        : 'Alles selecteren'}
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedTemplates.size} van {filteredProducts.length} geselecteerd
                      {hideUnlimited && products.length > filteredProducts.length && (
                        <span className="text-gray-400 dark:text-gray-500 ml-1">
                          ({products.length} totaal)
                        </span>
                      )}
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
                            filteredProducts.length > 0 &&
                            selectedTemplates.size === filteredProducts.length
                          }
                          onChange={selectAll}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Varianten
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Voorraad
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Prijs
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredProducts.map((product) => (
                      <>
                        <tr
                          key={product.id}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                            selectedTemplates.has(product.id)
                              ? 'bg-yellow-50 dark:bg-yellow-900/20'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedTemplates.has(product.id)}
                              onChange={() => toggleTemplate(product.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => handleProductClick(product.id)}
                              className="text-left hover:underline cursor-pointer"
                            >
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {product.display_name || product.name}
                                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                                  {selectedProductId === product.id ? '▼' : '▶'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Template ID: {product.id}
                              </div>
                            </button>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {product.total_variants} totaal
                            {product.variants_with_stock > 0 && (
                              <span className="text-green-600 dark:text-green-400 ml-1">
                                ({product.variants_with_stock} met voorraad)
                              </span>
                            )}
                            {product.variants_with_unlimited > 0 && (
                              <span className="text-purple-600 dark:text-purple-400 ml-1">
                                ({product.variants_with_unlimited} onbeperkt)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {product.has_unlimited_stock ? (
                              <span className="font-medium text-purple-600 dark:text-purple-400">
                                Onbeperkt (-1)
                              </span>
                            ) : (
                              <span className="font-medium text-red-600 dark:text-red-400">
                                {product.qty_available}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            €{typeof product.list_price === 'number' ? product.list_price.toFixed(2) : '0.00'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              Gepubliceerd
                            </span>
                          </td>
                        </tr>
                        {selectedProductId === product.id && (
                          <tr key={`variant-${product.id}`}>
                            <td colSpan={6} className="px-4 py-4 bg-gray-50 dark:bg-gray-700/50">
                              {isLoadingVariants ? (
                                <div className="text-center py-4">
                                  <p className="text-gray-600 dark:text-gray-400">Varianten laden...</p>
                                </div>
                              ) : (() => {
                                const productVariants = variants.get(product.id) || [];
                                if (productVariants.length === 0) {
                                  return (
                                    <div className="text-center py-4">
                                      <p className="text-gray-600 dark:text-gray-400">Geen varianten gevonden</p>
                                    </div>
                                  );
                                }
                                return (
                                  <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                      Varianten ({productVariants.length})
                                    </h3>
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                                        <thead className="bg-gray-100 dark:bg-gray-800">
                                          <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                              Variant
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                              Barcode
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                              SKU
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                              Voorraad
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                              Verkoopprijs
                                            </th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                                              Kostprijs
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                          {productVariants.map((variant) => (
                                            <tr
                                              key={variant.id}
                                              className="hover:bg-gray-50 dark:hover:bg-gray-800"
                                            >
                                              <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                                                {variant.display_name || variant.name}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                                {variant.barcode || '-'}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                                {variant.default_code || '-'}
                                              </td>
                                              <td className="px-3 py-2 text-sm">
                                                {variant.qty_available === -1 ? (
                                                  <span className="font-medium text-purple-600 dark:text-purple-400">
                                                    Onbeperkt (-1)
                                                  </span>
                                                ) : variant.qty_available > 0 ? (
                                                  <span className="font-medium text-green-600 dark:text-green-400">
                                                    {variant.qty_available}
                                                  </span>
                                                ) : (
                                                  <span className="font-medium text-red-600 dark:text-red-400">
                                                    {variant.qty_available}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                                €{typeof variant.list_price === 'number' ? variant.list_price.toFixed(2) : '0.00'}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                                €{typeof variant.standard_price === 'number' ? variant.standard_price.toFixed(2) : '0.00'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </>
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

