import Link from 'next/link';
import EnhancedImageManager from '@/components/import/shared/EnhancedImageManager';
import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

interface ImportStepProps {
  wizard: UseImportWizardReturn;
}

export default function ImportStep({ wizard }: ImportStepProps) {
  if (!wizard.importResults) return null;

  const { results, summary } = wizard.importResults;
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const allSuccess = failCount === 0;

  const plugin = wizard.selectedVendor
    ? wizard.getSupplier(wizard.selectedVendor)
    : null;
  const imgConfig = plugin?.imageUpload;

  const successfulProducts = wizard.parsedProducts.filter((p) =>
    results.some((r) => r.success && r.reference === p.reference),
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        {allSuccess ? '✅ Import voltooid!' : '⚠️ Importresultaten'}
      </h2>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Succesvol
          </div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {successCount}
          </div>
        </div>
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Mislukt
          </div>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
            {failCount}
          </div>
        </div>
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Totaal
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {results.length}
          </div>
        </div>
      </div>

      {/* Import Summary */}
      {summary && (
        <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
            Importsamenvatting
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Leverancier:
              </span>{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {summary.vendor}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Tijdstip:
              </span>{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(summary.timestamp).toLocaleString('nl-NL')}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Varianten Aangemaakt:
              </span>{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {summary.totalVariantsCreated}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Varianten Bijgewerkt:
              </span>{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {summary.totalVariantsUpdated}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Results table */}
      <div
        className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden flex flex-col mb-6"
        style={{ maxHeight: '400px' }}
      >
        <div className="overflow-x-auto flex-shrink-0">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-blue-600 dark:bg-blue-700 text-white sticky top-0 z-10">
              <tr>
                <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">
                  Status
                </th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Product Naam
                </th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Product ID
                </th>
                <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">
                  Varianten
                </th>
                <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">
                  Afbeeldingen
                </th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Bericht
                </th>
              </tr>
            </thead>
          </table>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {results.map((result, idx) => (
                <tr
                  key={`${result.reference}_${idx}`}
                  className={`border-b dark:border-gray-700 transition-colors ${
                    idx % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-750'
                  }`}
                >
                  <td className="p-3 text-center text-lg">
                    {result.success ? '✅' : '❌'}
                  </td>
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100">
                    {result.templateId ? (
                      <Link
                        href={`/product-debug?id=${result.templateId}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {result.name || result.reference}
                      </Link>
                    ) : (
                      result.name || result.reference
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {result.templateId || '—'}
                  </td>
                  <td className="p-3 text-center text-gray-900 dark:text-gray-100">
                    {(result.variantsCreated || 0) +
                      (result.variantsUpdated || 0)}
                  </td>
                  <td className="p-3 text-center text-gray-900 dark:text-gray-100">
                    {result.imagesUploaded || 0}
                  </td>
                  <td className="p-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {result.message || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image upload section */}
      {wizard.imageImportResults.length === 0 && imgConfig?.enabled && (
        <div className="mb-6">
          {imgConfig.dedicatedPageUrl ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <p className="text-blue-800 dark:text-blue-200 mb-2">
                📸 Afbeeldingen uploaden via een speciale pagina:
              </p>
              <Link
                href={imgConfig.dedicatedPageUrl}
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                {imgConfig.dedicatedPageLabel ||
                  'Ga naar Afbeeldingen Upload'}
              </Link>
            </div>
          ) : (
            <EnhancedImageManager
              images={wizard.imagePool}
              onImagesChange={wizard.setImagePool}
              products={successfulProducts}
              imageUploadConfig={imgConfig}
              onUpload={async (images) => {
                wizard.setImagePool(images);
                await wizard.uploadAllImages();
              }}
              isUploading={wizard.isLoading}
            />
          )}
        </div>
      )}

      {/* Image import results */}
      {wizard.imageImportResults.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">
            📸 Resultaten afbeeldingenupload
          </h3>
          <div className="flex gap-4 text-sm mb-3">
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
              {
                wizard.imageImportResults.filter((r) => r.success)
                  .length
              }{' '}
              succesvol
            </span>
            <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded-full">
              {
                wizard.imageImportResults.filter((r) => !r.success)
                  .length
              }{' '}
              mislukt
            </span>
          </div>
          <div className="space-y-2">
            {wizard.imageImportResults.map((imgResult) => (
              <div
                key={imgResult.reference}
                className={`flex items-center justify-between p-2 rounded text-sm ${
                  imgResult.success
                    ? 'bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-200'
                    : 'bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-200'
                }`}
              >
                <span className="font-medium">
                  {imgResult.reference}
                </span>
                <span>
                  {imgResult.success
                    ? `${imgResult.imagesUploaded} afbeeldingen geüpload`
                    : imgResult.error || 'Upload mislukt'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replay / retry without remapping */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-amber-900 dark:text-amber-100 mb-2">
          Opnieuw importeren (zonder wizard opnieuw)
        </h3>
        <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
          De API-payload wordt bewaard in je browser. Archiveer eerst
          gedeeltelijk aangemaakte producten in Odoo voordat je opnieuw
          probeert (anders falen barcodes).
        </p>
        <div className="flex flex-wrap gap-2">
          {failCount > 0 && (
            <button
              type="button"
              onClick={() => wizard.retryFailedImport()}
              disabled={wizard.isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium disabled:opacity-50"
            >
              Mislukte opnieuw proberen ({failCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => wizard.replayLastImportPayload()}
            disabled={wizard.isLoading}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-medium disabled:opacity-50"
          >
            Laatste payload opnieuw importeren
          </button>
          <button
            type="button"
            onClick={() => wizard.downloadImportPayload()}
            disabled={wizard.isLoading}
            className="px-4 py-2 border border-amber-600 text-amber-800 dark:text-amber-200 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 font-medium disabled:opacity-50"
          >
            API-payload JSON downloaden
          </button>
          <label className="px-4 py-2 border border-amber-600 text-amber-800 dark:text-amber-200 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 font-medium cursor-pointer">
            Laad payload JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void wizard.loadImportPayloadFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="flex justify-between items-center">
        <button
          onClick={wizard.resetWizard}
          className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
        >
          🔄 Nieuwe import
        </button>
        {imgConfig?.dedicatedPageUrl && (
          <Link
            href={imgConfig.dedicatedPageUrl}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            📸 Afbeeldingen Uploaden
          </Link>
        )}
      </div>
    </div>
  );
}
