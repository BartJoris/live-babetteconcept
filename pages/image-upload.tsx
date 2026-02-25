import { useState, useRef, useCallback, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getSupplier, getAllSuppliers } from '@/lib/suppliers';
import type { SupplierPlugin } from '@/lib/suppliers/types';

interface OdooProduct {
  templateId: number;
  reference: string;
  name: string;
}

interface ImageItem {
  id: string;
  dataUrl: string;
  filename: string;
  file: File;
  assignedReference: string;
  order: number;
}

let _imgId = 0;

export default function ImageUploadPage() {
  const router = useRouter();
  const { vendor } = router.query;

  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [plugin, setPlugin] = useState<SupplierPlugin | null>(null);
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadResults, setUploadResults] = useState<Array<{ reference: string; success: boolean; count: number; error?: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set vendor from URL on mount
  useEffect(() => {
    if (vendor && typeof vendor === 'string') {
      setSelectedVendor(vendor);
      const p = getSupplier(vendor);
      if (p) setPlugin(p);
    }
  }, [vendor]);

  // Load products from Odoo when vendor changes
  useEffect(() => {
    if (selectedVendor && plugin) {
      loadProducts();
    }
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
    } catch { /* fallback below */ }
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
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
        setProducts(data.products.map((p: { template_id: number; reference: string; name: string }) => ({
          templateId: p.template_id,
          reference: p.reference,
          name: p.name,
        })));
      } else {
        console.error('Failed to load products:', data.error);
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
    router.replace(`/image-upload?vendor=${vendorId}`, undefined, { shallow: true });
  };

  const addImages = useCallback(async (files: FileList | File[]) => {
    const imgConfig = plugin?.imageUpload;
    const newImages: ImageItem[] = [];

    for (const file of Array.from(files)) {
      if (!/\.(jpg|jpeg|png|webp)$/i.test(file.name)) continue;

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      let assignedReference = '';
      if (imgConfig?.extractReference) {
        const ref = imgConfig.extractReference(file.name);
        if (ref) {
          const match = products.find(p =>
            p.reference === ref ||
            p.reference.toLowerCase().includes(ref.toLowerCase()) ||
            ref.toLowerCase().includes(p.reference.toLowerCase())
          );
          if (match) assignedReference = match.reference;
        }
      }

      newImages.push({
        id: `img-${++_imgId}`,
        dataUrl,
        filename: file.name,
        file,
        assignedReference,
        order: 0,
      });
    }

    // Set order within groups
    setImages(prev => {
      const all = [...prev, ...newImages];
      // Re-calculate order per reference group
      const grouped = new Map<string, ImageItem[]>();
      for (const img of all) {
        const key = img.assignedReference || '__unassigned';
        const arr = grouped.get(key) || [];
        arr.push(img);
        grouped.set(key, arr);
      }
      for (const [, arr] of grouped) {
        arr.forEach((img, idx) => { img.order = idx; });
      }
      return all;
    });
  }, [plugin, products]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) await addImages(e.dataTransfer.files);
  }, [addImages]);

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const assignImage = (imageId: string, reference: string) => {
    setImages(prev => {
      const updated = prev.map(img =>
        img.id === imageId ? { ...img, assignedReference: reference, order: 999 } : img
      );
      // Recalculate order for affected group
      const group = updated.filter(i => i.assignedReference === reference).sort((a, b) => a.order - b.order);
      group.forEach((img, idx) => { img.order = idx; });
      return [...updated];
    });
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    setImages(prev => {
      const img = prev.find(i => i.id === imageId);
      if (!img || !img.assignedReference) return prev;
      const group = prev.filter(i => i.assignedReference === img.assignedReference).sort((a, b) => a.order - b.order);
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
    const assigned = images.filter(img => img.assignedReference);
    if (assigned.length === 0) { alert('Geen afbeeldingen toegewezen.'); return; }

    const refToTemplate: Record<string, number> = {};
    for (const p of products) {
      refToTemplate[p.reference] = p.templateId;
    }

    setIsLoading(true);
    const results: typeof uploadResults = [];

    try {
      const { uid, password } = await getCredentials();
      if (!uid || !password) { alert('Geen Odoo credentials.'); setIsLoading(false); return; }

      const byRef = new Map<string, ImageItem[]>();
      for (const img of assigned) {
        const arr = byRef.get(img.assignedReference) || [];
        arr.push(img);
        byRef.set(img.assignedReference, arr);
      }

      for (const [reference, imgs] of byRef) {
        const templateId = refToTemplate[reference];
        if (!templateId) {
          results.push({ reference, success: false, count: 0, error: 'Geen template ID gevonden' });
          continue;
        }

        const sorted = [...imgs].sort((a, b) => a.order - b.order);

        try {
          for (let i = 0; i < sorted.length; i++) {
            const img = sorted[i];
            const base64 = img.dataUrl.split(',')[1];

            await fetch('/api/upload-single-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                templateId,
                base64Image: base64,
                imageName: img.filename,
                sequence: i + 1,
                isMainImage: i === 0,
                odooUid: uid,
                odooPassword: password,
              }),
            });
          }
          results.push({ reference, success: true, count: sorted.length });
        } catch (err) {
          results.push({ reference, success: false, count: 0, error: String(err) });
        }
      }

      setUploadResults(results);
    } catch (err) {
      alert(`Fout: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Group images by reference
  const imagesByRef = new Map<string, ImageItem[]>();
  const unassigned: ImageItem[] = [];
  for (const img of images) {
    if (img.assignedReference) {
      const arr = imagesByRef.get(img.assignedReference) || [];
      arr.push(img);
      imagesByRef.set(img.assignedReference, arr);
    } else {
      unassigned.push(img);
    }
  }

  const filteredProducts = searchQuery
    ? products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.reference.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : products;

  const allSuppliers = getAllSuppliers();
  const imgConfig = plugin?.imageUpload;

  return (
    <>
      <Head><title>Afbeeldingen Uploaden - Babette</title></Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="mb-6">
            <Link href="/product-import" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm">
              &larr; Terug naar Import
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
              Afbeeldingen Uploaden
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
              Upload afbeeldingen voor bestaande producten in Odoo. Werkt onafhankelijk van de product import.
            </p>
          </div>

          {/* Vendor selection */}
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
            <>
              {/* Vendor bar */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900 dark:text-gray-100">{plugin?.displayName}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{products.length} producten in Odoo</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={loadProducts} disabled={isLoading}
                    className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                    Ververs producten
                  </button>
                  <button onClick={() => { setSelectedVendor(''); setPlugin(null); setImages([]); setProducts([]); setUploadResults([]); }}
                    className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                    Andere leverancier
                  </button>
                </div>
              </div>

              {/* Instructions */}
              {imgConfig && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 mb-6">
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

              {/* Drop zone */}
              <div
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-dashed mb-6 transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <div className="p-8 text-center">
                  <div className="text-4xl mb-3">🖼️</div>
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">Sleep afbeeldingen hierheen</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">of klik om te selecteren</p>
                  <div className="flex gap-3 justify-center">
                    <div>
                      <input ref={fileInputRef} type="file" multiple accept="image/*"
                        onChange={(e) => e.target.files && addImages(e.target.files)}
                        className="hidden" id="img-file-select" />
                      <label htmlFor="img-file-select"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium inline-block text-sm">
                        Selecteer bestanden
                      </label>
                    </div>
                    <div>
                      <input type="file"
                        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                        onChange={(e) => e.target.files && addImages(e.target.files)}
                        className="hidden" id="img-folder-select" />
                      <label htmlFor="img-folder-select"
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 font-medium inline-block text-sm">
                        Selecteer map
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Image summary */}
              {images.length > 0 && (
                <div className="flex gap-3 text-sm mb-4 items-center">
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
                    {images.length} afbeeldingen
                  </span>
                  <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
                    {images.filter(i => i.assignedReference).length} toegewezen
                  </span>
                  {unassigned.length > 0 && (
                    <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full">
                      {unassigned.length} niet toegewezen
                    </span>
                  )}
                  <button onClick={() => setImages([])}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 text-xs ml-auto">
                    Wis alles
                  </button>
                </div>
              )}

              {/* Assigned images by product */}
              {Array.from(imagesByRef.entries()).map(([ref, imgs]) => {
                const product = products.find(p => p.reference === ref);
                const sorted = [...imgs].sort((a, b) => a.order - b.order);
                return (
                  <div key={ref} className="mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{product?.name || ref}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({sorted.length} afbeeldingen)</span>
                      </div>
                    </div>
                    <div className="p-3 flex gap-3 flex-wrap items-start">
                      {sorted.map((img, idx) => (
                        <div key={img.id} className="relative group w-32 flex-shrink-0">
                          <div className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                          </div>
                          {idx === 0 && (
                            <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">HOOFD</span>
                          )}
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                            <button onClick={() => moveImage(img.id, 'up')} disabled={idx === 0}
                              className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100">&larr;</button>
                            <button onClick={() => moveImage(img.id, 'down')} disabled={idx === sorted.length - 1}
                              className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100">&rarr;</button>
                            <button onClick={() => removeImage(img.id)}
                              className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600">&times;</button>
                          </div>
                        </div>
                      ))}
                      {/* Add more images to this product */}
                      <label className="w-32 aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex-shrink-0">
                        <input type="file" multiple accept="image/*" className="hidden"
                          onChange={async (e) => {
                            if (!e.target.files) return;
                            const newImgs: ImageItem[] = [];
                            for (const file of Array.from(e.target.files)) {
                              const dataUrl = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result as string);
                                reader.readAsDataURL(file);
                              });
                              newImgs.push({
                                id: `img-${++_imgId}`, dataUrl, filename: file.name, file,
                                assignedReference: ref, order: sorted.length + newImgs.length,
                              });
                            }
                            setImages(prev => [...prev, ...newImgs]);
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
                <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-orange-200 dark:border-orange-700 overflow-hidden">
                  <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-3">
                    <span className="font-medium text-orange-800 dark:text-orange-200">Niet toegewezen ({unassigned.length})</span>
                  </div>
                  <div className="p-3">
                    {/* Search filter for product assignment */}
                    <div className="mb-3">
                      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Zoek product om toe te wijzen..."
                        className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {unassigned.map(img => (
                        <div key={img.id} className="relative group w-32 flex-shrink-0">
                          <div className="aspect-square rounded-lg overflow-hidden border-2 border-orange-200 dark:border-orange-600 bg-gray-100 dark:bg-gray-700">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
                          <select value="" onChange={(e) => e.target.value && assignImage(img.id, e.target.value)}
                            className="w-full text-[10px] border dark:border-gray-600 rounded px-1 py-0.5 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <option value="">Toewijzen aan...</option>
                            {filteredProducts.slice(0, 50).map(p => (
                              <option key={p.reference} value={p.reference}>{p.name}</option>
                            ))}
                          </select>
                          <button onClick={() => removeImage(img.id)}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Upload button */}
              {images.length > 0 && !uploadResults.length && (
                <button onClick={uploadAll} disabled={isLoading || images.filter(i => i.assignedReference).length === 0}
                  className={`w-full py-3 rounded-xl font-bold text-lg mb-6 ${
                    isLoading || images.filter(i => i.assignedReference).length === 0
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}>
                  {isLoading ? 'Uploaden...' : `Upload ${images.filter(i => i.assignedReference).length} afbeeldingen naar Odoo`}
                </button>
              )}

              {/* Upload results */}
              {uploadResults.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
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
                    <div key={r.reference} className={`py-1 text-sm ${r.success ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
                      {r.success ? '✅' : '❌'} {r.reference}: {r.success ? `${r.count} afbeeldingen` : r.error}
                    </div>
                  ))}
                  <div className="mt-4 flex gap-3">
                    <button onClick={() => { setImages([]); setUploadResults([]); }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                      Meer afbeeldingen uploaden
                    </button>
                    <Link href="/product-import" className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium">
                      Terug naar Import
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
