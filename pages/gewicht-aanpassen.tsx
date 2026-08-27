import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import {
  groupVariantsByTemplate,
  type MissingWeightProductGroup,
  type MissingWeightVariant,
} from '@/lib/retail/missingWeight';

const DEFAULT_WEIGHT_KG = 0.2;
const COMMON_WEIGHTS = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0];

export default function GewichtAanpassenPage() {
  const [products, setProducts] = useState<MissingWeightProductGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(new Set());
  const [bulkWeight, setBulkWeight] = useState<string>(String(DEFAULT_WEIGHT_KG));
  const [isUpdating, setIsUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ecommerce/products-missing-weight');
      if (!response.ok) {
        throw new Error('Producten laden is mislukt');
      }
      const data: MissingWeightVariant[] = await response.json();
      setProducts(groupVariantsByTemplate(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Producten laden is mislukt');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const haystack = [
        product.name,
        product.barcode ?? '',
        product.defaultCode ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [products, search]);

  const selectedVariantCount = useMemo(() => {
    return products
      .filter((product) => selectedTemplates.has(product.templateId))
      .reduce((sum, product) => sum + product.variantCount, 0);
  }, [products, selectedTemplates]);

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => selectedTemplates.has(product.templateId));

  const toggleProduct = (templateId: number) => {
    const next = new Set(selectedTemplates);
    if (next.has(templateId)) {
      next.delete(templateId);
    } else {
      next.add(templateId);
    }
    setSelectedTemplates(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedTemplates);
    if (allFilteredSelected) {
      filteredProducts.forEach((product) => next.delete(product.templateId));
    } else {
      filteredProducts.forEach((product) => next.add(product.templateId));
    }
    setSelectedTemplates(next);
  };

  const handleBulkUpdate = async () => {
    if (selectedTemplates.size === 0) {
      setError('Selecteer minimaal één product');
      return;
    }

    const weight = parseFloat(bulkWeight.replace(',', '.'));
    if (Number.isNaN(weight) || weight <= 0) {
      setError('Voer een geldig gewicht in (in kg)');
      return;
    }

    const productIds = products
      .filter((product) => selectedTemplates.has(product.templateId))
      .flatMap((product) => product.variantIds);

    if (
      !confirm(
        `Gewicht van ${productIds.length} variant(en) aanpassen naar ${weight} kg?`
      )
    ) {
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/ecommerce/bulk-update-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds,
          weight,
          updateType: 'variant',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Gewicht bijwerken is mislukt');
      }

      const data = await response.json();
      setSuccessMessage(
        `Gewicht succesvol bijgewerkt voor ${data.updatedCount} variant(en)`
      );
      setSelectedTemplates(new Set());
      setTimeout(() => {
        void loadProducts();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gewicht bijwerken is mislukt');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Gewicht aanpassen - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Gewicht aanpassen
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Gepubliceerde webshopproducten waarvan het gewicht 0 kg is. Selecteer
              producten en ken in bulk een verzendgewicht toe (standaard {DEFAULT_WEIGHT_KG} kg).
            </p>

            {products.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label
                      htmlFor="bulk-weight"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Gewicht (kg)
                    </label>
                    <input
                      id="bulk-weight"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={bulkWeight}
                      onChange={(e) => setBulkWeight(e.target.value)}
                      className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-medium focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {COMMON_WEIGHTS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setBulkWeight(String(w))}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            parseFloat(bulkWeight) === w
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-700'
                          }`}
                        >
                          {w} kg
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => void handleBulkUpdate()}
                      disabled={
                        isUpdating ||
                        selectedTemplates.size === 0 ||
                        !bulkWeight ||
                        parseFloat(bulkWeight.replace(',', '.')) <= 0
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {isUpdating
                        ? 'Bijwerken...'
                        : `Gewicht toekennen (${selectedVariantCount})`}
                    </button>
                  </div>
                </div>
              </div>
            )}

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

            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">Laden...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  Geen gepubliceerde producten gevonden zonder gewicht.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-300 dark:border-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      {allFilteredSelected ? 'Alles deselecteren' : 'Alles selecteren'}
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedTemplates.size} van {filteredProducts.length} product(en)
                      geselecteerd
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Zoek op naam, SKU of barcode"
                      className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => void loadProducts()}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Vernieuwen
                    </button>
                  </div>
                </div>

                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={selectAllFiltered}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          aria-label="Alles selecteren"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        SKU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Barcode
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Varianten zonder gewicht
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Voorraad
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Prijs
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredProducts.map((product) => (
                      <tr
                        key={product.templateId}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          selectedTemplates.has(product.templateId)
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedTemplates.has(product.templateId)}
                            onChange={() => toggleProduct(product.templateId)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`Selecteer ${product.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {product.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.defaultCode || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.barcode || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.variantCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.qtyAvailable}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          €{product.listPrice?.toFixed(2) || '0.00'}
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
