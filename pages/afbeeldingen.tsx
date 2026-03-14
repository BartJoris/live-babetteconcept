import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

interface Product {
  id: number;
  name: string;
  defaultCode: string | null;
  brand: string | null;
}

interface StagedImage {
  id: string;
  dataUrl: string;
  filename: string;
  order: number;
}

interface ProductState {
  expanded: boolean;
  staged: StagedImage[];
  uploading: boolean;
  uploaded: boolean;
  uploadCount: number;
  urlInput: string;
  urlLoading: boolean;
  error: string | null;
}

let _imgId = 0;

function compressDataUrl(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context not available')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = source;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AfbeeldingenPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [productStates, setProductStates] = useState<Record<number, ProductState>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const getCredentials = () => ({
    uid: localStorage.getItem('odoo_uid'),
    password: localStorage.getItem('odoo_pass'),
  });

  const getState = useCallback((id: number): ProductState =>
    productStates[id] || {
      expanded: true,
      staged: [],
      uploading: false,
      uploaded: false,
      uploadCount: 0,
      urlInput: '',
      urlLoading: false,
      error: null,
    }, [productStates]);

  const patchState = (id: number, patch: Partial<ProductState>) => {
    setProductStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || getState(id)), ...patch },
    }));
  };

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ecommerce/published-products-no-images');
      if (!res.ok) throw new Error('Failed to load products');
      setProducts(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setIsLoading(false);
    }
  };

  const brands = Array.from(
    new Set(products.map((p) => p.brand).filter(Boolean) as string[])
  ).sort();

  const filtered = products.filter((p) => {
    if (brandFilter && p.brand !== brandFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.defaultCode?.toLowerCase().includes(q))) return false;
    }
    if (hideCompleted && getState(p.id).uploaded) return false;
    return true;
  });

  const completedCount = products.filter((p) => getState(p.id).uploaded).length;

  // --- Image staging ---

  const stageFiles = useCallback(async (productId: number, files: FileList | File[]) => {
    const state = getState(productId);
    const newStaged: StagedImage[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name) && !file.type.startsWith('image/')) continue;
      const dataUrl = await readFileAsDataUrl(file);
      newStaged.push({
        id: `img-${++_imgId}`,
        dataUrl,
        filename: file.name,
        order: state.staged.length + newStaged.length,
      });
    }
    patchState(productId, { staged: [...state.staged, ...newStaged], expanded: true, error: null });
  }, [productStates]);

  const stageFromUrl = useCallback(async (productId: number) => {
    const state = getState(productId);
    const url = state.urlInput.trim();
    if (!url) return;

    patchState(productId, { urlLoading: true, error: null });
    try {
      const res = await fetch('/api/upload-image-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ophalen mislukt');

      const dataUrl = `data:${data.mimeType};base64,${data.base64}`;
      const stateNow = getState(productId);
      patchState(productId, {
        urlLoading: false,
        urlInput: '',
        staged: [...stateNow.staged, {
          id: `img-${++_imgId}`,
          dataUrl,
          filename: url.split('/').pop() || 'image.jpg',
          order: stateNow.staged.length,
        }],
      });
    } catch (err) {
      patchState(productId, {
        urlLoading: false,
        error: err instanceof Error ? err.message : 'Ophalen mislukt',
      });
    }
  }, [productStates]);

  const removeStaged = (productId: number, imageId: string) => {
    const state = getState(productId);
    const updated = state.staged.filter((i) => i.id !== imageId);
    updated.forEach((img, idx) => { img.order = idx; });
    patchState(productId, { staged: updated });
  };

  const moveStaged = (productId: number, imageId: string, direction: 'left' | 'right') => {
    const state = getState(productId);
    const sorted = [...state.staged].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((i) => i.id === imageId);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const tmpOrder = sorted[idx].order;
    sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
    sorted[swapIdx] = { ...sorted[swapIdx], order: tmpOrder };
    patchState(productId, { staged: sorted });
  };

  // --- Upload ---

  const uploadProduct = useCallback(async (productId: number) => {
    const product = products.find((p) => p.id === productId);
    const state = getState(productId);
    if (!product || state.staged.length === 0) return;

    const { uid, password } = getCredentials();
    if (!uid || !password) {
      patchState(productId, { error: 'Niet ingelogd. Herlaad de pagina.' });
      return;
    }

    patchState(productId, { uploading: true, error: null });

    try {
      const sorted = [...state.staged].sort((a, b) => a.order - b.order);
      let count = 0;

      for (let i = 0; i < sorted.length; i++) {
        const img = sorted[i];
        const compressed = await compressDataUrl(img.dataUrl);
        const base64 = compressed.split(',')[1];
        const isMain = i === 0;
        const sequence = i + 1;
        const name = `${product.name} - Image ${sequence}`;

        const res = await fetch('/api/upload-single-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: productId,
            base64Image: base64,
            imageName: name,
            sequence: isMain ? 0 : sequence,
            isMainImage: isMain,
            odooUid: uid,
            odooPassword: password,
          }),
        });
        const data = await res.json();
        if (data.success) count++;
      }

      patchState(productId, {
        uploading: false,
        uploaded: true,
        uploadCount: count,
        staged: [],
      });
    } catch (err) {
      patchState(productId, {
        uploading: false,
        error: err instanceof Error ? err.message : 'Upload mislukt',
      });
    }
  }, [products, productStates]);

  const handleDrop = useCallback((e: React.DragEvent, productId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) stageFiles(productId, e.dataTransfer.files);
  }, [stageFiles]);

  const openGoogleSearch = (name: string) => {
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name)}`, '_blank');
  };

  return (
    <>
      <Head><title>Afbeeldingen | Babette POS</title></Head>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Afbeeldingen</h1>
          <p className="mt-2 text-gray-600">
            Gepubliceerde producten zonder afbeelding.
            {!isLoading && (
              <span className="ml-1 font-medium">
                {filtered.length} van {products.length} producten
                {completedCount > 0 && (
                  <span className="text-green-600 ml-2">({completedCount} afgehandeld)</span>
                )}
              </span>
            )}
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Zoek op productnaam of referentie..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Alle merken</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Verberg afgehandeld
          </label>
          <button
            onClick={loadProducts}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Laden...' : 'Vernieuwen'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
            <p>Producten laden...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            {products.length === 0
              ? 'Alle gepubliceerde producten hebben een afbeelding!'
              : 'Geen producten gevonden met deze filters.'}
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((product) => {
              const state = getState(product.id);
              const sorted = [...state.staged].sort((a, b) => a.order - b.order);

              return (
                <div
                  key={product.id}
                  className={`border rounded-lg transition-all ${
                    state.uploaded
                      ? 'border-green-300 bg-green-50'
                      : state.staged.length > 0
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Product header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {state.uploaded && (
                        <span className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {product.defaultCode && (
                            <span className="font-mono">{product.defaultCode}</span>
                          )}
                          {product.brand && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{product.brand}</span>
                          )}
                          {state.uploaded && (
                            <span className="text-green-600">
                              {state.uploadCount} afbeelding{state.uploadCount !== 1 ? 'en' : ''} geupload
                            </span>
                          )}
                          {state.staged.length > 0 && !state.uploaded && (
                            <span className="text-blue-600">
                              {state.staged.length} klaar om te uploaden
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => openGoogleSearch(product.name)}
                        title="Zoek op Google Images"
                        className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Google
                      </button>
                      <button
                        onClick={() => patchState(product.id, { expanded: !state.expanded })}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          state.expanded
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {state.expanded ? 'Sluiten' : 'Toevoegen'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {state.expanded && (
                    <div className="border-t border-gray-200 p-4 space-y-4">
                      {/* Staged images with reorder / delete */}
                      {sorted.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-2">
                            Afbeeldingen ({sorted.length}) — eerste = hoofdafbeelding
                          </div>
                          <div className="flex gap-3 flex-wrap items-start">
                            {sorted.map((img, idx) => (
                              <div key={img.id} className="relative group w-32 flex-shrink-0">
                                <div className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-100">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                                </div>
                                {idx === 0 && (
                                  <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                    HOOFD
                                  </span>
                                )}
                                <p className="text-[10px] text-gray-500 truncate mt-1">{img.filename}</p>
                                {/* Hover overlay with actions */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => moveStaged(product.id, img.id, 'left')}
                                    disabled={idx === 0}
                                    className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100"
                                  >
                                    &larr;
                                  </button>
                                  <button
                                    onClick={() => moveStaged(product.id, img.id, 'right')}
                                    disabled={idx === sorted.length - 1}
                                    className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100"
                                  >
                                    &rarr;
                                  </button>
                                  <button
                                    onClick={() => removeStaged(product.id, img.id)}
                                    className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600"
                                  >
                                    &times;
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Add more button inline */}
                            <label className="w-32 aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors flex-shrink-0">
                              <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files?.length) stageFiles(product.id, e.target.files);
                                  e.target.value = '';
                                }}
                              />
                              <span className="text-2xl text-gray-400">+</span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Input methods when no images staged yet */}
                      {sorted.length === 0 && (
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* Drag & drop zone */}
                          <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => handleDrop(e, product.id)}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
                            onClick={() => fileInputRefs.current[product.id]?.click()}
                          >
                            <input
                              ref={(el) => { fileInputRefs.current[product.id] = el; }}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.length) stageFiles(product.id, e.target.files);
                                e.target.value = '';
                              }}
                            />
                            <svg className="mx-auto h-8 w-8 mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-gray-500">Sleep afbeeldingen hierheen of klik om te selecteren</p>
                          </div>

                          {/* URL input */}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">Afbeelding URL</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="https://..."
                                value={state.urlInput}
                                onChange={(e) => patchState(product.id, { urlInput: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') stageFromUrl(product.id); }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <button
                                onClick={() => stageFromUrl(product.id)}
                                disabled={state.urlLoading || !state.urlInput.trim()}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                              >
                                {state.urlLoading ? 'Laden...' : 'Ophalen'}
                              </button>
                            </div>
                            <p className="text-xs text-gray-400">
                              Zoek op Google, kopieer de afbeeldings-URL en plak hier.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* URL input when images ARE already staged */}
                      {sorted.length > 0 && (
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Extra via URL</label>
                            <input
                              type="text"
                              placeholder="https://..."
                              value={state.urlInput}
                              onChange={(e) => patchState(product.id, { urlInput: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') stageFromUrl(product.id); }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <button
                            onClick={() => stageFromUrl(product.id)}
                            disabled={state.urlLoading || !state.urlInput.trim()}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                          >
                            {state.urlLoading ? 'Laden...' : 'Ophalen'}
                          </button>
                        </div>
                      )}

                      {state.error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                          {state.error}
                        </div>
                      )}

                      {/* Upload button */}
                      {sorted.length > 0 && !state.uploaded && (
                        <button
                          onClick={() => uploadProduct(product.id)}
                          disabled={state.uploading}
                          className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                            state.uploading
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {state.uploading
                            ? 'Uploaden...'
                            : `Upload ${sorted.length} afbeelding${sorted.length !== 1 ? 'en' : ''} naar Odoo`}
                        </button>
                      )}

                      {/* Success message */}
                      {state.uploaded && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {state.uploadCount} afbeelding{state.uploadCount !== 1 ? 'en' : ''} succesvol geupload!
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
