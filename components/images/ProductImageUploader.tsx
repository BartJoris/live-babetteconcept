import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

import type { ImageTarget, PoolImage, ProductImageUploaderMode, UploadPoolResult } from '@/lib/images/types';
import type { ImageUploadConfig, SupplierPlugin } from '@/lib/suppliers/types';
import type { ImageUploadProgress } from '@/lib/import/image-upload-client';
import { matchFilenameToTarget } from '@/lib/images/match-images';
import { uploadPoolByTemplate } from '@/lib/images/upload-pool';
import { compressImage } from '@/lib/import/shared/image-utils';
import {
  collectFilesFromDataTransfer,
  supportsDirectoryPicker,
  isIOS,
} from '@/lib/import/shared/browser-utils';
import ImageUploadProgressBar from '@/components/import/shared/ImageUploadProgressBar';
import { getSupplier, getAllSuppliers } from '@/lib/suppliers';

// ─── Catalog-mode internal types ─────────────────────────────────────────

interface OdooProduct {
  templateId: number;
  name: string;
  internalRef: string;
  hasImage: boolean;
  mainThumbnail: string | null;
  galleryImages: Array<{ id: number; name: string; thumbnail: string; sequence: number }>;
  createDate: string;
  isFavorite: boolean;
  isPublished: boolean;
  variantCount: number;
}

type FilterMode = 'all' | 'favorites' | 'no-images' | 'recent';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isRecent(dateStr: string, days = 7): boolean {
  if (!dateStr) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(dateStr) >= cutoff;
}

/** Prefer Play Up-style Artikel_Kleur from description or trailing (REF) in the name. */
function resolveCatalogReference(internalRef: string, name: string): string {
  const fromDesc = (internalRef || '').split('|')[0].trim();
  if (/^\d[A-Za-z0-9]+_[A-Za-z][A-Za-z0-9]*$/.test(fromDesc)) {
    return fromDesc;
  }
  const fromName = name.match(/\(([0-9A-Za-z]+_[0-9A-Za-z]+)\)\s*$/);
  if (fromName) return fromName[1];
  return fromDesc || '';
}

// ─── Props ───────────────────────────────────────────────────────────────

export interface ProductImageUploaderProps {
  mode: ProductImageUploaderMode;

  targets?: ImageTarget[];
  images: PoolImage[];
  onImagesChange: (images: PoolImage[]) => void;

  imageUploadConfig?: ImageUploadConfig | null;
  enableFolderPick?: boolean;
  enableCompress?: boolean;
  enableUrlImport?: boolean;
  fetchUrlsViaApi?: boolean;
  showUploadButton?: boolean;
  showInstructions?: boolean;

  onUpload?: (images: PoolImage[]) => Promise<void>;
  isUploading?: boolean;
  uploadProgress?: ImageUploadProgress | null;

  onSkip?: () => void;

  // Catalog-mode specifics
  vendorId?: string;
  onVendorChange?: (vendorId: string) => void;
}

let _poolId = 0;

export default function ProductImageUploader({
  mode,
  targets: externalTargets,
  images,
  onImagesChange,
  imageUploadConfig,
  enableFolderPick = true,
  enableCompress,
  enableUrlImport = true,
  fetchUrlsViaApi = false,
  showUploadButton,
  showInstructions,
  onUpload,
  isUploading = false,
  uploadProgress: externalUploadProgress,
  onSkip,
  vendorId: initialVendorId,
  onVendorChange,
}: ProductImageUploaderProps) {
  // ─── Resolve defaults per mode ────────────────────────────────────────
  const compress = enableCompress ?? (mode === 'catalog');
  const shouldShowUpload = showUploadButton ?? (mode !== 'wizard');
  const shouldShowInstructions = showInstructions ?? true;

  // ─── Catalog-mode state ───────────────────────────────────────────────
  const [selectedVendor, setSelectedVendor] = useState(initialVendorId || '');
  const [plugin, setPlugin] = useState<SupplierPlugin | null>(null);
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [uploadResults, setUploadResults] = useState<UploadPoolResult[]>([]);
  const [internalUploadProgress, setInternalUploadProgress] = useState<ImageUploadProgress | null>(null);
  const [internalUploading, setInternalUploading] = useState(false);

  // ─── Shared state ─────────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const [bulkUrlText, setBulkUrlText] = useState('');
  const [showBulkUrl, setShowBulkUrl] = useState(false);
  const [fetchingUrls, setFetchingUrls] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(_poolId);

  const activeUploadProgress = externalUploadProgress ?? internalUploadProgress;
  const activeUploading = isUploading || internalUploading;

  // ─── Catalog: init vendor ─────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'catalog') return;
    if (initialVendorId && !selectedVendor) {
      setSelectedVendor(initialVendorId);
      const p = getSupplier(initialVendorId);
      if (p) setPlugin(p);
    }
  }, [mode, initialVendorId, selectedVendor]);

  useEffect(() => {
    if (mode !== 'catalog' || !selectedVendor || !plugin) return;
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor, plugin]);

  const ensureLoggedIn = async () => {
    try {
      const response = await fetch('/api/session');
      const data = await response.json();
      return Boolean(data.isLoggedIn);
    } catch {
      return false;
    }
  };

  const loadProducts = async () => {
    if (!plugin) return;
    setCatalogLoading(true);
    try {
      if (!(await ensureLoggedIn())) {
        alert('Geen Odoo credentials. Log eerst in.');
        setCatalogLoading(false);
        return;
      }
      const response = await fetch('/api/search-products-by-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: plugin.brandName }),
      });
      const data = await response.json();
      if (data.success && data.products) {
        setProducts(
          data.products.map((p: Record<string, unknown>) => ({
            templateId: p.template_id as number,
            name: (p.name as string) || '',
            internalRef: (p.internalRef as string) || '',
            hasImage: Boolean(p.hasImage),
            mainThumbnail: (p.mainThumbnail as string) || null,
            galleryImages: (p.galleryImages as OdooProduct['galleryImages']) || [],
            isFavorite: Boolean(p.isFavorite),
            isPublished: Boolean(p.isPublished),
            createDate: (p.createDate as string) || '',
            variantCount: (p.variantCount as number) || 0,
          })),
        );
      }
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setCatalogLoading(false);
    }
  };

  // ─── Targets: external or built from catalog ──────────────────────────
  const catalogTargets = useMemo<ImageTarget[]>(() => {
    if (mode !== 'catalog') return [];
    return products
      .filter((p) => selectedTemplateIds.has(p.templateId))
      .map((p) => {
        const reference = resolveCatalogReference(p.internalRef, p.name);
        return {
          // Prefer reference as key so extractReference("0AT…_1.jpg") matches exactly.
          key: reference || String(p.templateId),
          label: p.name,
          templateId: p.templateId,
          reference,
          hasExistingImages: p.hasImage || p.galleryImages.length > 0,
          mainThumbnail: p.mainThumbnail,
          galleryThumbnails: p.galleryImages,
        };
      });
  }, [mode, products, selectedTemplateIds]);

  const targets = externalTargets ?? catalogTargets;
  const resolvedConfig = imageUploadConfig ?? plugin?.imageUpload ?? null;

  // ─── Catalog filters ──────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let result = products;
    switch (filterMode) {
      case 'favorites':
        result = result.filter((p) => p.isFavorite);
        break;
      case 'no-images':
        result = result.filter((p) => !p.hasImage);
        break;
      case 'recent':
        result = result.filter((p) => isRecent(p.createDate));
        break;
      case 'all':
        break;
      default: {
        const _exhaustive: never = filterMode;
        throw new Error(`Unhandled filter mode: ${_exhaustive}`);
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.internalRef.toLowerCase().includes(q),
      );
    }
    return result;
  }, [products, filterMode, searchQuery]);

  const filterCounts = useMemo(
    () => ({
      all: products.length,
      favorites: products.filter((p) => p.isFavorite).length,
      noImages: products.filter((p) => !p.hasImage).length,
      recent: products.filter((p) => isRecent(p.createDate)).length,
    }),
    [products],
  );

  // ─── Image grouping ───────────────────────────────────────────────────
  const imagesByKey = useMemo(() => {
    const map = new Map<string, PoolImage[]>();
    for (const img of images) {
      if (!img.assignedKey) continue;
      const arr = map.get(img.assignedKey) || [];
      arr.push(img);
      map.set(img.assignedKey, arr);
    }
    for (const [, imgs] of map) imgs.sort((a, b) => a.order - b.order);
    return map;
  }, [images]);

  const unassigned = useMemo(
    () => images.filter((i) => !i.assignedKey),
    [images],
  );

  const assignedCount = images.length - unassigned.length;

  // ─── Auto-match ───────────────────────────────────────────────────────
  const autoMatch = useCallback(
    (filename: string, relativePath?: string): string =>
      matchFilenameToTarget(filename, targets, resolvedConfig, relativePath),
    [targets, resolvedConfig],
  );

  // ─── Process files ────────────────────────────────────────────────────
  const processFiles = useCallback(
    async (files: FileList | File[], forceKey?: string) => {
      const newImages: PoolImage[] = [];

      for (const file of Array.from(files)) {
        if (!/\.(jpe?g|png|webp|gif)$/i.test(file.name)) continue;

        const rawDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Kon bestand niet lezen: ${file.name}`));
          reader.readAsDataURL(file);
        });
        const dataUrl = compress ? await compressImage(rawDataUrl) : rawDataUrl;

        const relativePath =
          'webkitRelativePath' in file
            ? (file as File & { webkitRelativePath?: string }).webkitRelativePath
            : undefined;

        const assignedKey = forceKey ?? autoMatch(file.name, relativePath);
        const existingCount =
          (imagesByKey.get(assignedKey)?.length ?? 0) +
          newImages.filter((i) => i.assignedKey === assignedKey).length;

        newImages.push({
          id: `piu-${++idCounter.current}`,
          dataUrl,
          filename: file.name,
          file,
          assignedKey,
          order: existingCount,
        });
      }

      onImagesChange([...images, ...newImages]);
    },
    [images, onImagesChange, autoMatch, compress, imagesByKey],
  );

  // ─── Drop handler ─────────────────────────────────────────────────────
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = await collectFilesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) await processFiles(files);
    },
    [processFiles],
  );

  // ─── Bulk URL import ──────────────────────────────────────────────────
  const handleBulkUrlImport = useCallback(async () => {
    const urls = bulkUrlText
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));
    if (urls.length === 0) return;

    if (fetchUrlsViaApi) {
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

            onImagesChange([
              ...images,
              {
                id: `piu-${++idCounter.current}`,
                dataUrl,
                filename,
                file: new File([], filename),
                assignedKey: autoMatch(filename),
                order: 0,
              },
            ]);
          } catch {
            console.error(`Kon URL niet ophalen: ${url}`);
          }
        }
      } finally {
        setFetchingUrls(false);
      }
    } else {
      const newImages: PoolImage[] = urls.map((url) => {
        const filename = url.split('/').pop() ?? url;
        return {
          id: `piu-${++idCounter.current}`,
          dataUrl: url,
          filename,
          file: new File([], filename),
          assignedKey: autoMatch(filename),
          order: 0,
        };
      });
      onImagesChange([...images, ...newImages]);
    }

    setBulkUrlText('');
    setShowBulkUrl(false);
  }, [bulkUrlText, images, onImagesChange, autoMatch, fetchUrlsViaApi]);

  // ─── Image manipulation ───────────────────────────────────────────────
  const removeImage = useCallback(
    (id: string) => onImagesChange(images.filter((img) => img.id !== id)),
    [images, onImagesChange],
  );

  const assignImage = useCallback(
    (imageId: string, key: string) => {
      onImagesChange(
        images.map((img) =>
          img.id === imageId ? { ...img, assignedKey: key, order: 999 } : img,
        ),
      );
    },
    [images, onImagesChange],
  );

  const moveImage = useCallback(
    (imageId: string, direction: 'up' | 'down') => {
      const img = images.find((i) => i.id === imageId);
      if (!img || !img.assignedKey) return;
      const group = images
        .filter((i) => i.assignedKey === img.assignedKey)
        .sort((a, b) => a.order - b.order);
      const idx = group.findIndex((i) => i.id === imageId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= group.length) return;
      const swapTarget = group[swapIdx];
      onImagesChange(
        images.map((i) => {
          if (i.id === imageId) return { ...i, order: swapTarget.order };
          if (i.id === swapTarget.id) return { ...i, order: img.order };
          return i;
        }),
      );
    },
    [images, onImagesChange],
  );

  const handleReorder = useCallback(
    (imageId: string, targetId: string) => {
      const drag = images.find((i) => i.id === imageId);
      const drop = images.find((i) => i.id === targetId);
      if (!drag || !drop || drag.assignedKey !== drop.assignedKey) return;
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

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ─── Upload handler ───────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    const assigned = images.filter((i) => i.assignedKey);
    if (assigned.length === 0) {
      alert('Geen afbeeldingen toegewezen.');
      return;
    }

    if (onUpload) {
      await onUpload(assigned);
      return;
    }

    const targetsWithTemplates = targets.filter((t) => t.templateId);
    if (targetsWithTemplates.length === 0) {
      alert('Geen producten met template IDs gevonden.');
      return;
    }

    if (!(await ensureLoggedIn())) {
      alert('Geen Odoo credentials.');
      return;
    }

    setInternalUploading(true);
    try {
      const results = await uploadPoolByTemplate({
        images: assigned,
        targets,
        onProgress: setInternalUploadProgress,
        concurrency: 1,
      });
      setUploadResults(results);
      const failed = results.filter((r) => !r.success || r.failed > 0);
      if (failed.length > 0) {
        const sample = failed
          .flatMap((r) => r.errors || [])
          .slice(0, 5)
          .join('\n');
        const ok = results.reduce((s, r) => s + r.uploaded, 0);
        alert(
          `Upload deels mislukt: ${ok} ok, ${failed.length} product(en) met fouten.\n\n${sample}`,
        );
      }
    } catch (err) {
      alert(`Fout: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInternalUploadProgress(null);
      setInternalUploading(false);
    }
  }, [images, targets, onUpload]);

  // ─── Catalog: vendor selection ────────────────────────────────────────
  const handleVendorSelect = (vid: string) => {
    setSelectedVendor(vid);
    const p = getSupplier(vid);
    setPlugin(p || null);
    onImagesChange([]);
    setUploadResults([]);
    setSelectedTemplateIds(new Set());
    onVendorChange?.(vid);
  };

  const toggleProduct = (id: number) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredProducts) next.add(p.templateId);
      return next;
    });
  };

  const deselectAll = () => setSelectedTemplateIds(new Set());

  // ─── Render helpers ───────────────────────────────────────────────────

  const renderDropZone = () => (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
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
        onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />
      <div className={`transition-transform duration-200 ${isDragOver ? 'scale-110' : ''}`}>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isDragOver
            ? 'Laat los om te uploaden'
            : 'Sleep foto’s of een hele map hierheen, of klik om te selecteren'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          JPG, PNG, WebP — losse bestanden of map (niet-afbeeldingen worden genegeerd)
        </p>
      </div>
    </div>
  );

  const renderToolbar = () => (
    <div className="flex flex-wrap gap-2 mb-4">
      {enableFolderPick && supportsDirectoryPicker() && (
        <label className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 font-medium">
          Selecteer map
          <input
            type="file"
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
            className="hidden"
          />
        </label>
      )}
      {enableFolderPick && !supportsDirectoryPicker() && (
        <span className="text-sm text-gray-500 dark:text-gray-400 italic self-center">
          {isIOS() ? 'Map selectie niet beschikbaar op iOS' : 'Map selectie niet beschikbaar'}
        </span>
      )}
      {enableUrlImport && (
        <button
          onClick={() => setShowBulkUrl(!showBulkUrl)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          URL&apos;s importeren
        </button>
      )}
      {images.length > 0 && (
        <button
          onClick={() => onImagesChange([])}
          className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
        >
          Alles wissen
        </button>
      )}
    </div>
  );

  const renderBulkUrlInput = () => {
    if (!showBulkUrl) return null;
    return (
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
          disabled={!bulkUrlText.trim() || fetchingUrls}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          {fetchingUrls ? 'Bezig met ophalen...' : "Importeer URL's"}
        </button>
      </div>
    );
  };

  const renderSummary = () => {
    if (images.length === 0) return null;
    return (
      <div className="flex gap-3 text-sm mb-4 flex-wrap items-center">
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
    );
  };

  const renderImageTile = (
    img: PoolImage,
    idx: number,
    total: number,
    showMainBadge: boolean,
    showExistingBadge?: boolean,
  ) => (
    <div
      key={img.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', img.id);
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.opacity = '0.4';
      }}
      onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDrop={(e) => {
        e.preventDefault();
        const dragId = e.dataTransfer.getData('text/plain');
        if (dragId && dragId !== img.id) handleReorder(dragId, img.id);
      }}
      className="relative group w-28 flex-shrink-0 cursor-grab active:cursor-grabbing"
    >
      <div className={`aspect-square rounded-lg overflow-hidden border-2 bg-gray-100 dark:bg-gray-700 ${
        showExistingBadge ? 'border-green-300 dark:border-green-700' : 'border-blue-300 dark:border-blue-600'
      }`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover pointer-events-none" />
      </div>
      {showMainBadge && idx === 0 && (
        <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow">
          Hoofdafbeelding
        </span>
      )}
      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
        <button onClick={() => moveImage(img.id, 'up')} disabled={idx === 0}
          className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs disabled:opacity-30">&larr;</button>
        <button onClick={() => moveImage(img.id, 'down')} disabled={idx === total - 1}
          className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs disabled:opacity-30">&rarr;</button>
        <button onClick={() => removeImage(img.id)}
          className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
      </div>
    </div>
  );

  const renderTargetSection = (target: ImageTarget) => {
    const imgs = imagesByKey.get(target.key) || [];
    const sorted = [...imgs].sort((a, b) => a.order - b.order);
    const isCollapsed = collapsedKeys.has(target.key);

    const existingCount =
      (target.hasExistingImages ? 1 : 0) + (target.galleryThumbnails?.length || 0);

    return (
      <div key={target.key} className="mb-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => toggleCollapsed(target.key)}
          className="w-full px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        >
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{target.label}</span>
            {target.reference && target.reference !== target.label && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{target.reference}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {existingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {existingCount} bestaand
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              sorted.length > 0
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
            }`}>
              {sorted.length > 0 ? `+${sorted.length} nieuw` : 'Geen nieuwe'}
            </span>
            <span className="text-gray-400">{isCollapsed ? '▸' : '▾'}</span>
          </div>
        </button>

        {!isCollapsed && (
          <div className="p-3 flex gap-3 flex-wrap items-start">
            {target.mainThumbnail && (
              <div className="relative w-28 flex-shrink-0 opacity-80">
                <div className="aspect-square rounded-lg overflow-hidden border-2 border-green-300 dark:border-green-700 bg-gray-100 dark:bg-gray-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={target.mainThumbnail} alt="Hoofdafbeelding" className="w-full h-full object-cover" />
                </div>
                <span className="absolute top-1 left-1 bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">HOOFD</span>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">In Odoo</p>
              </div>
            )}
            {target.galleryThumbnails?.map((gi) => (
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
            {existingCount > 0 && sorted.length > 0 && (
              <div className="w-px bg-gray-300 dark:bg-gray-600 self-stretch mx-1" />
            )}
            {sorted.map((img, idx) =>
              renderImageTile(img, idx, sorted.length, true),
            )}
            <label className="w-28 aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex-shrink-0">
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) processFiles(e.target.files, target.key);
                  e.target.value = '';
                }}
              />
              <span className="text-2xl text-gray-400">+</span>
            </label>
          </div>
        )}
      </div>
    );
  };

  const renderUnassigned = () => {
    if (unassigned.length === 0) return null;
    return (
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
                <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
              <select
                value=""
                onChange={(e) => { if (e.target.value) assignImage(img.id, e.target.value); }}
                className="w-full text-[10px] border dark:border-gray-600 rounded px-1 py-0.5 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Toewijzen aan...</option>
                {targets.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
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
    );
  };

  const renderUploadButton = () => {
    if (!shouldShowUpload) return null;
    if (uploadResults.length > 0) return null;
    if (images.length === 0) return null;

    return (
      <button
        onClick={handleUpload}
        disabled={activeUploading || assignedCount === 0}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
          activeUploading || assignedCount === 0
            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
        }`}
      >
        {activeUploading
          ? activeUploadProgress
            ? `Uploaden ${activeUploadProgress.current}/${activeUploadProgress.total}...`
            : 'Uploaden...'
          : `Upload ${assignedCount} afbeelding${assignedCount !== 1 ? 'en' : ''} naar Odoo`}
      </button>
    );
  };

  const renderUploadResults = () => {
    if (uploadResults.length === 0) return null;
    const successCount = uploadResults.filter((r) => r.success).length;
    const failCount = uploadResults.filter((r) => !r.success).length;
    const totalUploaded = uploadResults.reduce((s, r) => s + r.uploaded, 0);

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Upload Resultaten</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{successCount}</div>
            <div className="text-sm text-green-600 dark:text-green-400">Gelukt</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{failCount}</div>
            <div className="text-sm text-red-600 dark:text-red-400">Mislukt</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalUploaded}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Afbeeldingen</div>
          </div>
        </div>
        {uploadResults.map((r) => {
          const target = targets.find((t) => t.key === r.key);
          return (
            <div key={r.key} className={`py-1 text-sm ${r.success ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
              {r.success ? '✅' : '❌'} {target?.label || r.key}: {r.success ? `${r.uploaded} afbeeldingen` : r.errors.join(', ')}
            </div>
          );
        })}
        <div className="mt-4">
          <button
            onClick={() => { onImagesChange([]); setUploadResults([]); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Meer uploaden
          </button>
        </div>
      </div>
    );
  };

  const renderInstructions = () => {
    if (!shouldShowInstructions || !resolvedConfig) return null;
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 mb-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">{resolvedConfig.instructions}</p>
        {resolvedConfig.exampleFilenames.length > 0 && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
            Voorbeelden: {resolvedConfig.exampleFilenames.map((fn, i) => (
              <code key={i} className="bg-blue-100 dark:bg-blue-800 px-1 rounded mx-1">{fn}</code>
            ))}
          </p>
        )}
      </div>
    );
  };

  // ─── Catalog mode: product list sidebar ───────────────────────────────
  const renderCatalogProductList = () => {
    if (mode !== 'catalog') return null;

    const allSuppliers = getAllSuppliers();

    if (!selectedVendor) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Kies leverancier</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {allSuppliers.map((s) => (
              <button
                key={s.id}
                onClick={() => handleVendorSelect(s.id)}
                className="border-2 border-gray-200 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              >
                <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{s.displayName}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden sticky top-4">
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <span className="font-bold text-gray-900 dark:text-gray-100">{plugin?.displayName}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{products.length} producten</span>
          </div>
          <button
            onClick={() => {
              setSelectedVendor('');
              setPlugin(null);
              onImagesChange([]);
              setProducts([]);
              setSelectedTemplateIds(new Set());
              setUploadResults([]);
              onVendorChange?.('');
            }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Wijzig
          </button>
        </div>

        <div className="p-3 border-b dark:border-gray-700 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {([
              ['all', 'Alles', filterCounts.all],
              ['favorites', '⭐ Favorieten', filterCounts.favorites],
              ['no-images', '🚫 Zonder foto', filterCounts.noImages],
              ['recent', '🕐 Recent', filterCounts.recent],
            ] as [FilterMode, string, number][]).map(([fm, label, count]) => (
              <button
                key={fm}
                onClick={() => setFilterMode(fm)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterMode === fm
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam of referentie..."
            className="w-full border dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="px-3 py-2 border-b dark:border-gray-700 flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">
            {selectedTemplateIds.size > 0 ? (
              <strong className="text-blue-600 dark:text-blue-400">{selectedTemplateIds.size} geselecteerd</strong>
            ) : (
              `${filteredProducts.length} producten`
            )}
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
          {catalogLoading && products.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Producten laden...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Geen producten gevonden</div>
          ) : (
            filteredProducts.map((p) => {
              const isSelected = selectedTemplateIds.has(p.templateId);
              const imgCount = imagesByKey.get(String(p.templateId))?.length
                || imagesByKey.get(resolveCatalogReference(p.internalRef, p.name))?.length
                || 0;
              return (
                <div
                  key={p.templateId}
                  onClick={() => toggleProduct(p.templateId)}
                  className={`flex items-center gap-3 px-3 py-2.5 border-b dark:border-gray-700 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0 pointer-events-none" />
                  {p.mainThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mainThumbnail} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 border border-gray-200 dark:border-gray-600" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">?</div>
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
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────

  if (mode === 'catalog' && !selectedVendor) {
    return renderCatalogProductList();
  }

  if (mode === 'catalog') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">{renderCatalogProductList()}</div>
        <div className="lg:col-span-2 space-y-6">
          {renderInstructions()}
          {selectedTemplateIds.size === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Selecteer producten</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Kies links de producten waarvoor je afbeeldingen wilt uploaden.
                Gebruik de filters om snel te vinden wat je zoekt.
              </p>
            </div>
          ) : (
            <>
              {renderDropZone()}
              {renderToolbar()}
              {renderBulkUrlInput()}
              {renderSummary()}
              {targets.map(renderTargetSection)}
              {renderUnassigned()}
              {activeUploadProgress && (
                <div className="mb-3">
                  <ImageUploadProgressBar progress={activeUploadProgress} />
                </div>
              )}
              {renderUploadButton()}
              {renderUploadResults()}
            </>
          )}
        </div>
      </div>
    );
  }

  // wizard / brand mode
  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6">
      {renderInstructions()}
      {renderDropZone()}
      {renderToolbar()}
      {renderBulkUrlInput()}
      {renderSummary()}
      {targets.map(renderTargetSection)}
      {renderUnassigned()}
      {activeUploadProgress && (
        <div className="mb-3">
          <ImageUploadProgressBar progress={activeUploadProgress} />
        </div>
      )}
      {renderUploadButton()}
      {renderUploadResults()}
      {onSkip && (
        <button
          onClick={onSkip}
          className="mt-3 w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
        >
          Ga verder zonder afbeeldingen
        </button>
      )}
    </div>
  );
}
