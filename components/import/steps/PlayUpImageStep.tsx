import Image from 'next/image';
import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

interface PlayUpImageStepProps {
  wizard: UseImportWizardReturn;
}

export default function PlayUpImageStep({ wizard }: PlayUpImageStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        📸 Manage Product Images
      </h2>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <div className="text-green-600 text-sm mb-1">Met Afbeeldingen</div>
          <div className="text-3xl font-bold">
            {
              wizard.parsedProducts.filter(
                (p) => p.images && p.images.length > 0,
              ).length
            }
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <div className="text-yellow-600 text-sm mb-1">
            Zonder Afbeeldingen
          </div>
          <div className="text-3xl font-bold">
            {
              wizard.parsedProducts.filter(
                (p) => !p.images || p.images.length === 0,
              ).length
            }
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <div className="text-blue-600 text-sm mb-1">Totaal Afbeeldingen</div>
          <div className="text-3xl font-bold">
            {wizard.parsedProducts.reduce(
              (sum, p) => sum + (p.images?.length || 0),
              0,
            )}
          </div>
        </div>
      </div>

      {/* Info Banner for Local Images */}
      {wizard.parsedProducts.some((p) =>
        p.images?.some((img) => img.startsWith('/')),
      ) && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-2">
            📁 Local Images Ready
          </h3>
          <p className="text-sm text-blue-800 mb-3">
            Images from the matcher are stored locally. Upload them manually
            using the &quot;📁 Upload Foto&apos;s&quot; button below each
            product.
          </p>
          <p className="text-xs text-blue-700 bg-blue-100 rounded p-2">
            💡 <strong>Tip:</strong> Images are in{' '}
            <code className="bg-blue-200 px-1 rounded">
              ~/Downloads/Play_Up_Matched_Images/
            </code>
          </p>
        </div>
      )}

      {/* Products Grid */}
      <div className="space-y-4 mb-6 max-h-[600px] overflow-y-auto">
        {wizard.parsedProducts.map((product) => (
          <div
            key={`${product.reference}_${product.color}`}
            className="bg-white border rounded-lg p-4"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-gray-900">{product.name}</h3>
                <p className="text-sm text-gray-600">{product.reference}</p>
              </div>
              <div
                className={`px-3 py-1 rounded text-sm font-medium ${
                  product.images && product.images.length > 0
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {product.images && product.images.length > 0
                  ? `✅ ${product.images.length} foto's`
                  : "⚠️ Geen foto's"}
              </div>
            </div>

            {/* Image Preview Grid */}
            {product.images && product.images.length > 0 && (
              <div className="mb-3">
                {product.images.some(
                  (img) =>
                    img.startsWith('/') || img.startsWith('file://'),
                ) ? (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      📸 {product.images.length} image
                      {product.images.length !== 1 ? 's' : ''} matched:
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {product.images.map((imageUrl, idx) => {
                        const filename = imageUrl.split('/').pop();
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border"
                          >
                            <span className="text-gray-700 font-mono">
                              {filename}
                            </span>
                            <button
                              onClick={() =>
                                wizard.removeProductImage(
                                  product.reference,
                                  idx,
                                )
                              }
                              className="text-red-600 hover:text-red-800 font-bold"
                              title="Verwijder"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {product.images.map((imageUrl, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square bg-gray-100 rounded overflow-hidden border group"
                      >
                        <Image
                          src={imageUrl}
                          alt={`${product.name} ${idx + 1}`}
                          fill
                          className="object-cover"
                          unoptimized={imageUrl.startsWith('data:')}
                        />
                        <button
                          onClick={() =>
                            wizard.removeProductImage(
                              product.reference,
                              idx,
                            )
                          }
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="Verwijder deze foto"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual Upload */}
            <div className="flex gap-2">
              <label className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 cursor-pointer inline-block">
                📁 Upload Foto&apos;s
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) =>
                    wizard.handleManualImageUpload(
                      product.reference,
                      e.target.files,
                    )
                  }
                  className="hidden"
                />
              </label>
              {product.images && product.images.length > 0 && (
                <button
                  onClick={() => {
                    wizard.setParsedProducts((products) =>
                      products.map((p) =>
                        p.reference === product.reference
                          ? { ...p, images: [] }
                          : p,
                      ),
                    );
                  }}
                  className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  🗑️ Verwijder Alle Foto&apos;s
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3 justify-between">
        <button
          onClick={() => wizard.setCurrentStep(1)}
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
        >
          ⬅️ Terug
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => {
              wizard.setParsedProducts((products) =>
                products.map((p) => ({ ...p, images: [] })),
              );
              wizard.setCurrentStep(2);
            }}
            className="px-6 py-3 bg-yellow-600 text-white rounded hover:bg-yellow-700 font-medium"
          >
            ⏭️ Zonder Afbeeldingen
          </button>
          <button
            onClick={() => wizard.setCurrentStep(2)}
            className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
          >
            ➡️ Ga Verder
          </button>
        </div>
      </div>
    </div>
  );
}
