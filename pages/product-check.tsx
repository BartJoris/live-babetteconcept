import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

interface ProductCheckItem {
  id: number;
  name: string;
  defaultCode: string | null;
  brand: string | null;
  hasMainImage: boolean;
  imageCount: number;
  hasDescription: boolean;
  description: string | null;
  weight: number;
  tags: string[];
  tagIds: number[];
}

type SortColumn = 'name' | 'brand' | 'imageCount' | 'weight' | 'description' | 'tags';
type SortDirection = 'asc' | 'desc';

interface Brand {
  id: number;
  name: string;
}

interface Tag {
  id: number;
  name: string;
}

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

function compressImage(source: string): Promise<string> {
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl.split(',')[1]);
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

export default function ProductCheckPage() {
  const [products, setProducts] = useState<ProductCheckItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedDescriptionIds, setExpandedDescriptionIds] = useState<Set<number>>(new Set());

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [imagesMap, setImagesMap] = useState<Map<number, TemplateImages>>(new Map());
  const [loadingImageIds, setLoadingImageIds] = useState<Set<number>>(new Set());
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isImageOperationPending, setIsImageOperationPending] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState<number | null>(null);
  const [dragTemplateId, setDragTemplateId] = useState<number | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);

  const fileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  useEffect(() => {
    loadProducts();
    loadBrands();
    loadTags();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/product-check/products');
      if (!response.ok) throw new Error('Kan producten niet laden');
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kan producten niet laden');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBrands = async () => {
    try {
      const response = await fetch('/api/fetch-brands');
      if (!response.ok) return;
      const data = await response.json();
      if (data.success && data.brands) setBrands(data.brands);
    } catch { /* optional */ }
  };

  const loadTags = async () => {
    try {
      const response = await fetch('/api/odoo/fetch-template-labels', { method: 'POST' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.success && data.labels) setTags(data.labels);
    } catch { /* optional */ }
  };

  const loadTemplateImages = useCallback(async (templateId: number, silent = false): Promise<TemplateImages | null> => {
    setLoadingImageIds((prev) => new Set(prev).add(templateId));
    try {
      const maxRetries = 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`/api/product-check/template-images?templateId=${templateId}`);
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
          if (attempt === maxRetries && !silent) {
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

  const updateProductFromImages = (templateId: number, tpl: TemplateImages) => {
    const count = (tpl.mainImage ? 1 : 0) + tpl.galleryImages.length;
    setProducts((prev) => prev.map((p) =>
      p.id === templateId ? { ...p, imageCount: count, hasMainImage: !!tpl.mainImage } : p
    ));
  };

  const toggleImageManager = (productId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
        if (!imagesMap.has(productId)) loadTemplateImages(productId);
      }
      return next;
    });
  };

  const toggleShowAll = async () => {
    const allExp = filteredProducts.length > 0 && filteredProducts.every((p) => expandedIds.has(p.id));
    if (allExp) { setExpandedIds(new Set()); return; }

    setIsLoadingAll(true);
    try {
      const ids = filteredProducts.map((p) => p.id);
      setExpandedIds(new Set(ids));
      const toFetch = ids.filter((id) => !imagesMap.has(id));
      for (let i = 0; i < toFetch.length; i++) {
        await loadTemplateImages(toFetch[i], true);
        if (i < toFetch.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleFixAllWeights = async () => {
    const ids = filteredProducts.filter((p) => !p.weight || p.weight === 0).map((p) => p.id);
    if (ids.length === 0) return;
    if (!confirm(`Gewicht van ${ids.length} product(en) aanpassen naar 0,2 kg?`)) return;

    setIsImageOperationPending(true);
    setError(null);
    try {
      const response = await fetch('/api/ecommerce/bulk-update-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids, weight: 0.2, updateType: 'template' }),
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Fout'); }
      const data = await response.json();
      setSuccessMessage(`Gewicht aangepast voor ${data.updatedCount} product(en)`);
      setProducts((prev) => prev.map((p) =>
        ids.includes(p.id) ? { ...p, weight: 0.2 } : p
      ));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij aanpassen gewicht');
    } finally {
      setIsImageOperationPending(false);
    }
  };

  const handleFixWeight = async (templateId: number) => {
    setIsImageOperationPending(true);
    setError(null);
    try {
      const response = await fetch('/api/ecommerce/bulk-update-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [templateId], weight: 0.2, updateType: 'template' }),
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Fout'); }
      setSuccessMessage('Gewicht aangepast naar 0,2 kg');
      setProducts((prev) => prev.map((p) =>
        p.id === templateId ? { ...p, weight: 0.2 } : p
      ));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij aanpassen gewicht');
    } finally {
      setIsImageOperationPending(false);
    }
  };

  const handleSetMainImage = async (templateId: number, imageId: number) => {
    setIsImageOperationPending(true);
    setError(null);
    try {
      const r = await fetch('/api/product-check/set-main-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, imageId }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Fout'); }
      setSuccessMessage('Hoofdafbeelding bijgewerkt');
      const imgs = await loadTemplateImages(templateId);
      if (imgs) updateProductFromImages(templateId, imgs);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij instellen hoofdafbeelding');
    } finally {
      setIsImageOperationPending(false);
    }
  };

  const handleDeleteImage = async (templateId: number, imageId: number) => {
    if (!confirm('Weet je zeker dat je deze afbeelding wilt verwijderen?')) return;
    setIsImageOperationPending(true);
    setError(null);
    try {
      const r = await fetch('/api/product-check/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Fout'); }
      setSuccessMessage('Afbeelding verwijderd');
      const imgs = await loadTemplateImages(templateId);
      if (imgs) updateProductFromImages(templateId, imgs);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen afbeelding');
    } finally {
      setIsImageOperationPending(false);
    }
  };

  const handleDeleteMainImage = async (templateId: number) => {
    if (!confirm('Weet je zeker dat je de hoofdafbeelding wilt verwijderen?')) return;
    setIsImageOperationPending(true);
    setError(null);
    try {
      const r = await fetch('/api/upload-single-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId, base64Image: false, imageName: '', sequence: 0, isMainImage: true,
          odooUid: localStorage.getItem('odoo_uid') || '',
          odooPassword: localStorage.getItem('odoo_pass') || '',
        }),
      });
      if (!r.ok) throw new Error('Kan hoofdafbeelding niet verwijderen');
      setSuccessMessage('Hoofdafbeelding verwijderd');
      const imgs = await loadTemplateImages(templateId);
      if (imgs) updateProductFromImages(templateId, imgs);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen hoofdafbeelding');
    } finally {
      setIsImageOperationPending(false);
    }
  };

  const handleUploadFiles = async (templateId: number, files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)
    );
    if (imageFiles.length === 0) return;

    setUploadingFor(templateId);
    setError(null);
    try {
      const currentGallery = imagesMap.get(templateId)?.galleryImages || [];
      let maxSeq = currentGallery.length > 0
        ? Math.max(...currentGallery.map((g) => g.sequence))
        : 0;

      for (const file of imageFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        const base64 = await compressImage(dataUrl);
        maxSeq++;

        const r = await fetch('/api/upload-single-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            base64Image: base64,
            imageName: file.name,
            sequence: maxSeq,
            isMainImage: false,
            odooUid: localStorage.getItem('odoo_uid') || '',
            odooPassword: localStorage.getItem('odoo_pass') || '',
          }),
        });
        if (!r.ok) {
          const d = await r.json();
          throw new Error(d.error || 'Upload mislukt');
        }
      }

      setSuccessMessage(`${imageFiles.length} afbeelding(en) geupload`);
      const imgs = await loadTemplateImages(templateId);
      if (imgs) updateProductFromImages(templateId, imgs);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij uploaden');
    } finally {
      setUploadingFor(null);
      const ref = fileInputRefs.current.get(templateId);
      if (ref) ref.value = '';
    }
  };

  const handleMoveImage = async (templateId: number, imageId: number, direction: 'left' | 'right') => {
    const tplImages = imagesMap.get(templateId);
    if (!tplImages) return;

    const images = [...tplImages.galleryImages];
    const idx = images.findIndex((img) => img.id === imageId);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= images.length) return;

    [images[idx], images[swapIdx]] = [images[swapIdx], images[idx]];
    const reordered = images.map((img, i) => ({ ...img, sequence: i + 1 }));

    setImagesMap((prev) => new Map(prev).set(templateId, { ...tplImages, galleryImages: reordered }));

    try {
      const r = await fetch('/api/product-check/reorder-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: reordered.map((img) => ({ id: img.id, sequence: img.sequence })) }),
      });
      if (!r.ok) throw new Error('Kan volgorde niet opslaan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan volgorde');
      await loadTemplateImages(templateId);
    }
  };

  const handleDragStart = (imageId: number, templateId: number) => {
    setDraggedImageId(imageId);
    setDragTemplateId(templateId);
  };

  const handleDragOverImage = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnImage = async (targetId: number, templateId: number) => {
    if (draggedImageId === null || draggedImageId === targetId || dragTemplateId !== templateId) {
      setDraggedImageId(null);
      setDragTemplateId(null);
      return;
    }
    const tplImages = imagesMap.get(templateId);
    if (!tplImages) return;

    const images = [...tplImages.galleryImages];
    const draggedIdx = images.findIndex((img) => img.id === draggedImageId);
    const targetIdx = images.findIndex((img) => img.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const [moved] = images.splice(draggedIdx, 1);
    images.splice(targetIdx, 0, moved);
    const reordered = images.map((img, i) => ({ ...img, sequence: i + 1 }));

    setImagesMap((prev) => new Map(prev).set(templateId, { ...tplImages, galleryImages: reordered }));
    setDraggedImageId(null);
    setDragTemplateId(null);

    try {
      const r = await fetch('/api/product-check/reorder-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: reordered.map((img) => ({ id: img.id, sequence: img.sequence })) }),
      });
      if (!r.ok) throw new Error('Kan volgorde niet opslaan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan volgorde');
      await loadTemplateImages(templateId);
    }
  };

  const handleFileDrop = (e: React.DragEvent, templateId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleUploadFiles(templateId, e.dataTransfer.files);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return ' \u2195';
    return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
  };

  const toggleDescription = (productId: number) => {
    setExpandedDescriptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const filteredProducts = products.filter((p) => {
    if (selectedBrand && p.brand !== selectedBrand) return false;
    if (selectedTag && !p.tags.includes(selectedTag)) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'name':
        return dir * a.name.localeCompare(b.name);
      case 'brand':
        return dir * (a.brand || '').localeCompare(b.brand || '');
      case 'imageCount':
        return dir * (a.imageCount - b.imageCount);
      case 'weight':
        return dir * (a.weight - b.weight);
      case 'description':
        return dir * (Number(a.hasDescription) - Number(b.hasDescription));
      case 'tags':
        return dir * (a.tags.join(',').localeCompare(b.tags.join(',')));
      default:
        return 0;
    }
  });

  const allExpanded = sortedProducts.length > 0 && sortedProducts.every((p) => expandedIds.has(p.id));

  const stats = {
    total: sortedProducts.length,
    noImages: sortedProducts.filter((p) => p.imageCount === 0).length,
    noWeight: sortedProducts.filter((p) => !p.weight || p.weight === 0).length,
    noDescription: sortedProducts.filter((p) => !p.hasDescription).length,
  };

  const uniqueBrands = [...new Set(products.map((p) => p.brand).filter(Boolean))] as string[];

  const renderImagePanel = (product: ProductCheckItem) => {
    const tplImages = imagesMap.get(product.id);
    const isLoadingThis = loadingImageIds.has(product.id);
    const isUploading = uploadingFor === product.id;

    if (isLoadingThis) {
      return (
        <div className="text-center py-6 text-gray-500">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2" />
          <p className="text-sm">Afbeeldingen laden...</p>
        </div>
      );
    }

    if (!tplImages) return null;

    const hasImages = tplImages.mainImage || tplImages.galleryImages.length > 0;
    const gallery = tplImages.galleryImages;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {hasImages
              ? `${(tplImages.mainImage ? 1 : 0) + gallery.length} afbeelding(en) — eerste = hoofdafbeelding`
              : 'Geen afbeeldingen'}
          </div>
          {isUploading && (
            <span className="text-sm text-blue-600 animate-pulse">Uploaden...</span>
          )}
        </div>

        <div className="flex gap-3 flex-wrap items-start">
          {/* Main image */}
          {tplImages.mainImage && (
            <div className="relative group w-32 flex-shrink-0">
              <div className="aspect-square rounded-lg overflow-hidden border-2 border-blue-500 bg-gray-100">
                <img
                  src={`data:image/png;base64,${tplImages.mainImage}`}
                  alt="Hoofdafbeelding"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                HOOFD
              </span>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <button
                  onClick={() => handleDeleteMainImage(product.id)}
                  disabled={isImageOperationPending}
                  className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-lg hover:bg-red-600 disabled:opacity-50"
                  title="Verwijderen"
                >
                  &times;
                </button>
              </div>
            </div>
          )}

          {/* Gallery images */}
          {gallery.map((img, idx) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(img.id, product.id)}
              onDragOver={handleDragOverImage}
              onDrop={() => handleDropOnImage(img.id, product.id)}
              className={`relative group w-32 flex-shrink-0 ${
                draggedImageId === img.id ? 'opacity-40' : ''
              }`}
            >
              <div className={`aspect-square rounded-lg overflow-hidden border-2 bg-gray-100 cursor-grab active:cursor-grabbing ${
                draggedImageId === img.id ? 'border-yellow-400' : 'border-gray-200'
              }`}>
                <img
                  src={`data:image/png;base64,${img.image}`}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-[10px] text-gray-500 truncate mt-1">#{img.sequence}</p>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                <button
                  onClick={() => handleMoveImage(product.id, img.id, 'left')}
                  disabled={idx === 0 || isImageOperationPending}
                  className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100"
                  title="Naar links"
                >
                  &larr;
                </button>
                <button
                  onClick={() => handleSetMainImage(product.id, img.id)}
                  disabled={isImageOperationPending}
                  className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold hover:bg-blue-600 disabled:opacity-50"
                  title="Als hoofdafbeelding instellen"
                >
                  H
                </button>
                <button
                  onClick={() => handleMoveImage(product.id, img.id, 'right')}
                  disabled={idx === gallery.length - 1 || isImageOperationPending}
                  className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100"
                  title="Naar rechts"
                >
                  &rarr;
                </button>
                <button
                  onClick={() => handleDeleteImage(product.id, img.id)}
                  disabled={isImageOperationPending}
                  className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-lg hover:bg-red-600 disabled:opacity-50"
                  title="Verwijderen"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}

          {/* Inline add card */}
          <label className="w-32 flex-shrink-0">
            <div className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors bg-white dark:bg-gray-800">
              <input
                ref={(el) => { if (el) fileInputRefs.current.set(product.id, el); }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleUploadFiles(product.id, e.target.files);
                  e.target.value = '';
                }}
              />
              <span className="text-3xl text-gray-400">+</span>
              <span className="text-[10px] text-gray-400 mt-1">Toevoegen</span>
            </div>
          </label>
        </div>

        {/* Drag-and-drop zone */}
        {!hasImages && (
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => handleFileDrop(e, product.id)}
            onClick={() => fileInputRefs.current.get(product.id)?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
          >
            <svg className="mx-auto h-10 w-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-500">Sleep afbeeldingen hierheen of klik om te selecteren</p>
          </div>
        )}

        {hasImages && gallery.length > 1 && (
          <p className="text-xs text-gray-400">Sleep afbeeldingen om de volgorde aan te passen, of gebruik de pijltjes.</p>
        )}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Product Controleren - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Product Controleren
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Controleer gepubliceerde producten: afbeeldingen, gewicht en e-commerce beschrijving.
            </p>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Merk</label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Alle merken</option>
                  {(brands.length > 0 ? brands.map((b) => b.name) : uniqueBrands).sort().map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-commerce Tag</label>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Alle tags</option>
                  {tags.sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={loadProducts}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Vernieuwen
                </button>
                {!isLoading && filteredProducts.length > 0 && (
                  <>
                    <button
                      onClick={toggleShowAll}
                      disabled={isLoadingAll}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        allExpanded
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/40'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isLoadingAll
                        ? `Laden (${loadingImageIds.size} resterend)...`
                        : allExpanded
                          ? 'Alle afbeeldingen verbergen'
                          : 'Toon alle afbeeldingen'}
                    </button>
                    {stats.noWeight > 0 && (
                      <button
                        onClick={handleFixAllWeights}
                        disabled={isImageOperationPending}
                        className="px-4 py-2 text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 rounded-md hover:bg-orange-200 dark:hover:bg-orange-800/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Alle gewicht &rarr; 0,2 kg ({stats.noWeight})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Status Summary */}
            {!isLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.total}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Totaal producten</div>
                </div>
                <div className={`border rounded-lg p-3 text-center ${stats.noImages > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                  <div className={`text-2xl font-bold ${stats.noImages > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{stats.noImages}</div>
                  <div className={`text-xs ${stats.noImages > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>Zonder afbeeldingen</div>
                </div>
                <div className={`border rounded-lg p-3 text-center ${stats.noWeight > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                  <div className={`text-2xl font-bold ${stats.noWeight > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{stats.noWeight}</div>
                  <div className={`text-xs ${stats.noWeight > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>Gewicht = 0</div>
                </div>
                <div className={`border rounded-lg p-3 text-center ${stats.noDescription > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                  <div className={`text-2xl font-bold ${stats.noDescription > 0 ? 'text-yellow-700 dark:text-yellow-300' : 'text-green-700 dark:text-green-300'}`}>{stats.noDescription}</div>
                  <div className={`text-xs ${stats.noDescription > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>Geen beschrijving</div>
                </div>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-800 dark:text-red-200">{error}</p>
                <button onClick={() => setError(null)} className="mt-1 text-sm text-red-600 dark:text-red-400 underline">Sluiten</button>
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-green-800 dark:text-green-200">{successMessage}</p>
              </div>
            )}

            {/* Product List */}
            {isLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Producten laden...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
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
                        ['weight', 'Gewicht', 'text-center'],
                        ['description', 'Beschrijving', 'text-center'],
                        ['tags', 'Tags', 'text-left'],
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
                                : product.imageCount < 3
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                                  : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            }`}>
                              {product.imageCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {!product.weight || product.weight === 0 ? (
                              <div className="flex items-center justify-center gap-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">0 kg</span>
                                <button
                                  onClick={() => handleFixWeight(product.id)}
                                  disabled={isImageOperationPending}
                                  className="px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded hover:bg-orange-200 dark:hover:bg-orange-800/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  0,2 kg
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-600 dark:text-gray-400">{product.weight} kg</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {product.hasDescription ? (
                              <button
                                onClick={() => toggleDescription(product.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors cursor-pointer"
                              >
                                Ja {expandedDescriptionIds.has(product.id) ? '\u25B2' : '\u25BC'}
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">Nee</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {product.tags.length > 0 ? product.tags.map((tag) => (
                                <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{tag}</span>
                              )) : (
                                <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => toggleImageManager(product.id)}
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
                        {expandedDescriptionIds.has(product.id) && product.description && (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 bg-green-50 dark:bg-green-900/10">
                              <div className="text-sm text-gray-700 dark:text-gray-300 max-w-3xl" dangerouslySetInnerHTML={{ __html: product.description }} />
                            </td>
                          </tr>
                        )}
                        {expandedIds.has(product.id) && (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-4 bg-gray-50 dark:bg-gray-900/50"
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onDrop={(e) => handleFileDrop(e, product.id)}
                            >
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
