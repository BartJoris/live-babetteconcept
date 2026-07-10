import { useState, useRef, useCallback } from 'react';
import type { UseImportWizardReturn } from '@/hooks/useImportWizard';
import type { ImagePoolItem } from '@/components/import/shared/types';
import { compressImage } from '@/lib/import/shared/image-utils';
import { supportsDirectoryPicker, isIOS } from '@/lib/import/shared/browser-utils';

interface ImageStepProps {
  wizard: UseImportWizardReturn;
}

export default function ImageStep({ wizard }: ImageStepProps) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [dragOverProduct, setDragOverProduct] = useState<string | null>(null);
  const [bulkUrls, setBulkUrls] = useState('');
  const [fetchingUrls, setFetchingUrls] = useState(false);
  const [globalDragActive, setGlobalDragActive] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const [addToProductRef, setAddToProductRef] = useState<string | null>(null);

  const selectedProductsList = wizard.parsedProducts.filter((p) =>
    wizard.selectedProducts.has(p.reference),
  );

  const getProductImages = useCallback(
    (reference: string) =>
      wizard.imagePool
        .filter((img) => img.assignedReference === reference)
        .sort((a, b) => a.order - b.order),
    [wizard.imagePool],
  );

  const unassignedImages = wizard.imagePool.filter((img) => !img.assignedReference);

  const productsWithImages = selectedProductsList.filter(
    (p) => getProductImages(p.reference).length > 0,
  );

  const toggleExpanded = (ref: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const removeImage = (imageId: string) => {
    wizard.setImagePool((prev) => prev.filter((img) => img.id !== imageId));
  };

  const assignImage = (imageId: string, reference: string) => {
    wizard.setImagePool((prev) =>
      prev.map((img) =>
        img.id === imageId ? { ...img, assignedReference: reference } : img,
      ),
    );
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    wizard.setImagePool((prev) => {
      const img = prev.find((i) => i.id === imageId);
      if (!img) return prev;

      const siblings = prev
        .filter((i) => i.assignedReference === img.assignedReference)
        .sort((a, b) => a.order - b.order);

      const idx = siblings.findIndex((i) => i.id === imageId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return prev;

      const swapTarget = siblings[swapIdx];
      return prev.map((i) => {
        if (i.id === imageId) return { ...i, order: swapTarget.order };
        if (i.id === swapTarget.id) return { ...i, order: img.order };
        return i;
      });
    });
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setGlobalDragActive(false);
    if (e.dataTransfer.files?.length) {
      await wizard.addImagesFromFiles(e.dataTransfer.files);
    }
  };

  const handleProductDrop = async (e: React.DragEvent, reference: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverProduct(null);

    const imageId = e.dataTransfer.getData('text/plain');
    if (imageId) {
      assignImage(imageId, reference);
      return;
    }

    if (e.dataTransfer.files?.length) {
      const files = e.dataTransfer.files;
      const newImages: ImagePoolItem[] = [];
      const existingCount = getProductImages(reference).length;

      for (const file of Array.from(files)) {
        if (!/\.(jpe?g|png|webp|gif)$/i.test(file.name)) continue;

        const rawDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Kon bestand niet lezen: ${file.name}`));
          reader.readAsDataURL(file);
        });
        const dataUrl = await compressImage(rawDataUrl);

        newImages.push({
          id: `img-${++wizard.imageIdCounter.current}`,
          dataUrl,
          filename: file.name,
          file,
          assignedReference: reference,
          order: existingCount + newImages.length,
        });
      }

      wizard.setImagePool((prev) => [...prev, ...newImages]);
    }
  };

  const handleAddToProduct = async (files: FileList | null, reference: string) => {
    if (!files) return;
    const existingCount = getProductImages(reference).length;
    const newImages: ImagePoolItem[] = [];

    for (const file of Array.from(files)) {
      if (!/\.(jpe?g|png|webp|gif)$/i.test(file.name)) continue;

      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Kon bestand niet lezen: ${file.name}`));
        reader.readAsDataURL(file);
      });
      const dataUrl = await compressImage(rawDataUrl);

      newImages.push({
        id: `img-${++wizard.imageIdCounter.current}`,
        dataUrl,
        filename: file.name,
        file,
        assignedReference: reference,
        order: existingCount + newImages.length,
      });
    }

    wizard.setImagePool((prev) => [...prev, ...newImages]);
  };

  const fetchUrlImages = async () => {
    const urls = bulkUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));
    if (urls.length === 0) return;

    setFetchingUrls(true);
    try {
      for (const url of urls) {
        try {
          const response = await fetch('/api/upload-image-from-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });

          if (!response.ok) continue;

          const data = await response.json();
          if (!data.base64) continue;

          const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg';
          const dataUrl = `data:image/jpeg;base64,${data.base64}`;

          wizard.setImagePool((prev) => [
            ...prev,
            {
              id: `img-${++wizard.imageIdCounter.current}`,
              dataUrl,
              filename,
              file: new File([], filename),
              assignedReference: '',
              order: 0,
            },
          ]);
        } catch {
          console.error(`Kon URL niet ophalen: ${url}`);
        }
      }
      setBulkUrls('');
    } finally {
      setFetchingUrls(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        🖼️ Afbeeldingen
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Wijs afbeeldingen toe aan producten. Sleep bestanden, selecteer een map, of voeg URLs toe.
      </p>

      {/* Summary bar */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-blue-800 dark:text-blue-200 font-medium">
            {productsWithImages.length} van {selectedProductsList.length} producten hebben afbeeldingen
          </span>
          <span className="text-sm text-blue-600 dark:text-blue-300">
            {wizard.imagePool.length} afbeeldingen totaal
            {unassignedImages.length > 0 && (
              <span className="text-orange-600 dark:text-orange-400 ml-2">
                ({unassignedImages.length} niet toegewezen)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Per-product sections */}
      <div className="space-y-3 mb-8">
        {selectedProductsList.map((product) => {
          const images = getProductImages(product.reference);
          const isExpanded = expandedProducts.has(product.reference);
          const isDragOver = dragOverProduct === product.reference;

          return (
            <div
              key={product.reference}
              className={`border rounded-lg overflow-hidden transition-colors ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverProduct(product.reference);
              }}
              onDragLeave={() => setDragOverProduct(null)}
              onDrop={(e) => handleProductDrop(e, product.reference)}
            >
              {/* Product header */}
              <button
                type="button"
                onClick={() => toggleExpanded(product.reference)}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {product.reference}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-md">
                    {product.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      images.length > 0
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                    }`}
                  >
                    {images.length} afb.
                  </span>
                  <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                  {images.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                      {images.map((img, idx) => (
                        <div
                          key={img.id}
                          className="relative group border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', img.id)}
                        >
                          <img
                            src={img.dataUrl}
                            alt={img.filename}
                            className="w-full h-28 object-cover"
                          />
                          {idx === 0 && (
                            <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                              Hoofdafbeelding
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveImage(img.id, 'up')}
                              disabled={idx === 0}
                              className="p-1 bg-white/90 rounded text-gray-700 text-xs disabled:opacity-30 hover:bg-white"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(img.id, 'down')}
                              disabled={idx === images.length - 1}
                              className="p-1 bg-white/90 rounded text-gray-700 text-xs disabled:opacity-30 hover:bg-white"
                            >
                              →
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImage(img.id)}
                              className="p-1 bg-red-500 rounded text-white text-xs hover:bg-red-600"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="px-2 py-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
                            {img.filename}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Geen afbeeldingen. Sleep bestanden hierheen of klik op &quot;+ Toevoegen&quot;.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setAddToProductRef(product.reference);
                      productFileInputRef.current?.click();
                    }}
                    className="text-sm px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    + Toevoegen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden file input for adding images to a specific product */}
      <input
        ref={productFileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (addToProductRef && e.target.files) {
            handleAddToProduct(e.target.files, addToProductRef);
          }
          setAddToProductRef(null);
          e.target.value = '';
        }}
      />

      {/* Unassigned images */}
      {unassignedImages.length > 0 && (
        <div className="border-2 border-orange-300 dark:border-orange-600 rounded-lg p-4 mb-8 bg-orange-50 dark:bg-orange-900/10">
          <h3 className="font-bold text-orange-800 dark:text-orange-200 mb-3">
            Niet-toegewezen afbeeldingen ({unassignedImages.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {unassignedImages.map((img) => (
              <div
                key={img.id}
                className="border border-orange-200 dark:border-orange-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', img.id)}
              >
                <img
                  src={img.dataUrl}
                  alt={img.filename}
                  className="w-full h-20 object-cover"
                />
                <div className="p-2">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mb-1">
                    {img.filename}
                  </p>
                  <select
                    className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) assignImage(img.id, e.target.value);
                    }}
                  >
                    <option value="">Toewijzen aan...</option>
                    {selectedProductsList.map((p) => (
                      <option key={p.reference} value={p.reference}>
                        {p.reference} - {p.name.slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="w-full text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 py-1 border-t border-orange-200 dark:border-orange-700"
                >
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global actions */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-8 bg-white dark:bg-gray-800">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">
          Afbeeldingen toevoegen
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File/folder selection */}
          <div>
            <div className="flex gap-3 mb-4">
              {supportsDirectoryPicker() ? (
                <label className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                  📁 Selecteer map
                  <input
                    ref={folderInputRef}
                    type="file"
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) wizard.addImagesFromFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic self-center">
                  {isIOS()
                    ? 'Map selectie is niet beschikbaar op iOS. Gebruik "Selecteer bestanden" of sleep bestanden.'
                    : 'Map selectie is niet beschikbaar in deze browser.'}
                </div>
              )}
              <label className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                📎 Selecteer bestanden
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) wizard.addImagesFromFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setGlobalDragActive(true);
              }}
              onDragLeave={() => setGlobalDragActive(false)}
              onDrop={handleGlobalDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                globalDragActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Sleep bestanden hierheen
              </p>
            </div>
          </div>

          {/* URL import */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              URLs importeren (één per regel)
            </label>
            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              rows={4}
              placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-y"
            />
            <button
              type="button"
              onClick={fetchUrlImages}
              disabled={fetchingUrls || !bulkUrls.trim()}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fetchingUrls ? 'Bezig met ophalen...' : 'URLs ophalen'}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => wizard.setCurrentStep(4)}
          className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
        >
          ← Terug
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => wizard.setCurrentStep(6)}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Ga verder zonder afbeeldingen
          </button>
          <button
            onClick={() => wizard.setCurrentStep(6)}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            Ga verder →
          </button>
        </div>
      </div>
    </div>
  );
}
