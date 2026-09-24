import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  applyAltTextUpdates,
  buildSuggestedUpdates,
  needsAltTextFix,
  productHasCorrectAltText,
  productNeedsAltTextFix,
  sortGalleryImages,
  suggestedAltText,
} from '@/lib/seo/altText';
import type { SeoAltTextUpdate, SeoProductItem } from '@/lib/seo/types';

type SortColumn = 'name' | 'brand' | 'imageCount' | 'status';
type SortDirection = 'asc' | 'desc';

interface GalleryImage {
  id: number;
  name: string;
  image: string;
  sequence: number;
}

interface TemplateImages {
  mainImage: string | null;
  galleryImages: GalleryImage[];
}

const UPDATE_CHUNK_SIZE = 40;

async function postAltTextUpdates(
  updates: SeoAltTextUpdate[]
): Promise<{ updatedCount: number; failed: number; saved: SeoAltTextUpdate[] }> {
  const saved: SeoAltTextUpdate[] = [];
  let failed = 0;
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);
    const res = await fetch('/api/seo/update-alt-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ updates: chunk }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    const byId = new Map(chunk.map((update) => [update.imageId, update]));
    const results = payload.results as Array<{ imageId: number; success: boolean }> | undefined;
    if (results) {
      results.forEach((result) => {
        if (!result.success) {
          failed += 1;
          return;
        }
        const update = byId.get(result.imageId);
        if (update) saved.push(update);
      });
    }
  }
  return { updatedCount: saved.length, failed, saved };
}

function statusRank(product: SeoProductItem): number {
  if (productNeedsAltTextFix(product)) return 0;
  if (productHasCorrectAltText(product)) return 2;
  return 1;
}

export default function SeoAltTekstPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [products, setProducts] = useState<SeoProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedBrand, setSelectedBrand] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [imagesMap, setImagesMap] = useState<Map<number, TemplateImages>>(new Map());
  const [loadingImageIds, setLoadingImageIds] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [isBulkPending, setIsBulkPending] = useState(false);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/seo/products', { credentials: 'same-origin' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Kan producten niet laden');
      }
      const data: SeoProductItem[] = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kan producten niet laden');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || authLoading) return;
    void loadProducts();
  }, [isLoggedIn, authLoading, loadProducts]);

  const loadTemplateImages = useCallback(async (templateId: number): Promise<TemplateImages | null> => {
    setLoadingImageIds((prev) => new Set(prev).add(templateId));
    try {
      const maxRetries = 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(
            `/api/product-check/template-images?templateId=${templateId}`,
            { credentials: 'same-origin' }
          );
          if (response.status === 429) {
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
              continue;
            }
            throw new Error('Te veel verzoeken, probeer later opnieuw');
          }
          if (!response.ok) throw new Error('Kan afbeeldingen niet laden');
          const data: TemplateImages = await response.json();
          setImagesMap((prev) => new Map(prev).set(templateId, data));
          return data;
        } catch (err) {
          if (attempt === maxRetries) {
            setError(err instanceof Error ? err.message : 'Kan afbeeldingen niet laden');
          }
        }
      }
      return null;
    } finally {
      setLoadingImageIds((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    }
  }, []);

  const applyLocalUpdates = useCallback((updates: SeoAltTextUpdate[]) => {
    setProducts((prev) =>
      prev.map((product) => ({
        ...product,
        galleryImages: applyAltTextUpdates(product.galleryImages, updates),
      }))
    );
    setImagesMap((prev) => {
      const next = new Map(prev);
      next.forEach((tpl, templateId) => {
        next.set(templateId, {
          ...tpl,
          galleryImages: tpl.galleryImages.map((img) => {
            const match = updates.find((update) => update.imageId === img.id);
            return match ? { ...img, name: match.altText } : img;
          }),
        });
      });
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      updates.forEach((update) => {
        next[update.imageId] = update.altText;
      });
      return next;
    });
  }, []);

  const saveUpdates = useCallback(async (updates: SeoAltTextUpdate[]) => {
    if (updates.length === 0) return;
    const imageIds = updates.map((update) => update.imageId);
    setSavingIds((prev) => {
      const next = new Set(prev);
      imageIds.forEach((id) => next.add(id));
      return next;
    });
    setError(null);
    try {
      const { updatedCount, failed, saved } = await postAltTextUpdates(updates);
      applyLocalUpdates(saved);
      setSuccessMessage(
        failed > 0
          ? `${updatedCount} alt-tekst(en) opgeslagen, ${failed} mislukt`
          : `${updatedCount} alt-tekst(en) opgeslagen`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        imageIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [applyLocalUpdates]);

  const toggleExpanded = (productId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
        if (!imagesMap.has(productId)) void loadTemplateImages(productId);
      }
      return next;
    });
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return ' \u2195';
    return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
  };

  const uniqueBrands = useMemo(() => {
    return [...new Set(products.map((p) => p.brand).filter(Boolean))] as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedBrand && p.brand !== selectedBrand) return false;
      if (onlyMissing && !productNeedsAltTextFix(p)) return false;
      if (query) {
        const haystack = `${p.name} ${p.defaultCode ?? ''} ${p.brand ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [onlyMissing, products, search, selectedBrand]);

  const sortedProducts = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filteredProducts].sort((a, b) => {
      switch (sortColumn) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'brand':
          return dir * (a.brand || '').localeCompare(b.brand || '');
        case 'imageCount':
          return dir * (a.imageCount - b.imageCount);
        case 'status':
          return dir * (statusRank(a) - statusRank(b));
        default: {
          const _exhaustive: never = sortColumn;
          return _exhaustive;
        }
      }
    });
  }, [filteredProducts, sortColumn, sortDirection]);

  const stats = useMemo(() => {
    return {
      total: filteredProducts.length,
      needsFix: filteredProducts.filter(productNeedsAltTextFix).length,
      correct: filteredProducts.filter(productHasCorrectAltText).length,
      noGallery: filteredProducts.filter((p) => p.galleryImages.length === 0).length,
    };
  }, [filteredProducts]);

  const pendingBulkUpdates = useMemo(
    () => buildSuggestedUpdates(filteredProducts, { onlyMissing: true }),
    [filteredProducts]
  );

  const handleBulkGenerate = async () => {
    if (pendingBulkUpdates.length === 0) return;
    const confirmed = window.confirm(
      `Alt-tekst genereren voor ${pendingBulkUpdates.length} afbeelding(en) in ${stats.needsFix} product(en)?`
    );
    if (!confirmed) return;
    setIsBulkPending(true);
    try {
      await saveUpdates(pendingBulkUpdates);
    } finally {
      setIsBulkPending(false);
    }
  };

  const renderStatus = (product: SeoProductItem) => {
    if (productNeedsAltTextFix(product)) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
          Te fixen
        </span>
      );
    }
    if (productHasCorrectAltText(product)) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
          OK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
        Geen extra foto&apos;s
      </span>
    );
  };

  const renderImagePanel = (product: SeoProductItem) => {
    const tplImages = imagesMap.get(product.id);
    const isLoadingThis = loadingImageIds.has(product.id);

    if (isLoadingThis) {
      return (
        <div className="text-center py-6 text-gray-500">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2" />
          <p className="text-sm">Afbeeldingen laden...</p>
        </div>
      );
    }

    if (!tplImages) {
      return (
        <p className="text-sm text-gray-500">Kon afbeeldingen niet laden.</p>
      );
    }

    const gallery = sortGalleryImages(tplImages.galleryImages);
    const productUpdates = buildSuggestedUpdates([product], { onlyMissing: true });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Gallery-alt-tekst volgt het formaat <span className="font-medium">Product - 1 - Babette Oostduinkerke</span>.
            De hoofdafbeelding gebruikt op de webshop de productnaam.
          </p>
          {productUpdates.length > 0 && (
            <button
              onClick={() => void saveUpdates(productUpdates)}
              disabled={isBulkPending || productUpdates.some((u) => savingIds.has(u.imageId))}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Alles toepassen voor dit product
            </button>
          )}
        </div>

        {tplImages.mainImage && (
          <div className="flex gap-3 items-start">
            <div className="relative w-24 flex-shrink-0">
              <div className="aspect-square rounded-lg overflow-hidden border-2 border-blue-500 bg-gray-100">
                <img
                  src={`data:image/jpeg;base64,${tplImages.mainImage}`}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                HOOFD
              </span>
            </div>
            <div className="pt-1">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Hoofdafbeelding</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Alt-tekst op de webshop: {product.name}
              </p>
            </div>
          </div>
        )}

        {gallery.length === 0 ? (
          <p className="text-sm text-gray-500">Dit product heeft geen extra (gallery) afbeeldingen om te hernoemen.</p>
        ) : (
          <div className="space-y-3">
            {gallery.map((img, index) => {
              const suggested = suggestedAltText(product.name, index);
              const storedName = product.galleryImages.find((g) => g.id === img.id)?.name ?? img.name;
              const draft = drafts[img.id] ?? storedName;
              const needsFix = needsAltTextFix(storedName, suggested);
              const isSaving = savingIds.has(img.id);
              const canSave = draft.trim().length > 0 && draft.trim() !== storedName.trim();

              return (
                <div
                  key={img.id}
                  className={`flex flex-col sm:flex-row gap-3 p-3 rounded-lg border ${
                    needsFix
                      ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
                  }`}
                >
                  <div className="w-24 flex-shrink-0">
                    <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                      <img
                        src={`data:image/jpeg;base64,${img.image}`}
                        alt={storedName || product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">#{img.sequence || index + 1}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Huidige alt-tekst
                      <input
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [img.id]: e.target.value }))}
                        className="mt-1 w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Suggestie: <span className="font-medium text-gray-700 dark:text-gray-300">{suggested}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDrafts((prev) => ({ ...prev, [img.id]: suggested }))}
                        className="px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800/40"
                      >
                        Pas suggestie toe
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveUpdates([{ imageId: img.id, altText: draft }])}
                        disabled={isSaving || !canSave}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Opslaan...' : 'Opslaan'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center py-16 text-gray-500">Laden...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>SEO Alt Tekst - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Alt-tekst afbeeldingen
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Geef extra productfoto&apos;s een logische alt-tekst in het formaat Product - 1 - Babette Oostduinkerke.
            </p>

            <div className="flex flex-wrap gap-4 mb-6">
              <div className="min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Merk</label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Alle merken</option>
                  {uniqueBrands.sort((a, b) => a.localeCompare(b)).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="min-w-[220px] flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zoeken</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Product, referentie of merk"
                  className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <label className="flex items-end gap-2 pb-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={onlyMissing}
                  onChange={(e) => setOnlyMissing(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Alleen ontbrekende alt-tekst
              </label>

              <div className="flex items-end gap-2">
                <button
                  onClick={() => void loadProducts()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Vernieuwen
                </button>
                <button
                  onClick={() => void handleBulkGenerate()}
                  disabled={isBulkPending || pendingBulkUpdates.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isBulkPending
                    ? 'Bezig...'
                    : `Genereer alt-tekst voor alle (${pendingBulkUpdates.length})`}
                </button>
              </div>
            </div>

            {!isLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.total}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Totaal producten</div>
                </div>
                <div className={`border rounded-lg p-3 text-center ${stats.needsFix > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                  <div className={`text-2xl font-bold ${stats.needsFix > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{stats.needsFix}</div>
                  <div className={`text-xs ${stats.needsFix > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>Zonder goede alt-tekst</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.correct}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">Reeds correct</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-700 dark:text-gray-200">{stats.noGallery}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Geen extra foto&apos;s</div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200">{error}</p>
                <button onClick={() => setError(null)} className="mt-1 text-sm text-red-600 dark:text-red-400 underline">Sluiten</button>
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-green-800 dark:text-green-200">{successMessage}</p>
                <button onClick={() => setSuccessMessage(null)} className="mt-1 text-sm text-green-700 dark:text-green-400 underline">Sluiten</button>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Producten laden...</p>
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">Geen producten gevonden.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      {([
                        ['name', 'Product', 'text-left'],
                        ['brand', 'Merk', 'text-left'],
                        ['imageCount', 'Afbeeldingen', 'text-center'],
                        ['status', 'Status', 'text-center'],
                      ] as [SortColumn, string, string][]).map(([col, label, align]) => (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className={`px-4 py-3 ${align} text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-white transition-colors`}
                        >
                          {label}{sortIndicator(col)}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedProducts.map((product) => (
                      <React.Fragment key={product.id}>
                        <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${expandedIds.has(product.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{product.name}</div>
                            {product.defaultCode && <div className="text-xs text-gray-500 dark:text-gray-400">{product.defaultCode}</div>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{product.brand || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              product.imageCount === 0
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            }`}>
                              {product.imageCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">{renderStatus(product)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => toggleExpanded(product.id)}
                              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                                expandedIds.has(product.id)
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                              }`}
                            >
                              {expandedIds.has(product.id) ? 'Sluiten' : 'Afbeeldingen'}
                            </button>
                          </td>
                        </tr>
                        {expandedIds.has(product.id) && (
                          <tr>
                            <td colSpan={5} className="px-4 py-4 bg-gray-50 dark:bg-gray-900/40">
                              {renderImagePanel(product)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
