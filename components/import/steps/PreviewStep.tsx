import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

interface PreviewStepProps {
  wizard: UseImportWizardReturn;
}

export default function PreviewStep({ wizard }: PreviewStepProps) {
  const totalStock = wizard.readyProducts.reduce(
    (sum, p) =>
      sum +
      p.variants.reduce((vSum, v) => vSum + (v.quantity || 0), 0),
    0,
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        👁️ Voorbeeld import
      </h2>

      {/* Automatische Standaardinstellingen */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-blue-800 dark:text-blue-200 mb-2">
          ℹ️ Automatische Standaardinstellingen
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-blue-700 dark:text-blue-300">
          <span>• Verbruiksartikel</span>
          <span>• 0.20 kg</span>
          <span>• Voorraad bijhouden</span>
          <span>• Kassa</span>
          <span>• Website Babette</span>
          <span>• Inkoop uitgeschakeld</span>
          <span>• Niet op voorraad: &quot;Verkocht!&quot;</span>
          <span>• Facturatiebeleid Geleverde hoeveelheden</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Producttemplates
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {wizard.readyProducts.length}
          </div>
        </div>
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Productvarianten
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {wizard.totalVariants}
          </div>
        </div>
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Totale Voorraad
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {totalStock}
          </div>
        </div>
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
            Klaar voor Import
          </div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {wizard.readyProducts.length}
          </div>
        </div>
      </div>

      {/* Warning if not all selected products are ready */}
      {wizard.readyProducts.length < wizard.selectedCount && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">
            ⚠️ {wizard.selectedCount - wizard.readyProducts.length} van{' '}
            {wizard.selectedCount} geselecteerde producten missen een merk
            of categorie en worden niet geïmporteerd.
          </p>
        </div>
      )}

      {/* Preview table */}
      <div
        className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden flex flex-col mb-6"
        style={{ maxHeight: '500px' }}
      >
        <div className="overflow-x-auto flex-shrink-0">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-blue-600 dark:bg-blue-700 text-white sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Product
                </th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Merk
                </th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Categorie
                </th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">
                  Webshopcat.
                </th>
                <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">
                  Varianten
                </th>
                <th className="p-3 text-right font-semibold border-b border-blue-700 dark:border-blue-800">
                  Verkoopprijs
                </th>
                <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">
                  Status
                </th>
              </tr>
            </thead>
          </table>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {wizard.parsedProducts
                .filter((p) => wizard.selectedProducts.has(p.reference))
                .map((product, idx) => {
                  const isReady = !!(
                    product.selectedBrand && product.category
                  );
                  return (
                    <tr
                      key={`${product.reference}_${product.color}`}
                      className={`border-b dark:border-gray-700 transition-colors ${
                        idx % 2 === 0
                          ? 'bg-white dark:bg-gray-800'
                          : 'bg-gray-50 dark:bg-gray-750'
                      } hover:bg-blue-50 dark:hover:bg-blue-900/30`}
                    >
                      <td className="p-3 font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">
                        {product.name}
                      </td>
                      <td className="p-3 text-sm text-gray-900 dark:text-gray-100">
                        {product.selectedBrand?.name ||
                          product.suggestedBrand ||
                          '—'}
                      </td>
                      <td className="p-3 text-sm text-gray-900 dark:text-gray-100">
                        {product.category?.name || '—'}
                      </td>
                      <td className="p-3 text-sm text-gray-900 dark:text-gray-100">
                        {product.publicCategories.length > 0
                          ? product.publicCategories
                              .map((c) => c.name)
                              .join(', ')
                          : '—'}
                      </td>
                      <td className="p-3 text-center font-semibold text-blue-600 dark:text-blue-400">
                        {product.variants.length}
                      </td>
                      <td className="p-3 text-right font-bold text-green-600 dark:text-green-400">
                        €
                        {(
                          product.variants[0]?.rrp ||
                          product.variants[0]?.price ||
                          0
                        ).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        {isReady ? (
                          <span className="text-green-600 dark:text-green-400 font-bold">
                            ✓ Klaar
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-bold">
                            ✗ Onvolledig
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => wizard.setCurrentStep(5)}
          className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
        >
          ← Terug
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => wizard.setCurrentStep(7)}
            className="px-6 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-medium"
          >
            🧪 Testmodus →
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  `${wizard.readyProducts.length} producten direct importeren naar Odoo?`,
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
            🚀 Direct Importeren
          </button>
        </div>
      </div>
    </div>
  );
}
