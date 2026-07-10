import { useState, useRef, useCallback } from 'react';

import type { ImageUploadConfig, ParsedProduct } from '@/lib/suppliers/types';

import type { ImagePoolItem } from './types';

interface EnhancedImageManagerProps {
  images: ImagePoolItem[];
  onImagesChange: (images: ImagePoolItem[]) => void;
  products: ParsedProduct[];
  imageUploadConfig?: ImageUploadConfig;
  onUpload: (images: ImagePoolItem[]) => Promise<void>;
  isUploading?: boolean;
}

export default function EnhancedImageManager({
  images,
  onImagesChange,
  products,
  imageUploadConfig,
  onUpload,
  isUploading = false,
}: EnhancedImageManagerProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [bulkUrlText, setBulkUrlText] = useState('');
  const [showBulkUrl, setShowBulkUrl] = useState(false);
  const [collapsedRefs, setCollapsedRefs] = useState<Set<string>>(new Set());
  const imageIdCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imagesByRef = new Map<string, ImagePoolItem[]>();
  const unassigned: ImagePoolItem[] = [];
  for (const img of images) {
    if (img.assignedReference) {
      const arr = imagesByRef.get(img.assignedReference) ?? [];
      arr.push(img);
      imagesByRef.set(img.assignedReference, arr);
    } else {
      unassigned.push(img);
    }
  }
  for (const [, imgs] of imagesByRef) {
    imgs.sort((a, b) => a.order - b.order);
  }

  const autoMatch = useCallback(
    (filename: string, relativePath?: string): string => {
      if (imageUploadConfig?.extractReference) {
        const ref = imageUploadConfig.extractReference(filename, relativePath);
        if (ref) {
          const exact = products.find((p) => p.reference === ref);
          if (exact) return exact.reference;
          const partial = products.find(
            (p) =>
              p.reference.toLowerCase().includes(ref.toLowerCase()) ||
              ref.toLowerCase().includes(p.reference.toLowerCase()),
          );
          if (partial) return partial.reference;
        }
      }

      const nameWithoutExt = filename.replace(/\.[^.]+$/, '').toLowerCase();
      for (const p of products) {
        if (nameWithoutExt.includes(p.reference.toLowerCase())) return p.reference;
      }
      return '';
    },
    [products, imageUploadConfig],
  );

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const newImages: ImagePoolItem[] = [];
      for (const file of Array.from(files)) {
        if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) continue;
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const relativePath =
          'webkitRelativePath' in file
            ? (file as File & { webkitRelativePath?: string }).webkitRelativePath
            : undefined;
        const assignedReference = autoMatch(file.name, relativePath);
        newImages.push({
          id: `eimg-${++imageIdCounter.current}`,
          dataUrl,
          filename: file.name,
          file,
          assignedReference,
          order: imagesByRef.get(assignedReference)?.length ?? 0 + newImages.filter((i) => i.assignedReference === assignedReference).length,
        });
      }
      onImagesChange([...images, ...newImages]);
    },
    [images, onImagesChange, autoMatch, imagesByRef],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
    },
    [processFiles],
  );

  const handleBulkUrlImport = useCallback(() => {
    const urls = bulkUrlText
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));
    if (urls.length === 0) return;

    const newImages: ImagePoolItem[] = urls.map((url) => {
      const filename = url.split('/').pop() ?? url;
      return {
        id: `eimg-${++imageIdCounter.current}`,
        dataUrl: url,
        filename,
        file: new File([], filename),
        assignedReference: autoMatch(filename),
        order: 0,
      };
    });
    onImagesChange([...images, ...newImages]);
    setBulkUrlText('');
    setShowBulkUrl(false);
  }, [bulkUrlText, images, onImagesChange, autoMatch]);

  const removeImage = useCallback(
    (id: string) => onImagesChange(images.filter((img) => img.id !== id)),
    [images, onImagesChange],
  );

  const handleReorder = useCallback(
    (imageId: string, targetId: string) => {
      const drag = images.find((i) => i.id === imageId);
      const drop = images.find((i) => i.id === targetId);
      if (!drag || !drop || drag.assignedReference !== drop.assignedReference) return;
      onImagesChange(
        images.map((i) => {
          if (i.id === imageId) return { ...i, order: drop.order };
          if (i.id === targetId) return { ...i, order: drag.order };
          return i;
        }),
      );
    },
    [images, onImagesChange],
  );

  const toggleCollapsed = useCallback((ref: string) => {
    setCollapsedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }, []);

  const assignedCount = images.filter((i) => i.assignedReference).length;

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6">
      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 text-lg">
        Afbeeldingenbeheer
      </h3>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 mb-4 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 scale-[1.01] shadow-lg'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-750'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            if (e.target.files) processFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <div className={`transition-transform duration-200 ${isDragOver ? 'scale-110' : ''}`}>
          <div className="text-4xl mb-2">{isDragOver ? '📥' : '🖼️'}</div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {isDragOver ? 'Laat los om te uploaden' : 'Sleep afbeeldingen hierheen of klik om te selecteren'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            JPG, PNG, WebP — meerdere bestanden tegelijk mogelijk
          </p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setShowBulkUrl(!showBulkUrl)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          URL&apos;s importeren
        </button>
        {images.length > 0 && (
          <button
            onClick={() => onImagesChange([])}
            className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
          >
            Alles wissen
          </button>
        )}
      </div>

      {/* Bulk URL textarea */}
      {showBulkUrl && (
        <div className="mb-4 p-3 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-750">
          <textarea
            value={bulkUrlText}
            onChange={(e) => setBulkUrlText(e.target.value)}
            placeholder="Plak afbeelding-URL's hier, één per regel..."
            rows={4}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-2 resize-none"
          />
          <button
            onClick={handleBulkUrlImport}
            disabled={!bulkUrlText.trim()}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            Importeer URL&apos;s
          </button>
        </div>
      )}

      {/* Summary */}
      {images.length > 0 && (
        <div className="flex gap-3 text-sm mb-4 flex-wrap">
          <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
            {images.length} afbeeldingen
          </span>
          <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
            {assignedCount} toegewezen
          </span>
          {unassigned.length > 0 && (
            <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full">
              {unassigned.length} niet toegewezen
            </span>
          )}
        </div>
      )}

      {/* Product sections */}
      {Array.from(imagesByRef.entries()).map(([ref, imgs]) => {
        const product = products.find((p) => p.reference === ref);
        const isCollapsed = collapsedRefs.has(ref);
        const sorted = [...imgs].sort((a, b) => a.order - b.order);

        return (
          <div key={ref} className="mb-3 border dark:border-gray-600 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleCollapsed(ref)}
              className="w-full bg-gray-50 dark:bg-gray-700 px-4 py-2.5 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
            >
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span className="text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
                {product?.name || ref}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({sorted.length} afbeelding{sorted.length !== 1 ? 'en' : ''})
                </span>
              </span>
            </button>

            {!isCollapsed && (
              <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
                {sorted.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', img.id);
                      e.dataTransfer.effectAllowed = 'move';
                      (e.currentTarget as HTMLElement).style.opacity = '0.4';
                    }}
                    onDragEnd={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = '1';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragId = e.dataTransfer.getData('text/plain');
                      if (dragId && dragId !== img.id) handleReorder(dragId, img.id);
                    }}
                    className="relative group cursor-grab active:cursor-grabbing"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.dataUrl}
                        alt={img.filename}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    </div>
                    {idx === 0 && (
                      <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow">
                        Hoofdafbeelding
                      </span>
                    )}
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">
                      {img.filename}
                    </p>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      aria-label="Verwijderen"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div className="mb-3 border border-orange-300 dark:border-orange-600 rounded-lg overflow-hidden">
          <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-2.5">
            <span className="font-medium text-sm text-orange-800 dark:text-orange-200">
              Niet toegewezen ({unassigned.length})
            </span>
          </div>
          <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
            {unassigned.map((img) => (
              <div key={img.id} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden border-2 border-orange-200 dark:border-orange-600 bg-gray-100 dark:bg-gray-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={img.filename}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">
                  {img.filename}
                </p>
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onImagesChange(
                      images.map((i) =>
                        i.id === img.id ? { ...i, assignedReference: e.target.value } : i,
                      ),
                    );
                  }}
                  className="w-full text-[10px] border dark:border-gray-600 rounded px-1 py-0.5 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Toewijzen aan...</option>
                  {products.map((p) => (
                    <option key={p.reference} value={p.reference}>
                      {p.name || p.reference}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  aria-label="Verwijderen"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload button */}
      {images.length > 0 && (
        <button
          onClick={() => onUpload(images.filter((i) => i.assignedReference))}
          disabled={isUploading || assignedCount === 0}
          className={`w-full py-3 rounded-lg font-bold text-sm transition-colors ${
            isUploading || assignedCount === 0
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
          }`}
        >
          {isUploading
            ? 'Uploaden...'
            : `Upload ${assignedCount} afbeelding${assignedCount !== 1 ? 'en' : ''} naar Odoo`}
        </button>
      )}
    </div>
  );
}
