import { useRef } from 'react';
import React from 'react';
import type { ImagePoolItem, ImportResultItem } from './types';
import type { ImageUploadConfig } from '@/lib/suppliers/types';

interface ImageManagerProps {
  imagePool: ImagePoolItem[];
  setImagePool: React.Dispatch<React.SetStateAction<ImagePoolItem[]>>;
  importResults: ImportResultItem[];
  imgConfig: ImageUploadConfig;
  isLoading: boolean;
  onUploadAll: () => Promise<void>;
}

export default function ImageManager({
  imagePool,
  setImagePool,
  importResults,
  imgConfig,
  isLoading,
  onUploadAll,
}: ImageManagerProps) {
  const imageIdCounter = useRef(0);

  const successfulRefs = importResults.filter(
    (r) => r.success && r.templateId,
  );

  const imagesByRef = new Map<string, ImagePoolItem[]>();
  const unassigned: ImagePoolItem[] = [];
  for (const img of imagePool) {
    if (img.assignedReference) {
      const existing = imagesByRef.get(img.assignedReference) || [];
      existing.push(img);
      imagesByRef.set(img.assignedReference, existing);
    } else {
      unassigned.push(img);
    }
  }

  for (const [, imgs] of imagesByRef) {
    imgs.sort((a, b) => a.order - b.order);
  }

  const handleImageAdd = async (files: FileList | File[]) => {
    const newImages: ImagePoolItem[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(jpg|jpeg|png|webp)$/i.test(file.name)) continue;
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      let assignedReference = '';
      if (imgConfig.extractReference) {
        const relativePath =
          'webkitRelativePath' in file
            ? (file as File & { webkitRelativePath?: string })
                .webkitRelativePath
            : undefined;
        const ref = imgConfig.extractReference(file.name, relativePath);
        if (ref) {
          const exactMatch = successfulRefs.find(
            (r) => r.reference === ref,
          );
          if (exactMatch) {
            assignedReference = exactMatch.reference;
          } else {
            const partialMatch = successfulRefs.find(
              (r) =>
                r.reference.toLowerCase().includes(ref.toLowerCase()) ||
                ref.toLowerCase().includes(r.reference.toLowerCase()),
            );
            if (partialMatch) assignedReference = partialMatch.reference;
          }
        }
      }

      newImages.push({
        id: `img-${++imageIdCounter.current}`,
        dataUrl,
        filename: file.name,
        file,
        assignedReference,
        order: imagesByRef.get(assignedReference)?.length || 0,
      });
    }
    setImagePool((prev) => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImagePool((prev) => prev.filter((img) => img.id !== id));
  };

  const assignImage = (imageId: string, reference: string) => {
    setImagePool((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, assignedReference: reference, order: 999 }
          : img,
      ),
    );
  };

  let dragImageId: string | null = null;

  const handleImageDragStart = (e: React.DragEvent, imageId: string) => {
    dragImageId = imageId;
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).style.opacity = '0.4';
  };

  const handleImageDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragImageId = null;
  };

  const handleImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleImageDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragImageId || dragImageId === targetId) return;

    setImagePool((prev) => {
      const dragImg = prev.find((i) => i.id === dragImageId);
      const dropImg = prev.find((i) => i.id === targetId);
      if (!dragImg || !dropImg) return prev;
      if (dragImg.assignedReference !== dropImg.assignedReference) return prev;

      const dragOrder = dragImg.order;
      const dropOrder = dropImg.order;
      return prev.map((i) => {
        if (i.id === dragImageId) return { ...i, order: dropOrder };
        if (i.id === targetId) return { ...i, order: dragOrder };
        return i;
      });
    });
    dragImageId = null;
  };

  const moveImage = (imageId: string, direction: 'up' | 'down') => {
    setImagePool((prev) => {
      const img = prev.find((i) => i.id === imageId);
      if (!img || !img.assignedReference) return prev;
      const group = prev
        .filter((i) => i.assignedReference === img.assignedReference)
        .sort((a, b) => a.order - b.order);
      const idx = group.findIndex((i) => i.id === imageId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= group.length) return prev;

      const swapId = group[swapIdx].id;
      const imgOrder = img.order;
      const swapOrder = group[swapIdx].order;
      return prev.map((i) => {
        if (i.id === imageId) return { ...i, order: swapOrder };
        if (i.id === swapId) return { ...i, order: imgOrder };
        return i;
      });
    });
  };

  const addMoreToRef = async (ref: string, files: FileList) => {
    const currentCount = imagesByRef.get(ref)?.length || 0;
    const newImgs: ImagePoolItem[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newImgs.push({
        id: `img-${++imageIdCounter.current}`,
        dataUrl,
        filename: file.name,
        file,
        assignedReference: ref,
        order: currentCount + newImgs.length,
      });
    }
    setImagePool((prev) => [...prev, ...newImgs]);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 mb-6">
      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-lg">
        📸 Afbeeldingen Uploaden
      </h3>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
        {imgConfig.instructions}
      </p>
      {imgConfig.exampleFilenames.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Voorbeelden:{' '}
          {imgConfig.exampleFilenames.map((fn, i) => (
            <code
              key={i}
              className="bg-gray-100 dark:bg-gray-700 px-1 rounded mx-1"
            >
              {fn}
            </code>
          ))}
        </p>
      )}

      {/* Upload buttons */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              if (e.target.files) handleImageAdd(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
            id="generic-images-upload"
          />
          <label
            htmlFor="generic-images-upload"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium inline-block"
          >
            🖼️ Selecteer Bestanden
          </label>
        </div>
        <div>
          <input
            type="file"
            {...(
              {
                webkitdirectory: '',
                directory: '',
              } as React.InputHTMLAttributes<HTMLInputElement>
            )}
            onChange={(e) => {
              if (e.target.files) handleImageAdd(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
            id="generic-images-folder"
          />
          <label
            htmlFor="generic-images-folder"
            className="px-4 py-2 bg-green-600 text-white rounded-lg cursor-pointer hover:bg-green-700 font-medium inline-block"
          >
            📁 {imagePool.length > 0 ? 'Voeg map toe' : 'Selecteer Map'}
          </label>
        </div>
        {imagePool.length > 0 && (
          <button
            onClick={() => setImagePool([])}
            className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium ml-auto"
          >
            Wis alles
          </button>
        )}
      </div>

      {imagePool.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex gap-4 text-sm mb-4">
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
              {imagePool.length} afbeeldingen
            </span>
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
              {imagePool.filter((i) => i.assignedReference).length} toegewezen
            </span>
            {unassigned.length > 0 && (
              <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full">
                {unassigned.length} niet toegewezen
              </span>
            )}
          </div>

          {/* Assigned images grouped by product */}
          {Array.from(imagesByRef.entries()).map(([ref, imgs]) => {
            const product = importResults.find((r) => r.reference === ref);
            const sorted = [...imgs].sort((a, b) => a.order - b.order);
            return (
              <div
                key={ref}
                className="mb-4 border dark:border-gray-600 rounded-lg overflow-hidden"
              >
                <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {product?.name || ref}
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      ({sorted.length} afbeeldingen)
                    </span>
                  </span>
                </div>
                <div className="p-3 flex gap-2 flex-wrap">
                  {sorted.map((img, idx) => (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={(e) => handleImageDragStart(e, img.id)}
                      onDragEnd={handleImageDragEnd}
                      onDragOver={handleImageDragOver}
                      onDrop={(e) => handleImageDrop(e, img.id)}
                      className="relative group w-28 flex-shrink-0 cursor-grab active:cursor-grabbing"
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
                        <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                          HOOFD
                        </span>
                      )}
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">
                        {img.filename}
                      </p>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                        <button
                          onClick={() => moveImage(img.id, 'up')}
                          disabled={idx === 0}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100"
                          title="Naar links"
                        >
                          &larr;
                        </button>
                        <button
                          onClick={() => moveImage(img.id, 'down')}
                          disabled={idx === sorted.length - 1}
                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100"
                          title="Naar rechts"
                        >
                          &rarr;
                        </button>
                        <button
                          onClick={() => removeImage(img.id)}
                          className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600"
                          title="Verwijderen"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Add more button */}
                  <label className="w-28 aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex-shrink-0">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addMoreToRef(ref, e.target.files);
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
            <div className="mb-4 border border-orange-300 dark:border-orange-600 rounded-lg overflow-hidden">
              <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-2">
                <span className="font-medium text-sm text-orange-800 dark:text-orange-200">
                  Niet toegewezen ({unassigned.length})
                </span>
              </div>
              <div className="p-3 flex gap-2 flex-wrap">
                {unassigned.map((img) => (
                  <div
                    key={img.id}
                    className="relative group w-28 flex-shrink-0"
                  >
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
                    <div className="mt-1">
                      <select
                        value=""
                        onChange={(e) =>
                          e.target.value &&
                          assignImage(img.id, e.target.value)
                        }
                        className="w-full text-[10px] border dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Toewijzen aan...</option>
                        {successfulRefs.map((r) => (
                          <option key={r.reference} value={r.reference}>
                            {r.name || r.reference}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={onUploadAll}
            disabled={
              isLoading ||
              imagePool.filter((i) => i.assignedReference).length === 0
            }
            className={`w-full py-3 rounded-lg font-bold text-lg ${
              isLoading ||
              imagePool.filter((i) => i.assignedReference).length === 0
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isLoading
              ? 'Uploaden...'
              : `Upload ${imagePool.filter((i) => i.assignedReference).length} afbeeldingen naar Odoo`}
          </button>
        </>
      )}
    </div>
  );
}
