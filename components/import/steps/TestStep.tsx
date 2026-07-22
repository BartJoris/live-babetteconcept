import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

interface TestStepProps {
  wizard: UseImportWizardReturn;
}

export default function TestStep({ wizard }: TestStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        🧪 Testmodus
      </h2>

      <div className="space-y-4 mb-6">
        {wizard.readyProducts.map((product) => (
          <div
            key={`${product.reference}_${product.color}`}
            className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">
                  {product.name}
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <span>
                    {product.variants.length} varianten
                  </span>
                  <span>
                    Merk:{' '}
                    {product.selectedBrand?.name ||
                      product.suggestedBrand ||
                      '—'}
                  </span>
                  <span>
                    Categorie: {product.category?.name || '—'}
                  </span>
                </div>
                {product.publicCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {product.publicCategories.map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full"
                      >
                        {cat.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => wizard.testProduct(product)}
                className="ml-4 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-medium flex-shrink-0"
              >
                🧪 Dit product testen
              </button>
            </div>
          </div>
        ))}

        {wizard.readyProducts.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            Geen producten klaar voor test. Ga terug en wijs merken en
            categorieën toe.
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          API payload bewaren / herhalen
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Download de klaarstaande API-payload zodat je dezelfde import later
          opnieuw kunt afvuren zonder mapping opnieuw te doen.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => wizard.downloadImportPayload()}
            className="px-4 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
          >
            API-payload JSON downloaden
          </button>
          <button
            type="button"
            onClick={() => wizard.replayLastImportPayload()}
            disabled={wizard.isLoading}
            className="px-4 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium disabled:opacity-50"
          >
            Laatste payload opnieuw importeren
          </button>
          <label className="px-4 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium cursor-pointer">
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

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => wizard.setCurrentStep(6)}
          className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
        >
          ← Terug
        </button>
        <button
          onClick={() => {
            if (
              confirm(
                `${wizard.readyProducts.length} producten direct importeren naar Odoo? (geen test)`,
              )
            ) {
              wizard.executeImport(false);
            }
          }}
          disabled={wizard.readyProducts.length === 0}
          className={`px-6 py-2 rounded font-medium ${
            wizard.readyProducts.length === 0
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          Test overslaan → Direct importeren
        </button>
      </div>
    </div>
  );
}
