import { useMemo, useCallback, useState } from 'react';

import type { UseImportWizardReturn } from '@/hooks/useImportWizard';
import type { PoolImage, ImageTarget } from '@/lib/images/types';
import { isLikelyIsbn } from '@/lib/books/isbn';
import ProductImageUploader from '@/components/images/ProductImageUploader';

interface ImageStepProps {
  wizard: UseImportWizardReturn;
}

type CoverLookupResponse = {
  found?: Array<{
    reference: string;
    isbn: string;
    source: string;
    mimeType: string;
    base64: string;
  }>;
  missing?: Array<{ reference: string; isbn: string; error: string }>;
  summary?: { requested: number; found: number; missing: number };
  error?: string;
};

let coverIdCounter = 0;

export default function ImageStep({ wizard }: ImageStepProps) {
  const [lookingUpCovers, setLookingUpCovers] = useState(false);
  const [coverStatus, setCoverStatus] = useState<string | null>(null);

  const selectedProductsList = wizard.parsedProducts.filter((p) =>
    wizard.selectedProducts.has(p.reference),
  );

  const plugin = wizard.selectedVendor
    ? wizard.getSupplier(wizard.selectedVendor)
    : null;

  const canLookupCovers = useMemo(() => {
    if (wizard.selectedVendor === 'boeken') return true;
    return selectedProductsList.some(
      (p) =>
        isLikelyIsbn(p.reference) ||
        p.variants.some((v) => isLikelyIsbn(v.ean)),
    );
  }, [wizard.selectedVendor, selectedProductsList]);

  const targets = useMemo<ImageTarget[]>(
    () =>
      selectedProductsList.map((p) => ({
        key: p.reference,
        label: p.name || p.reference,
        reference: p.reference,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProductsList.map((p) => p.reference).join(',')],
  );

  const poolImages = useMemo<PoolImage[]>(
    () =>
      wizard.imagePool.map((item) => ({
        id: item.id,
        dataUrl: item.dataUrl,
        filename: item.filename,
        file: item.file,
        assignedKey: item.assignedReference,
        order: item.order,
      })),
    [wizard.imagePool],
  );

  const handleImagesChange = useCallback(
    (updated: PoolImage[]) => {
      wizard.setImagePool(
        updated.map((img) => ({
          id: img.id,
          dataUrl: img.dataUrl,
          filename: img.filename,
          file: img.file,
          assignedReference: img.assignedKey,
          order: img.order,
        })),
      );
    },
    [wizard],
  );

  const productsWithImages = selectedProductsList.filter((p) =>
    wizard.imagePool.some((img) => img.assignedReference === p.reference),
  );

  const unassignedCount = wizard.imagePool.filter(
    (img) => !img.assignedReference,
  ).length;

  const handleLookupCovers = useCallback(async () => {
    const alreadyHas = new Set(
      wizard.imagePool
        .filter((img) => img.assignedReference)
        .map((img) => img.assignedReference as string),
    );

    const items = selectedProductsList
      .filter((p) => !alreadyHas.has(p.reference))
      .map((p) => {
        const isbn =
          (isLikelyIsbn(p.reference) && p.reference) ||
          p.variants.find((v) => isLikelyIsbn(v.ean))?.ean ||
          p.reference;
        return {
          reference: p.reference,
          isbn,
          title: p.originalName || p.name,
        };
      })
      .filter((item) => isLikelyIsbn(item.isbn));

    if (items.length === 0) {
      setCoverStatus('Alle producten hebben al een afbeelding, of er is geen ISBN.');
      return;
    }

    setLookingUpCovers(true);
    setCoverStatus(`Covers zoeken voor ${items.length} boeken…`);

    try {
      const response = await fetch('/api/lookup-book-covers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = (await response.json()) as CoverLookupResponse;
      if (!response.ok) {
        setCoverStatus(data.error || 'Cover lookup mislukt');
        return;
      }

      const found = data.found || [];
      if (found.length === 0) {
        setCoverStatus(
          `Geen covers gevonden (${data.summary?.missing ?? items.length} zonder resultaat).`,
        );
        return;
      }

      const newImages = found.map((hit) => {
        const mime = hit.mimeType || 'image/jpeg';
        const filename = `${hit.isbn}.jpg`;
        return {
          id: `cover-${++coverIdCounter}-${hit.isbn}`,
          dataUrl: `data:${mime};base64,${hit.base64}`,
          filename,
          file: new File([], filename),
          assignedReference: hit.reference,
          order: 0,
        };
      });

      wizard.setImagePool([...wizard.imagePool, ...newImages]);
      setCoverStatus(
        `${found.length} van ${items.length} covers gevonden` +
          (data.summary?.missing
            ? ` (${data.summary.missing} niet gevonden)`
            : ''),
      );
    } catch (error) {
      setCoverStatus(
        error instanceof Error ? error.message : 'Cover lookup mislukt',
      );
    } finally {
      setLookingUpCovers(false);
    }
  }, [selectedProductsList, wizard]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Afbeeldingen
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Wijs afbeeldingen toe aan producten. Sleep bestanden, selecteer een map, of voeg URLs toe.
        {canLookupCovers && (
          <> Voor boeken kun je covers automatisch ophalen via ISBN.</>
        )}
      </p>

      {/* Summary bar */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-blue-800 dark:text-blue-200 font-medium">
            {productsWithImages.length} van {selectedProductsList.length} producten hebben afbeeldingen
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-600 dark:text-blue-300">
              {wizard.imagePool.length} afbeeldingen totaal
              {unassignedCount > 0 && (
                <span className="text-orange-600 dark:text-orange-400 ml-2">
                  ({unassignedCount} niet toegewezen)
                </span>
              )}
            </span>
            {canLookupCovers && (
              <button
                type="button"
                onClick={handleLookupCovers}
                disabled={lookingUpCovers}
                className="px-4 py-2 text-sm font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {lookingUpCovers ? 'Covers zoeken…' : 'Zoek covers (ISBN)'}
              </button>
            )}
          </div>
        </div>
        {coverStatus && (
          <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">{coverStatus}</p>
        )}
      </div>

      <ProductImageUploader
        mode="wizard"
        targets={targets}
        images={poolImages}
        onImagesChange={handleImagesChange}
        imageUploadConfig={plugin?.imageUpload}
        enableFolderPick
        enableCompress
        enableUrlImport
        fetchUrlsViaApi
        showUploadButton={false}
        showInstructions={false}
      />

      {/* Navigation */}
      <div className="flex justify-between items-center mt-6">
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
