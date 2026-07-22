import { useEffect, useState } from 'react';
import FuzzySearchSelect from '@/components/import/shared/FuzzySearchSelect';
import { rebuildNameWithBrand } from '@/lib/import/shared/name-utils';
import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

const SIZE_ATTRIBUTE_OPTIONS = [
  "MAAT Baby's",
  'MAAT Kinderen',
  'MAAT Tieners',
  'MAAT Volwassenen',
  'Eén Maat',
] as const;

interface StockStepProps {
  wizard: UseImportWizardReturn;
}

export default function StockStep({ wizard }: StockStepProps) {
  const [bulkBrandId, setBulkBrandId] = useState<string>('');
  const existingBarcodesArray = Array.from(wizard.existingBarcodes.entries());

  const hasExistingBarcodes = (productRef: string) => {
    const product = wizard.parsedProducts.find((p) => p.reference === productRef);
    if (!product) return false;
    return product.variants.some((v) => wizard.existingBarcodes.has(v.ean));
  };

  const brandOptions = wizard.brands.map((b) => ({
    id: b.id,
    label: `${b.name} (${b.source})`,
    group: b.source,
  }));

  // Prefetch Odoo size values for attributes used by selected products
  useEffect(() => {
    const attrs = new Set<string>();
    for (const product of wizard.parsedProducts) {
      if (!wizard.selectedProducts.has(product.reference)) continue;
      const attr =
        product.sizeAttribute ||
        wizard.determineSizeAttribute(product.variants[0]?.size || '');
      if (attr && attr !== 'Eén Maat') attrs.add(attr);
    }
    for (const attr of attrs) {
      void wizard.ensureSizeValuesLoaded(attr);
    }
  }, [wizard.parsedProducts, wizard.selectedProducts]);

  useEffect(() => {
    if (wizard.brands.length === 0) {
      void wizard.fetchBrands();
    }
  }, [wizard.brands.length]);

  const applyBulkBrand = () => {
    if (!bulkBrandId) return;
    const brand = wizard.brands.find((b) => b.id.toString() === bulkBrandId);
    if (!brand) return;
    wizard.setParsedProducts((products) =>
      products.map((p) => {
        if (!wizard.selectedProducts.has(p.reference)) return p;
        return {
          ...p,
          selectedBrand: { id: brand.id, name: brand.name },
          suggestedBrand: brand.name,
          name: rebuildNameWithBrand(
            p.name,
            p.originalName,
            p.color,
            brand.name,
          ),
        };
      }),
    );
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">☑️ Selecteer Producten &amp; Voorraad</h2>
      <p className="text-gray-600 mb-4">
        Selecteer welke producten je wilt importeren, pas voorraad aan en genereer barcodes.
      </p>

      {/* Bulk brand — available here, not only on Categorieën */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <FuzzySearchSelect
            options={brandOptions}
            value={bulkBrandId || null}
            onChange={setBulkBrandId}
            placeholder={
              wizard.brands.length === 0
                ? 'Merken laden...'
                : 'Zoek merk voor geselecteerde producten...'
            }
            label="Merk (bulk)"
            showGroupHeaders
          />
        </div>
        <button
          type="button"
          onClick={applyBulkBrand}
          disabled={!bulkBrandId || wizard.selectedProducts.size === 0}
          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Pas merk toe op selectie ({wizard.selectedProducts.size})
        </button>
      </div>

      {/* Action buttons bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
          onClick={() => wizard.setSelectedProducts(new Set(wizard.parsedProducts.map((p) => p.reference)))}
        >
          ✓ Alles Selecteren
        </button>
        <button
          className="px-3 py-2 bg-gray-500 text-white rounded text-sm font-medium hover:bg-gray-600"
          onClick={() => wizard.setSelectedProducts(new Set())}
        >
          ✗ Alles Deselecteren
        </button>
        <button
          className="px-3 py-2 bg-yellow-500 text-white rounded text-sm font-medium hover:bg-yellow-600"
          onClick={() => wizard.setAllFavorites(true)}
        >
          ⭐ Favoriet aan
        </button>
        <button
          className="px-3 py-2 bg-yellow-400 text-white rounded text-sm font-medium hover:bg-yellow-500"
          onClick={() => wizard.setAllFavorites(false)}
        >
          ⭐ Favoriet uit
        </button>
        <button
          className="px-3 py-2 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700"
          onClick={() => wizard.setAllPublished(true)}
        >
          🌐 Gepubliceerd aan
        </button>
        <button
          className="px-3 py-2 bg-purple-400 text-white rounded text-sm font-medium hover:bg-purple-500"
          onClick={() => wizard.setAllPublished(false)}
        >
          🌐 Gepubliceerd uit
        </button>
        <button
          className="px-3 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
          onClick={() => {
            wizard.parsedProducts.forEach((p) => {
              p.variants.forEach((_, idx) => {
                wizard.updateVariantQuantity(p.reference, idx, 0);
              });
            });
          }}
        >
          📦 Voorraad 0
        </button>
        <button
          className="px-3 py-2 bg-teal-600 text-white rounded text-sm font-medium hover:bg-teal-700"
          onClick={wizard.generateBarcodes}
          disabled={wizard.generatingBarcodes}
        >
          {wizard.generatingBarcodes ? '⏳ Genereren...' : '🏷️ Genereer barcodes'}
        </button>

        <select
          className="px-3 py-2 border rounded text-sm bg-white"
          value={wizard.aiTargetAudience}
          onChange={(e) => wizard.setAiTargetAudience(e.target.value as 'auto' | 'kinderen' | 'volwassenen')}
        >
          <option value="auto">AI: auto</option>
          <option value="kinderen">AI: kinderen</option>
          <option value="volwassenen">AI: volwassenen</option>
        </select>

        <button
          className="px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700"
          onClick={wizard.generateAllDescriptions}
        >
          ✨ AI Beschrijvingen
        </button>
        <button
          className="px-3 py-2 bg-gray-600 text-white rounded text-sm font-medium hover:bg-gray-700"
          onClick={() => wizard.setShowPromptModal(true)}
        >
          📝 Prompts
        </button>

        <select
          className="px-3 py-2 border rounded text-sm bg-white"
          value=""
          onChange={(e) => {
            if (e.target.value) {
              wizard.setAllSizeAttribute(e.target.value);
            }
          }}
        >
          <option value="">📏 Maat...</option>
          {SIZE_ATTRIBUTE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded text-sm font-medium">
          {wizard.selectedCount} producten / {wizard.totalVariants} varianten geselecteerd
        </span>
      </div>

      {/* Existing barcode warnings */}
      {existingBarcodesArray.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
          <h4 className="font-bold text-yellow-800 mb-2">⚠️ Bestaande barcodes in Odoo gevonden</h4>
          <p className="text-yellow-700 text-sm mb-2">
            De volgende barcodes bestaan al in Odoo. Producten met deze barcodes zijn automatisch gedeselecteerd.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded p-3 max-h-32 overflow-y-auto">
            {existingBarcodesArray.map(([barcode, info]) => (
              <div key={barcode} className="text-sm text-orange-800">
                <span className="font-mono">{barcode}</span> — {info.name} (voorraad: {info.qty})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product cards */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {wizard.parsedProducts.map((product) => {
          const isSelected = wizard.selectedProducts.has(product.reference);
          const productExistsInOdoo = hasExistingBarcodes(product.reference);
          const sizeAttr = wizard.determineSizeAttribute(product.variants[0]?.size || '');
          const productSizeAttribute = product.sizeAttribute || sizeAttr;
          const unitOnly = wizard.isUnitOnlyProduct(product);

          return (
            <div
              key={`${product.reference}_${product.color}`}
              className={`border rounded-lg p-4 ${
                productExistsInOdoo
                  ? 'border-orange-400 bg-orange-50'
                  : isSelected
                    ? 'border-blue-300 bg-white'
                    : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              {/* Product exists warning */}
              {productExistsInOdoo && (
                <div className="bg-orange-100 border border-orange-300 rounded p-2 mb-3 text-sm text-orange-800">
                  ⚠️ Dit product heeft varianten die al bestaan in Odoo. Controleer of je dit wilt importeren.
                </div>
              )}

              {/* Product header */}
              <div className="flex items-start gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => wizard.toggleProduct(product.reference)}
                  className="mt-1 w-5 h-5"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={product.name}
                    onChange={(e) => wizard.updateProductName(product.reference, e.target.value)}
                    className="w-full font-bold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                  />
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{product.reference}</span>
                    {product.color && <span>Kleur: {product.color}</span>}
                    <div className="min-w-[200px]">
                      <FuzzySearchSelect
                        options={brandOptions}
                        value={product.selectedBrand?.id ?? null}
                        onChange={(value) => {
                          if (!value) {
                            wizard.updateProductBrand(
                              product.reference,
                              null,
                              product.color,
                            );
                            return;
                          }
                          const brand = wizard.brands.find(
                            (b) => b.id.toString() === value,
                          );
                          if (brand) {
                            wizard.updateProductBrand(
                              product.reference,
                              brand,
                              product.color,
                            );
                          }
                        }}
                        placeholder="Selecteer merk..."
                      />
                    </div>
                    <select
                      value={productSizeAttribute}
                      onChange={(e) => wizard.updateProductSizeAttribute(product.reference, e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-white"
                      disabled={unitOnly}
                    >
                      {SIZE_ATTRIBUTE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={product.isFavorite}
                        onChange={() => wizard.toggleProductFavorite(product.reference)}
                      />
                      <span className="text-xs">⭐ Favoriet</span>
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={product.isPublished}
                        onChange={() => wizard.toggleProductPublished(product.reference)}
                      />
                      <span className="text-xs">🌐 Gepubliceerd</span>
                    </label>
                    <span className="text-xs text-blue-600 font-medium">
                      {product.variants.length} variant{product.variants.length !== 1 ? 'en' : ''}
                    </span>
                    <span className="text-xs text-green-600 font-medium">
                      €{(product.variants[0]?.rrp || product.variants[0]?.price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Variants table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left font-semibold text-gray-700">Maat</th>
                      <th className="p-2 text-left font-semibold text-gray-700">EAN</th>
                      <th className="p-2 text-left font-semibold text-gray-700">Kostprijs</th>
                      <th className="p-2 text-left font-semibold text-gray-700">Verkoopprijs</th>
                      <th className="p-2 text-left font-semibold text-gray-700">Voorraad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant, idx) => {
                      const barcodeExists = wizard.existingBarcodes.has(variant.ean);
                      return (
                        <tr
                          key={idx}
                          className={`border-t ${barcodeExists ? 'bg-orange-50' : ''}`}
                        >
                          <td className="p-2 min-w-[140px]">
                            {productSizeAttribute === 'Eén Maat' ? (
                              <span className="text-xs text-gray-500 px-1">Eén maat</span>
                            ) : (
                              <FuzzySearchSelect
                                options={(
                                  wizard.sizeValuesByAttribute[productSizeAttribute] || []
                                ).map((v) => ({
                                  id: v.name,
                                  label: v.name,
                                }))}
                                value={
                                  productSizeAttribute === 'MAAT Volwassenen'
                                    ? wizard.mapSizeToOdooFormat(variant.size)
                                    : variant.size
                                }
                                onChange={(value) =>
                                  wizard.updateVariantField(
                                    product.reference,
                                    idx,
                                    'size',
                                    value,
                                  )
                                }
                                placeholder={
                                  wizard.loadingSizeAttribute === productSizeAttribute
                                    ? 'Laden...'
                                    : 'Zoek maat...'
                                }
                                allowCustom
                                className="min-w-[120px]"
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={variant.ean}
                              onChange={(e) => wizard.updateVariantField(product.reference, idx, 'ean', e.target.value)}
                              className={`w-36 border rounded px-2 py-1 text-sm font-mono ${
                                barcodeExists ? 'border-orange-400 bg-orange-50' : ''
                              }`}
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">€</span>
                              <input
                                type="number"
                                step="0.01"
                                value={variant.price}
                                onChange={(e) => wizard.updateVariantField(product.reference, idx, 'price', parseFloat(e.target.value) || 0)}
                                className="w-20 border rounded px-2 py-1 text-sm"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">€</span>
                              <input
                                type="number"
                                step="0.01"
                                value={variant.rrp}
                                onChange={(e) => wizard.updateVariantField(product.reference, idx, 'rrp', parseFloat(e.target.value) || 0)}
                                className="w-20 border rounded px-2 py-1 text-sm"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={variant.quantity}
                              onChange={(e) => wizard.updateVariantQuantity(product.reference, idx, parseInt(e.target.value) || 0)}
                              className="w-16 border rounded px-2 py-1 text-sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* E-commerce description */}
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm font-medium text-gray-700">
                    E-commerce beschrijving
                    <span className="text-xs text-gray-400 ml-1">
                      ({productSizeAttribute === 'MAAT Volwassenen' ? 'volwassenen' : 'kinderen'})
                    </span>
                  </label>
                  <button
                    className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50"
                    onClick={() => wizard.generateAIDescription(product)}
                    disabled={wizard.generatingDescription.has(product.reference)}
                  >
                    {wizard.generatingDescription.has(product.reference) ? '⏳ Bezig...' : '✨ AI Genereren'}
                  </button>
                </div>
                <textarea
                  value={product.ecommerceDescription || ''}
                  onChange={(e) => wizard.updateProductDescription(product.reference, e.target.value)}
                  rows={3}
                  className="w-full border rounded px-3 py-2 text-sm resize-y"
                  placeholder="E-commerce beschrijving..."
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tip box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
        <p className="text-blue-800 text-sm">
          💡 <strong>Tip:</strong> Verkoopprijs (RRP) wordt gesynchroniseerd over alle varianten van een product.
          Als je de verkoopprijs bij één variant wijzigt, worden alle varianten bijgewerkt.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
          onClick={() => wizard.setCurrentStep(2)}
        >
          ← Terug
        </button>
        <button
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          onClick={() => wizard.setCurrentStep(4)}
        >
          Volgende: Categorieën →
        </button>
      </div>
    </div>
  );
}
