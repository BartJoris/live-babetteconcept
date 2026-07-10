import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSupplier, getAllSuppliers } from '@/lib/suppliers';
import type { SupplierPlugin } from '@/lib/suppliers/types';
import { supportsDirectoryPicker, isIOS } from '@/lib/import/shared/browser-utils';
import { compressImage } from '@/lib/import/shared/image-utils';

interface ExistingImage {
  id: number;
  name: string;
  thumbnail: string;
  sequence: number;
}

interface OdooProduct {
  templateId: number;
  name: string;
  internalRef: string;
  hasImage: boolean;
  mainThumbnail: string | null;
  galleryImages: ExistingImage[];
  createDate: string;
  isFavorite: boolean;
  isPublished: boolean;
  variantCount: number;
}

interface ImageItem {
  id: string;
  dataUrl: string;
  filename: string;
  file: File;
  assignedTemplateId: number | null;
  order: number;
}

type FilterMode = 'all' | 'favorites' | 'no-images' | 'recent';

let _imgId = 0;

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isRecent(dateStr: string, days: number = 7): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

export default function ImageUploadPage() {
  const router = useRouter();
  const { vendor } = router.query;

  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [plugin, setPlugin] = useState<SupplierPlugin | null>(null);
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [uploadResults, setUploadResults] = useState<Array<{ templateId: number; name: string; success: boolean; count: number; error?: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (vendor && typeof vendor === 'string') {
      setSelectedVendor(vendor);
      const p = getSupplier(vendor);
      if (p) setPlugin(p);
    }
  }, [vendor]);

  useEffect(() => {
    if (selectedVendor && plugin) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor, plugin]);

  const getCredentials = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      if (data.isLoggedIn && data.user) {
        const password = localStorage.getItem('odoo_pass');
        if (password) return { uid: String(data.user.uid), password };
      }
    } catch { /* fallback */ }
    return { uid: localStorage.getItem('odoo_uid'), password: localStorage.getItem('odoo_pass') };
  };

  const loadProducts = async () => {
    if (!plugin) return;
    setIsLoading(true);
    try {
      const { uid, password } = await getCredentials();
      if (!uid || !password) { alert('Geen Odoo credentials. Log eerst in.'); setIsLoading(false); return; }

      const response = await fetch('/api/search-products-by-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: plugin.brandName, uid, password }),
      });
      const data = await response.json();

      if (data.success && data.products) {
        setProducts(data.products.map((p: { template_id: number; internalRef?: string; name: string; hasImage: boolean; mainThumbnail?: string | null; galleryImages?: ExistingImage[]; createDate: string; isFavorite: boolean; isPublished: boolean; variantCount: number }) => ({
          templateId: p.template_id,
          name: p.name,
          internalRef: p.internalRef || '',
          hasImage: p.hasImage,
          mainThumbnail: p.mainThumbnail || null,
          galleryImages: p.galleryImages || [],
          isFavorite: p.isFavorite,
          isPublished: p.isPublished,
          createDate: p.createDate,
          variantCount: p.variantCount,
        })));
      }
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVendorSelect = (vendorId: string) => {
    setSelectedVendor(vendorId);
    const p = getSupplier(vendorId);
    setPlugin(p || null);
    setImages([]);
    setUploadResults([]);
    setSelectedTemplateIds(new Set());
    router.replace(`/image-upload?vendor=${vendorId}`, undefined, { shallow: true });
  };

  const filteredProducts = useMemo(() => {
    let result = products;
    if (filterMode === 'favorites') result = result.filter(p => p.isFavorite);
    else if (filterMode === 'no-images') result = result.filter(p => !p.hasImage);
    else if (filterMode === 'recent') result = result.filter(p => isRecent(p.createDate));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.internalRef.toLowerCase().includes(q));
    }
    return result;
  }, [products, filterMode, searchQuery]);

  const filterCounts = useMemo(() => ({
    all: products.length,
    favorites: products.filter(p => p.isFavorite).length,
    noImages: products.filter(p => !p.hasImage).length,
    recent: products.filter(p => isRecent(p.createDate)).length,
  }), [products]);

  const toggleProduct = (id: number) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      for (const p of filteredProducts) next.add(p.templateId);
      return next;
    });
  };

  const deselectAll = () => setSelectedTemplateIds(new Set());

  const activeProducts = useMemo(() =>
    products.filter(p => selectedTemplateIds.has(p.templateId)),
    [products, selectedTemplateIds]
  );

  const productById = useMemo(() => {
    const map = new Map<number, OdooProduct>();
    for (const p of products) map.set(p.templateId, p);
    return map;
  }, [products]);

  const addImages = useCallback(async (files: FileList | File[]) => {
    const imgConfig = plugin?.imageUpload;
    const newImages: ImageItem[] = [];

    for (const file of Array.from(files)) {
      if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) continue;

      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Kon bestand niet lezen: ${file.name}`));
        reader.readAsDataURL(file);
      });
      const dataUrl = await compressImage(rawDataUrl);

      let assignedTemplateId: number | null = null;

      if (imgConfig?.extractReference) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
        const ref = imgConfig.extractReference(file.name, relativePath);
        if (ref) {
          const match = activeProducts.find(p =>
            p.name.toLowerCase().includes(ref.toLowerCase()) ||
            p.internalRef.toLowerCase().includes(ref.toLowerCase()) ||
            ref.toLowerCase().includes(p.internalRef.toLowerCase())
          );
          if (match) assignedTemplateId = match.templateId;
        }
      }

      if (!assignedTemplateId) {
        const nameNoExt = file.name.replace(/\.[^.]+$/, '').toLowerCase();
        const match = activeProducts.find(p =>
          nameNoExt.includes(p.name.split(' – ').pop()?.trim().toLowerCase() || '') ||
          (p.internalRef && nameNoExt.includes(p.internalRef.toLowerCase()))
        );
        if (match) assignedTemplateId = match.templateId;
      }

      newImages.push({
        id: `img-${++_imgId}`,
        dataUrl,
        filename: file.name,
        file,
        assignedTemplateId,
        order: 0,
      });
    }

    setImages(prev => {
      const all = [...prev, ...newImages];
      const grouped = new Map<number | null, ImageItem[]>();
      for (const img of all) {
        const key = img.assignedTemplateId;
        const arr = grouped.get(key) || [];
        arr.push(img);
        grouped.set(key, arr);
      }
      for (const [, arr] of grouped) arr.forEach((img, idx) => { img.order = idx; });
      return all;
    });
  }, [plugin, activeProducts]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) await addImages(e.dataTransfer.files);
  }, [addImages]);

  const removeImage = (id: string) => setImages(prev => prev.filter(img => img.id !== id));

  const assignImage = (imageId: string, templateId: number) => {
    setImages(prev => {
      const updated = prev.map(img =>
        img.id === imageId ? { ...img, assignedTemplateId: templateId, order: 999 } : img
      );
      const group = updated.filter(i => i.assignedTemplateId === templateId).sort((a, b) => a.order - b.order);
      group.forEach((img, idx) => { img.order = idx; });
      return [...updated];
    });
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    setImages(prev => {
      const img = prev.find(i => i.id === imageId);
      if (!img || !img.assignedTemplateId) return prev;
      const group = prev.filter(i => i.assignedTemplateId === img.assignedTemplateId).sort((a, b) => a.order - b.order);
      const idx = group.findIndex(i => i.id === imageId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= group.length) return prev;
      const swapId = group[swapIdx].id;
      const tmpOrder = img.order;
      return prev.map(i => {
        if (i.id === imageId) return { ...i, order: group[swapIdx].order };
        if (i.id === swapId) return { ...i, order: tmpOrder };
        return i;
      });
    });
  };

  const uploadAll = async () => {
    const assigned = images.filter(img => img.assignedTemplateId !== null);
    if (assigned.length === 0) { alert('Geen afbeeldingen toegewezen.'); return; }

    setIsLoading(true);
    const results: typeof uploadResults = [];

    try {
      const { uid, password } = await getCredentials();
      if (!uid || !password) { alert('Geen Odoo credentials.'); setIsLoading(false); return; }

      const byTemplate = new Map<number, ImageItem[]>();
      for (const img of assigned) {
        if (img.assignedTemplateId === null) continue;
        const arr = byTemplate.get(img.assignedTemplateId) || [];
        arr.push(img);
        byTemplate.set(img.assignedTemplateId, arr);
      }

      for (const [templateId, imgs] of byTemplate) {
        const product = productById.get(templateId);
        const sorted = [...imgs].sort((a, b) => a.order - b.order);
        let uploaded = 0;

        try {
          for (let i = 0; i < sorted.length; i++) {
            const base64 = sorted[i].dataUrl.split(',')[1];
            const isFirst = i === 0;
            const shouldSetAsMain = isFirst && !product?.hasImage;

            await fetch('/api/upload-single-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                templateId,
                base64Image: base64,
                imageName: sorted[i].filename,
                sequence: i + 1,
                isMainImage: shouldSetAsMain,
                odooUid: uid,
                odooPassword: password,
              }),
            });
            uploaded++;
          }
          results.push({ templateId, name: product?.name || String(templateId), success: true, count: sorted.length });
        } catch (err) {
          results.push({ templateId, name: product?.name || String(templateId), success: false, count: uploaded, error: String(err) });
        }
      }

      setUploadResults(results);
    } catch (err) {
      alert(`Fout: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const imagesByTemplate = new Map<number, ImageItem[]>();
  const unassigned: ImageItem[] = [];
  for (const img of images) {
    if (img.assignedTemplateId !== null) {
      const arr = imagesByTemplate.get(img.assignedTemplateId) || [];
      arr.push(img);
      imagesByTemplate.set(img.assignedTemplateId, arr);
    } else {
      unassigned.push(img);
    }
  }

  const allSuppliers = getAllSuppliers();
  const imgConfig = plugin?.imageUpload;

  return (
    <>
      <Head><title>Afbeeldingen Uploaden - Babette</title></Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-6">
            <Link href="/product-import" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm">
              &larr; Terug naar Import
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">Afbeeldingen Uploaden</h1>
            <p className="text-gray-700 dark:text-gray-300">Selecteer producten uit Odoo en wijs afbeeldingen toe.</p>
          </div>

          {!selectedVendor ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Kies leverancier</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {allSuppliers.map(s => (
                  <button key={s.id} onClick={() => handleVendorSelect(s.id)}
                    className="border-2 border-gray-200 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                    <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{s.displayName}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LEFT: Product list */}
              <div className="lg:col-span-1">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden sticky top-4">
                  <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-gray-100">{plugin?.displayName}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{products.length} producten</span>
                    </div>
                    <button onClick={() => { setSelectedVendor(''); setPlugin(null); setImages([]); setProducts([]); setSelectedTemplateIds(new Set()); setUploadResults([]); }}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Wijzig</button>
                  </div>

                  <div className="p-3 border-b dark:border-gray-700 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ['all', 'Alles', filterCounts.all],
                        ['favorites', '⭐ Favorieten', filterCounts.favorites],
                        ['no-images', '🚫 Zonder foto', filterCounts.noImages],
                        ['recent', '🕐 Recent', filterCounts.recent],
                      ] as [FilterMode, string, number][]).map(([mode, label, count]) => (
                        <button key={mode} onClick={() => setFilterMode(mode)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            filterMode === mode
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}>
                          {label} ({count})
                        </button>
                      ))}
                    </div>
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Zoek op naam of referentie..."
                      className="w-full border dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  </div>

                  <div className="px-3 py-2 border-b dark:border-gray-700 flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">
                      {selectedTemplateIds.size > 0
                        ? <strong className="text-blue-600 dark:text-blue-400">{selectedTemplateIds.size} geselecteerd</strong>
                        : `${filteredProducts.length} producten`}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={selectAllFiltered} className="text-blue-600 dark:text-blue-400 hover:underline">
                        Selecteer alle ({filteredProducts.length})
                      </button>
                      {selectedTemplateIds.size > 0 && (
                        <button onClick={deselectAll} className="text-red-500 hover:underline">Wis selectie</button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[60vh] overflow-y-auto">
                    {isLoading && products.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Producten laden...
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 dark:text-gray-400">Geen producten gevonden</div>
                    ) : (
                      filteredProducts.map(p => {
                        const isSelected = selectedTemplateIds.has(p.templateId);
                        const imgCount = imagesByTemplate.get(p.templateId)?.length || 0;
                        return (
                          <div key={p.templateId}
                            onClick={() => toggleProduct(p.templateId)}
                            className={`flex items-center gap-3 px-3 py-2.5 border-b dark:border-gray-700 cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}>
                            <input type="checkbox" checked={isSelected} readOnly
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0 pointer-events-none" />
                            {p.mainThumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.mainThumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 border border-gray-200 dark:border-gray-600" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">
                                ?
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{formatDate(p.createDate)}</span>
                                {p.isFavorite && <span>⭐</span>}
                                {p.galleryImages.length > 0
                                  ? <span className="text-green-600">{p.galleryImages.length + (p.hasImage ? 1 : 0)} foto&apos;s</span>
                                  : p.hasImage
                                    ? <span className="text-green-600">1 foto</span>
                                    : <span className="text-orange-500">Geen foto</span>}
                              </div>
                            </div>
                            {imgCount > 0 && (
                              <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                                +{imgCount}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT: Image management */}
              <div className="lg:col-span-2 space-y-6">
                {imgConfig && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">{imgConfig.instructions}</p>
                    {imgConfig.exampleFilenames.length > 0 && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        Voorbeelden: {imgConfig.exampleFilenames.map((fn, i) => (
                          <code key={i} className="bg-blue-100 dark:bg-blue-800 px-1 rounded mx-1">{fn}</code>
                        ))}
                      </p>
                    )}
                  </div>
                )}

                {selectedTemplateIds.size === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
                    <div className="text-4xl mb-4">👈</div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Selecteer producten</h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Kies links de producten waarvoor je afbeeldingen wilt uploaden.
                      Gebruik de filters om snel te vinden wat je zoekt.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Drop zone */}
                    <div
                      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-dashed transition-colors ${
                        isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}>
                      <div className="p-6 text-center">
                        <div className="text-3xl mb-2">🖼️</div>
                        <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Sleep afbeeldingen hierheen</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          Afbeeldingen worden automatisch gecomprimeerd (max 1920px) en gematcht aan de {selectedTemplateIds.size} geselecteerde producten
                        </p>
                        <div className="flex gap-3 justify-center">
                          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium text-sm">
                            Selecteer bestanden
                            <input ref={fileInputRef} type="file" multiple accept="image/*"
                              onChange={(e) => { if (e.target.files) addImages(e.target.files); e.target.value = ''; }}
                              className="hidden" />
                          </label>
                          {supportsDirectoryPicker() ? (
                            <label className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 font-medium text-sm">
                              Selecteer map
                              <input type="file"
                                {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                                onChange={(e) => { if (e.target.files) addImages(e.target.files); e.target.value = ''; }}
                                className="hidden" />
                            </label>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400 italic self-center">
                              {isIOS() ? 'Map selectie niet beschikbaar op iOS' : 'Map selectie niet beschikbaar'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Image summary */}
                    {images.length > 0 && (
                      <div className="flex gap-3 text-sm items-center flex-wrap">
                        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
                          {images.length} afbeeldingen
                        </span>
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
                          {images.filter(i => i.assignedTemplateId !== null).length} toegewezen
                        </span>
                        {unassigned.length > 0 && (
                          <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full">
                            {unassigned.length} niet toegewezen
                          </span>
                        )}
                        <button onClick={() => setImages([])} className="text-red-500 hover:text-red-700 dark:text-red-400 text-xs ml-auto">Wis alles</button>
                      </div>
                    )}

                    {/* Per-product image sections */}
                    {activeProducts.map(p => {
                      const newImgs = imagesByTemplate.get(p.templateId) || [];
                      const sortedNew = [...newImgs].sort((a, b) => a.order - b.order);
                      const existingCount = (p.hasImage ? 1 : 0) + p.galleryImages.length;
                      const totalCount = existingCount + sortedNew.length;
                      return (
                        <div key={p.templateId} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                          <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                              {p.isFavorite && <span className="ml-1">⭐</span>}
                            </div>
                            <div className="flex gap-2">
                              {existingCount > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                  {existingCount} bestaand
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                sortedNew.length > 0
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : totalCount === 0
                                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                              }`}>
                                {sortedNew.length > 0 ? `+${sortedNew.length} nieuw` : totalCount === 0 ? 'Geen foto\'s' : 'Geen nieuwe'}
                              </span>
                            </div>
                          </div>
                          <div className="p-3 flex gap-3 flex-wrap items-start">
                            {/* Existing main image */}
                            {p.mainThumbnail && (
                              <div className="relative w-28 flex-shrink-0 opacity-80">
                                <div className="aspect-square rounded-lg overflow-hidden border-2 border-green-300 dark:border-green-700 bg-gray-100 dark:bg-gray-700">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={p.mainThumbnail} alt="Hoofdafbeelding" className="w-full h-full object-cover" />
                                </div>
                                <span className="absolute top-1 left-1 bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">HOOFD</span>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">In Odoo</p>
                              </div>
                            )}
                            {/* Existing gallery images */}
                            {p.galleryImages.map(gi => (
                              <div key={gi.id} className="relative w-28 flex-shrink-0 opacity-80">
                                <div className="aspect-square rounded-lg overflow-hidden border-2 border-green-200 dark:border-green-800 bg-gray-100 dark:bg-gray-700">
                                  {gi.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={gi.thumbnail} alt={gi.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">?</div>
                                  )}
                                </div>
                                <span className="absolute top-1 left-1 bg-green-500/80 text-white text-[10px] px-1.5 py-0.5 rounded">#{gi.sequence}</span>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-1">{gi.name}</p>
                              </div>
                            ))}
                            {/* Separator between existing and new */}
                            {existingCount > 0 && sortedNew.length > 0 && (
                              <div className="w-px bg-gray-300 dark:bg-gray-600 self-stretch mx-1" />
                            )}
                            {/* New images to upload */}
                            {sortedNew.map((img, idx) => (
                              <div key={img.id} className="relative group w-28 flex-shrink-0">
                                <div className="aspect-square rounded-lg overflow-hidden border-2 border-blue-300 dark:border-blue-600 bg-gray-100 dark:bg-gray-700">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                                </div>
                                <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                  {!p.hasImage && idx === 0 ? 'HOOFD' : `NIEUW`}
                                </span>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                                  <button onClick={() => moveImage(img.id, 'up')} disabled={idx === 0}
                                    className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs disabled:opacity-30">&larr;</button>
                                  <button onClick={() => moveImage(img.id, 'down')} disabled={idx === sortedNew.length - 1}
                                    className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs disabled:opacity-30">&rarr;</button>
                                  <button onClick={() => removeImage(img.id)}
                                    className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
                                </div>
                              </div>
                            ))}
                            {/* Add more button */}
                            <label className="w-28 aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex-shrink-0">
                              <input type="file" multiple accept="image/*" className="hidden"
                                onChange={async (e) => {
                                  if (!e.target.files) return;
                                  const newImgsToAdd: ImageItem[] = [];
                                  for (const file of Array.from(e.target.files)) {
                                    const rawUrl = await new Promise<string>((resolve) => {
                                      const reader = new FileReader();
                                      reader.onload = () => resolve(reader.result as string);
                                      reader.readAsDataURL(file);
                                    });
                                    const compressed = await compressImage(rawUrl);
                                    newImgsToAdd.push({
                                      id: `img-${++_imgId}`, dataUrl: compressed, filename: file.name, file,
                                      assignedTemplateId: p.templateId, order: sortedNew.length + newImgsToAdd.length,
                                    });
                                  }
                                  setImages(prev => [...prev, ...newImgsToAdd]);
                                  e.target.value = '';
                                }}
                              />
                              <span className="text-2xl text-gray-400">+</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}

                    {/* Unassigned images */}
                    {unassigned.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-orange-200 dark:border-orange-700 overflow-hidden">
                        <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-3">
                          <span className="font-medium text-orange-800 dark:text-orange-200">Niet toegewezen ({unassigned.length})</span>
                        </div>
                        <div className="p-3 flex gap-3 flex-wrap">
                          {unassigned.map(img => (
                            <div key={img.id} className="relative group w-28 flex-shrink-0">
                              <div className="aspect-square rounded-lg overflow-hidden border-2 border-orange-200 dark:border-orange-600 bg-gray-100 dark:bg-gray-700">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                              </div>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
                              <select value="" onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) assignImage(img.id, v); }}
                                className="w-full text-[10px] border dark:border-gray-600 rounded px-1 py-0.5 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                <option value="">Toewijzen aan...</option>
                                {activeProducts.map(p => (
                                  <option key={p.templateId} value={p.templateId}>{p.name}</option>
                                ))}
                              </select>
                              <button onClick={() => removeImage(img.id)}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upload button */}
                    {images.length > 0 && !uploadResults.length && (
                      <button onClick={uploadAll} disabled={isLoading || images.filter(i => i.assignedTemplateId !== null).length === 0}
                        className={`w-full py-3 rounded-xl font-bold text-lg ${
                          isLoading || images.filter(i => i.assignedTemplateId !== null).length === 0
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}>
                        {isLoading ? 'Uploaden...' : `Upload ${images.filter(i => i.assignedTemplateId !== null).length} afbeeldingen naar Odoo`}
                      </button>
                    )}

                    {/* Upload results */}
                    {uploadResults.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Upload Resultaten</h3>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadResults.filter(r => r.success).length}</div>
                            <div className="text-sm text-green-600 dark:text-green-400">Gelukt</div>
                          </div>
                          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadResults.filter(r => !r.success).length}</div>
                            <div className="text-sm text-red-600 dark:text-red-400">Mislukt</div>
                          </div>
                          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadResults.reduce((s, r) => s + r.count, 0)}</div>
                            <div className="text-sm text-blue-600 dark:text-blue-400">Afbeeldingen</div>
                          </div>
                        </div>
                        {uploadResults.map(r => (
                          <div key={r.templateId} className={`py-1 text-sm ${r.success ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
                            {r.success ? '✅' : '❌'} {r.name}: {r.success ? `${r.count} afbeeldingen` : r.error}
                          </div>
                        ))}
                        <div className="mt-4">
                          <button onClick={() => { setImages([]); setUploadResults([]); }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                            Meer uploaden
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
