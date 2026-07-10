import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

interface MappingStepProps {
  wizard: UseImportWizardReturn;
}

export default function MappingStep({ wizard }: MappingStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">🗺️ Field Mapping &amp; Validation</h2>
      <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
        <p className="text-green-800 font-medium">
          {wizard.parsedProducts.length} rijen geïmporteerd, gegroepeerd in {wizard.parsedProducts.length} producten
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border rounded p-4">
          <div className="text-gray-900 text-sm font-semibold">Totaal Rijen</div>
          <div className="text-3xl font-bold text-gray-900">{wizard.parsedProducts.reduce((s, p) => s + p.variants.length, 0)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-gray-900 text-sm font-semibold">Unieke Producten</div>
          <div className="text-3xl font-bold text-gray-900">{wizard.parsedProducts.length}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-gray-900 text-sm font-semibold">Totaal Varianten</div>
          <div className="text-3xl font-bold text-gray-900">{wizard.parsedProducts.reduce((s, p) => s + p.variants.length, 0)}</div>
        </div>
      </div>

      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-3">Product Groepen Preview</h3>
      <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden flex flex-col" style={{ maxHeight: '600px' }}>
        {/* Table Header */}
        <div className="overflow-x-auto flex-shrink-0">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-blue-600 dark:bg-blue-700 text-white sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Reference</th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Naam</th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Materiaal</th>
                <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Kleur</th>
                <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">Varianten</th>
                <th className="p-3 text-right font-semibold border-b border-blue-700 dark:border-blue-800">Verkoopprijs</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body with Scroll */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {wizard.parsedProducts.map((product, idx) => (
                <tr 
                  key={`${product.reference}_${product.color}`}
                  className={`border-b dark:border-gray-700 transition-colors ${
                    idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
                  } hover:bg-blue-50 dark:hover:bg-blue-900/30`}
                >
                  <td className="p-3 font-mono text-xs bg-gray-100 dark:bg-gray-700 font-bold text-gray-900 dark:text-gray-100">{product.reference}</td>
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">{product.name}</td>
                  <td className="p-3 text-xs text-gray-900 dark:text-gray-200 max-w-xs truncate">{product.material}</td>
                  <td className="p-3 text-sm text-gray-900 dark:text-gray-100">{product.color}</td>
                  <td className="p-3 text-center font-semibold text-blue-600 dark:text-blue-400">{product.variants.length}</td>
                  <td className="p-3 text-right font-bold text-green-600 dark:text-green-400">€{(product.variants[0]?.rrp || product.variants[0]?.price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-700 p-3 border-t dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 font-medium">
          📊 Totaal: <strong>{wizard.parsedProducts.length} producten</strong> met <strong>{wizard.parsedProducts.reduce((s, p) => s + p.variants.length, 0)} varianten</strong>
        </div>
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => wizard.setCurrentStep(1)}
          className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
        >
          ← Terug
        </button>
        <button
          onClick={() => wizard.setCurrentStep(3)}
          className="px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-800"
        >
          Volgende: Selectie →
        </button>
      </div>
    </div>
  );
}
