import { useMemo, useCallback } from 'react';

import type { UseImportWizardReturn } from '@/hooks/useImportWizard';
import type { PoolImage, ImageTarget } from '@/lib/images/types';
import ProductImageUploader from '@/components/images/ProductImageUploader';

interface ImageStepProps {
  wizard: UseImportWizardReturn;
}

export default function ImageStep({ wizard }: ImageStepProps) {
  const selectedProductsList = wizard.parsedProducts.filter((p) =>
    wizard.selectedProducts.has(p.reference),
  );

  const plugin = wizard.selectedVendor
    ? wizard.getSupplier(wizard.selectedVendor)
    : null;

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

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Afbeeldingen
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
            {unassignedCount > 0 && (
              <span className="text-orange-600 dark:text-orange-400 ml-2">
                ({unassignedCount} niet toegewezen)
              </span>
            )}
          </span>
        </div>
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
