import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Head from 'next/head';

type VariantInfo = {
  id: number;
  displayName: string;
  qtyAvailable: number;
  barcode: string | null;
  defaultCode: string | null;
};

type ProductWithVariants = {
  templateId: number;
  templateName: string;
  totalVariants: number;
  emptyVariants: VariantInfo[];
};

type OdooCategory = {
  id: number;
  name: string;
};

function CategoryFilter({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: OdooCategory[];
  selectedCategoryId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedName = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)?.name ?? ''
    : '';

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Categorie
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md bg-white text-sm text-left hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={selectedCategoryId ? 'text-gray-900' : 'text-gray-400'}>
          {selectedCategoryId ? selectedName : 'Alle categorieën'}
        </span>
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 flex flex-col">
          <div className="p-2 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek categorie..."
              autoFocus
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                selectedCategoryId === null ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
              }`}
            >
              Alle categorieën
            </button>
            {filtered.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { onSelect(cat.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                  selectedCategoryId === cat.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">Geen resultaten</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArchiveerVarianten() {
  const { isLoading, isLoggedIn } = useAuth();
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [fetching, setFetching] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<OdooCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch('/api/odoo/fetch-categories', { method: 'POST', credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const sorted = (data.categories as OdooCategory[]).sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setCategories(sorted);
        }
      })
      .catch(() => {});
  }, [isLoggedIn]);

  const fetchProducts = useCallback(async (categId?: number | null) => {
    setFetching(true);
    setError(null);
    setSuccessMsg(null);
    setShowConfirmation(false);
    try {
      const url = categId
        ? `/api/odoo/archive-variants?categ_id=${categId}`
        : '/api/odoo/archive-variants';
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: ProductWithVariants[] = await res.json();
      setProducts(data);
      setHasFetched(true);

      const allIds = new Set<number>();
      for (const p of data) {
        for (const v of p.emptyVariants) {
          allIds.add(v.id);
        }
      }
      setSelectedVariantIds(allIds);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setFetching(false);
    }
  }, []);

  const toggleVariant = (id: number) => {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleProduct = (product: ProductWithVariants) => {
    const productVariantIds = product.emptyVariants.map((v) => v.id);
    const allSelected = productVariantIds.every((id) => selectedVariantIds.has(id));
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      for (const id of productVariantIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const selectAll = () => {
    const allIds = new Set<number>();
    for (const p of products) {
      for (const v of p.emptyVariants) {
        allIds.add(v.id);
      }
    }
    setSelectedVariantIds(allIds);
  };

  const deselectAll = () => {
    setSelectedVariantIds(new Set());
  };

  const handleArchive = async () => {
    if (selectedVariantIds.size === 0) return;
    setArchiving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/odoo/archive-variants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantIds: Array.from(selectedVariantIds) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const msg = data.archivedCount === data.totalRequested
        ? `${data.archivedCount} varianten succesvol gearchiveerd.`
        : `${data.archivedCount} van ${data.totalRequested} varianten gearchiveerd.`;
      setSuccessMsg(msg);
      if (data.errors) {
        setError(`Sommige batches faalden: ${data.errors.join('; ')}`);
      }
      setShowConfirmation(false);
      setProducts((prev) =>
        prev
          .map((p) => ({
            ...p,
            emptyVariants: p.emptyVariants.filter((v) => !selectedVariantIds.has(v.id)),
          }))
          .filter((p) => p.emptyVariants.length > 0)
      );
      setSelectedVariantIds(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Onbekende fout bij archiveren');
    } finally {
      setArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isLoggedIn) return null;

  const totalEmpty = products.reduce((sum, p) => sum + p.emptyVariants.length, 0);

  return (
    <>
      <Head>
        <title>Archiveer varianten - Babette Concept</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Archiveer varianten</h1>
          <p className="text-gray-600 mb-8">
            Archiveer productvarianten die uitverkocht zijn (voorraad = 0). Enkel varianten zonder
            voorraad worden getoond. Producten waarvan alle varianten leeg zijn worden overgeslagen
            (minstens één variant moet behouden blijven).
          </p>

          <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
            <div className="flex items-end gap-4 flex-wrap">
              <CategoryFilter
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onSelect={(id) => {
                  setSelectedCategoryId(id);
                  if (hasFetched) {
                    fetchProducts(id);
                  }
                }}
              />
              <button
                onClick={() => fetchProducts(selectedCategoryId)}
                disabled={fetching}
                className={`px-6 py-2 rounded-md text-white font-medium transition-colors ${
                  fetching
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {fetching ? 'Ophalen...' : hasFetched ? 'Vernieuwen' : 'Producten ophalen'}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-green-800 text-sm">{successMsg}</p>
              </div>
            )}

            {hasFetched && products.length === 0 && !fetching && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-blue-800 text-sm">
                  Geen producten gevonden met uitverkochte varianten die gearchiveerd kunnen worden.
                </p>
              </div>
            )}

            {hasFetched && products.length > 0 && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{products.length}</span> producten met{' '}
                    <span className="font-medium text-gray-900">{totalEmpty}</span> lege varianten gevonden
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-sm px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Alles selecteren
                    </button>
                    <button
                      onClick={deselectAll}
                      className="text-sm px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Niets selecteren
                    </button>
                    <button
                      onClick={() => fetchProducts(selectedCategoryId)}
                      disabled={fetching}
                      className="text-sm px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      {fetching ? 'Vernieuwen...' : 'Vernieuwen'}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {products.map((product) => {
                    const allSelected = product.emptyVariants.every((v) =>
                      selectedVariantIds.has(v.id)
                    );
                    const someSelected = product.emptyVariants.some((v) =>
                      selectedVariantIds.has(v.id)
                    );
                    return (
                      <div
                        key={product.templateId}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someSelected && !allSelected;
                            }}
                            onChange={() => toggleProduct(product)}
                            className="h-4 w-4 text-blue-600 rounded border-gray-300"
                          />
                          <div>
                            <h3 className="font-medium text-gray-900">{product.templateName}</h3>
                            <p className="text-xs text-gray-500">
                              {product.emptyVariants.length} lege van {product.totalVariants} varianten
                            </p>
                          </div>
                        </div>
                        <div className="ml-7 space-y-1">
                          {product.emptyVariants.map((variant) => (
                            <label
                              key={variant.id}
                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedVariantIds.has(variant.id)}
                                onChange={() => toggleVariant(variant.id)}
                                className="h-4 w-4 text-blue-600 rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">{variant.displayName}</span>
                              {variant.barcode && (
                                <span className="text-xs text-gray-400 ml-2">
                                  {variant.barcode}
                                </span>
                              )}
                              <span className="text-xs text-red-500 ml-auto">
                                voorraad: {variant.qtyAvailable}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!showConfirmation && (
                  <div className="pt-4 border-t">
                    <button
                      onClick={() => setShowConfirmation(true)}
                      disabled={selectedVariantIds.size === 0}
                      className={`w-full py-3 rounded-md font-medium transition-colors ${
                        selectedVariantIds.size === 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {selectedVariantIds.size === 0
                        ? 'Selecteer varianten om te archiveren'
                        : `${selectedVariantIds.size} varianten archiveren`}
                    </button>
                  </div>
                )}

                {showConfirmation && (
                  <div className="pt-4 border-t">
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
                      <h4 className="font-medium text-amber-900 mb-2">Bevestiging vereist</h4>
                      <p className="text-sm text-amber-800 mb-2">
                        Je staat op het punt om <strong>{selectedVariantIds.size} varianten</strong> te
                        archiveren. Deze varianten worden inactief gezet in Odoo. Dit kan ongedaan
                        gemaakt worden door ze later opnieuw te activeren.
                      </p>
                      {selectedVariantIds.size > 100 && (
                        <p className="text-sm text-amber-800">
                          De varianten worden in batches van 100 verwerkt
                          ({Math.ceil(selectedVariantIds.size / 100)} batches). Dit kan even duren.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowConfirmation(false)}
                        className="flex-1 py-3 rounded-md font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Annuleren
                      </button>
                      <button
                        onClick={handleArchive}
                        disabled={archiving}
                        className={`flex-1 py-3 rounded-md font-medium text-white transition-colors ${
                          archiving
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {archiving ? 'Bezig met archiveren...' : 'Ja, archiveer deze varianten'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
