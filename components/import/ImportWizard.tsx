import useImportWizard from '@/hooks/useImportWizard';
import UploadStep from './steps/UploadStep';
import MappingStep from './steps/MappingStep';
import StockStep from './steps/StockStep';
import CategoriesStep from './steps/CategoriesStep';
import ImageStep from './steps/ImageStep';
import PreviewStep from './steps/PreviewStep';
import TestStep from './steps/TestStep';
import ImportStep from './steps/ImportStep';

export default function ImportWizard() {
  const wizard = useImportWizard();

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                📦 Productimportwizard
              </h1>
              <p className="text-gray-800 dark:text-gray-300">
                Importeer producten van leveranciers in bulk met validatie en
                voorbeeld
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="/smart-upload"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm whitespace-nowrap"
              >
                Slim uploaden
              </a>
              <a
                href="/image-upload"
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 text-sm whitespace-nowrap"
              >
                Afbeeldingen
              </a>
              <a
                href="/supplier-onboarding"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 text-sm whitespace-nowrap"
              >
                + Nieuwe Leverancier
              </a>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between">
              {wizard.steps.map((step, idx) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                        step.id === wizard.currentStep
                          ? 'bg-blue-600 text-white'
                          : step.id < wizard.currentStep
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <div className="text-sm mt-2 font-medium text-gray-700 dark:text-gray-300">
                      {step.name}
                    </div>
                  </div>
                  {idx < wizard.steps.length - 1 && (
                    <div
                      className={`h-1 w-24 mx-2 ${
                        step.id < wizard.currentStep
                          ? 'bg-green-500'
                          : 'bg-gray-200 dark:bg-gray-600'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
            {wizard.currentStep === 1 && <UploadStep wizard={wizard} />}
            {wizard.currentStep === 2 && <MappingStep wizard={wizard} />}
            {wizard.currentStep === 3 && <StockStep wizard={wizard} />}
            {wizard.currentStep === 4 && <CategoriesStep wizard={wizard} />}
            {wizard.currentStep === 5 && <ImageStep wizard={wizard} />}
            {wizard.currentStep === 6 && <PreviewStep wizard={wizard} />}
            {wizard.currentStep === 7 && <TestStep wizard={wizard} />}
            {wizard.currentStep === 8 && wizard.importResults && (
              <ImportStep wizard={wizard} />
            )}
          </div>
        </div>
      </div>

      {/* Import Progress Modal */}
      {wizard.importProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Importeren...
            </h3>
            <div className="mb-4">
              <div className="text-sm mb-2">
                <span>
                  {wizard.importProgress.total} producten worden verwerkt op
                  de server
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-blue-600 h-4 animate-pulse"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            {wizard.importProgress.currentProduct && (
              <div className="text-sm text-gray-800 mb-4">
                <div className="bg-gray-50 p-2 rounded">
                  {wizard.importProgress.currentProduct}
                </div>
              </div>
            )}
            <div className="text-xs text-gray-500">
              Dit kan enkele minuten duren. Sluit dit venster niet.
            </div>
          </div>
        </div>
      )}

      {/* API Preview Modal */}
      {wizard.showApiPreview && wizard.apiPreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto w-full">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">
                📋 API-voorbeeld — productieveiligheidscontrole
              </h3>
              <button
                onClick={() => wizard.setShowApiPreview(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
                <p className="text-yellow-800 font-medium">
                  ⚠️ Productiedatabase: controleer alle velden voordat je
                  bevestigt. Deze API-aanroepen maken permanent data aan in
                  je Odoo-systeem.
                </p>
              </div>

              <div className="mb-6">
                <h4 className="font-bold text-gray-900 mb-2">
                  📦 Productinformatie:
                </h4>
                <div className="bg-gray-50 p-3 rounded text-sm">
                  <div>
                    <strong>Naam:</strong>{' '}
                    {wizard.apiPreviewData.product.name}
                  </div>
                  <div>
                    <strong>Varianten:</strong>{' '}
                    {wizard.apiPreviewData.product.variants.length}
                  </div>
                  <div>
                    <strong>Merk:</strong>{' '}
                    {wizard.apiPreviewData.product.selectedBrand?.name}
                  </div>
                  <div>
                    <strong>Categorie:</strong>{' '}
                    {
                      wizard.apiPreviewData.product.category
                        ?.display_name
                    }
                  </div>
                  {wizard.apiPreviewData.product.publicCategories
                    .length > 0 && (
                    <div>
                      <strong>Publieke categorieën:</strong>{' '}
                      {wizard.apiPreviewData.product.publicCategories
                        .map((c) => c.name)
                        .join(', ')}
                    </div>
                  )}
                  {wizard.apiPreviewData.product.productTags.length >
                    0 && (
                    <div>
                      <strong>Productlabels:</strong>{' '}
                      {wizard.apiPreviewData.product.productTags
                        .map((t) => t.name)
                        .join(', ')}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Stap 1: Producttemplate aanmaken
                  </summary>
                  <pre className="p-3 text-xs overflow-x-auto bg-gray-50">
                    {JSON.stringify(
                      {
                        model: 'product.template',
                        method: 'create',
                        values: {
                          name: wizard.apiPreviewData.product.name,
                          categ_id:
                            wizard.apiPreviewData.product.category?.id,
                          list_price:
                            wizard.apiPreviewData.product.variants[0]
                              ?.rrp,
                          type: 'consu',
                          is_storable: true,
                          weight: 0.2,
                          tracking: 'none',
                          available_in_pos: true,
                          website_id: 1,
                          website_published:
                            wizard.apiPreviewData.product.isPublished,
                          public_categ_ids: [
                            [
                              6,
                              0,
                              wizard.apiPreviewData.product.publicCategories.map(
                                (c) => c.id,
                              ),
                            ],
                          ],
                          product_tag_ids: [
                            [
                              6,
                              0,
                              wizard.apiPreviewData.product.productTags.map(
                                (t) => t.id,
                              ),
                            ],
                          ],
                        },
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>

                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Stap 2: Merkattribuut toevoegen
                  </summary>
                  <pre className="p-3 text-xs overflow-x-auto bg-gray-50">
                    Merk:{' '}
                    {wizard.apiPreviewData.product.selectedBrand?.name}{' '}
                    (ID:{' '}
                    {wizard.apiPreviewData.product.selectedBrand?.id})
                  </pre>
                </details>

                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Stap 3: Maatattribuut toevoegen
                  </summary>
                  <pre className="p-3 text-xs overflow-x-auto bg-gray-50">
                    Maten:{' '}
                    {wizard.apiPreviewData.product.variants
                      .map((v) => v.size)
                      .join(', ')}
                  </pre>
                </details>

                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Stap 4: Bijwerken{' '}
                    {wizard.apiPreviewData.product.variants.length}{' '}
                    varianten (barcodes &amp; prijzen)
                  </summary>
                  <div className="p-3 text-xs overflow-x-auto bg-gray-50">
                    {wizard.apiPreviewData.product.variants.map(
                      (v, idx: number) => (
                        <div key={idx} className="mb-2 p-2 border rounded">
                          <div>
                            Variant {idx + 1}: maat {v.size}
                          </div>
                          <div>Barcode: {v.ean}</div>
                          <div>Kostprijs: €{v.price}</div>
                          <div>Gewicht: 0,2 kg</div>
                        </div>
                      ),
                    )}
                  </div>
                </details>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => wizard.setShowApiPreview(false)}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded hover:bg-gray-100"
                >
                  ✕ Annuleren
                </button>
                <button
                  onClick={() =>
                    wizard.executeImport(
                      wizard.apiPreviewData!.testMode,
                    )
                  }
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                >
                  ✅ Bevestigen & Uitvoeren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Prompt Editor Modal */}
      {wizard.showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">📝 AI-promptbewerker</h3>
              <button
                onClick={() => wizard.setShowPromptModal(false)}
                className="text-white hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => wizard.setPromptCategory('kinderen')}
                  className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                    wizard.promptCategory === 'kinderen'
                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-b-2 border-pink-500'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  👶 Baby&apos;s, Kinderen &amp; Tieners
                </button>
                <button
                  onClick={() => wizard.setPromptCategory('volwassenen')}
                  className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                    wizard.promptCategory === 'volwassenen'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-b-2 border-purple-500'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  👩 Volwassenen
                </button>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>ℹ️ Info:</strong> Deze prompt wordt gebruikt als
                  systeem-instructie voor de AI. De prompt bepaalt de stijl,
                  toon en structuur van de gegenereerde
                  productbeschrijvingen.
                  <br />
                  <br />
                  <strong>Gebruikt voor:</strong>{' '}
                  {wizard.promptCategory === 'kinderen'
                    ? "MAAT Baby's, MAAT Kinderen, MAAT Tieners"
                    : 'MAAT Volwassenen'}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Systeemprompt{' '}
                  {wizard.promptCategory === 'kinderen'
                    ? '(kinderen)'
                    : '(volwassenen)'}
                  :
                </label>
                <textarea
                  value={
                    wizard.promptCategory === 'kinderen'
                      ? wizard.customPromptKinderen
                      : wizard.customPromptVolwassenen
                  }
                  onChange={(e) => {
                    if (wizard.promptCategory === 'kinderen') {
                      wizard.setCustomPromptKinderen(e.target.value);
                    } else {
                      wizard.setCustomPromptVolwassenen(e.target.value);
                    }
                  }}
                  rows={15}
                  className="w-full border dark:border-gray-600 rounded-lg px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                  placeholder="Voer hier de AI systeem prompt in..."
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={() => {
                    if (wizard.defaultPrompts) {
                      if (wizard.promptCategory === 'kinderen') {
                        wizard.setCustomPromptKinderen(
                          wizard.defaultPrompts.kinderen.systemPrompt,
                        );
                      } else {
                        wizard.setCustomPromptVolwassenen(
                          wizard.defaultPrompts.volwassenen.systemPrompt,
                        );
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline"
                >
                  🔄 Reset naar standaard
                </button>

                <div className="text-sm">
                  {wizard.promptCategory === 'kinderen' ? (
                    wizard.customPromptKinderen !==
                    wizard.defaultPrompts?.kinderen?.systemPrompt ? (
                      <span className="text-orange-600 dark:text-orange-400">
                        ⚠️ Aangepaste prompt
                      </span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ Standaard prompt
                      </span>
                    )
                  ) : wizard.customPromptVolwassenen !==
                    wizard.defaultPrompts?.volwassenen?.systemPrompt ? (
                    <span className="text-orange-600 dark:text-orange-400">
                      ⚠️ Aangepaste prompt
                    </span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">
                      ✓ Standaard prompt
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t dark:border-gray-700 pt-4">
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                  💡 Voorbeeld output structuur:
                </h4>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
                  {wizard.promptCategory === 'kinderen' ? (
                    <>
                      <p className="mb-2">
                        Dit schattige jurkje is perfect voor je kleine meid.
                      </p>
                      <p className="mb-2">
                        • Zachte katoenmix voor optimaal comfort
                      </p>
                      <p className="mb-2">• Speelse bloemenprint</p>
                      <p className="mb-2">
                        • Gemakkelijk aan- en uit te trekken
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 italic">
                        Materiaal: 100% biologisch katoen
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-2">
                        Deze elegante blouse combineert stijl met
                        duurzaamheid.
                      </p>
                      <p className="mb-2 font-medium">
                        Pasvorm: Regular fit
                      </p>
                      <p className="mb-2">• Tijdloos ontwerp</p>
                      <p className="mb-2">
                        • Veelzijdig te combineren
                      </p>
                      <p className="mb-2">• Duurzaam geproduceerd</p>
                      <p className="text-gray-500 dark:text-gray-400 italic">
                        Materiaal: TENCEL™ lyocell
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
              <button
                onClick={() => wizard.setShowPromptModal(false)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
