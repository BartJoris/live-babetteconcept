import Link from 'next/link';
import FuzzySearchSelect from '@/components/import/shared/FuzzySearchSelect';
import CategoryTreeSelect from '@/components/import/shared/CategoryTreeSelect';
import MultiTagSelect from '@/components/import/shared/MultiTagSelect';
import BulkCategoryAssign from '@/components/import/shared/BulkCategoryAssign';
import type { UseImportWizardReturn } from '@/hooks/useImportWizard';

interface CategoriesStepProps {
  wizard: UseImportWizardReturn;
}

export default function CategoriesStep({ wizard }: CategoriesStepProps) {
  const selectedProductsList = wizard.parsedProducts.filter((p) =>
    wizard.selectedProducts.has(p.reference),
  );

  return (
    <div>
      {/* Header */}
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">📁 Categorieën Toewijzen</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Wijs merken, categorieën en labels toe aan je producten. Gebruik batch-toewijzing om snel meerdere producten tegelijk bij te werken.
      </p>

      {/* Data Status */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Geladen gegevens</h3>
          <button
            onClick={() => {
              wizard.fetchBrands();
              wizard.fetchCategories();
            }}
            className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            🔄 Vernieuw Data
          </button>
        </div>
        <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-300">
          <span>Merken: <strong>{wizard.brands.length}</strong></span>
          <span>Interne Categorieën: <strong>{wizard.internalCategories.length}</strong></span>
          <span>Publieke Categorieën: <strong>{wizard.publicCategories.length}</strong></span>
          <span>Productlabels: <strong>{wizard.productTags.length}</strong></span>
        </div>
        {wizard.categoriesDataError && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
            {wizard.categoriesDataError}{' '}
            <Link href="/" className="underline font-medium">
              Ga naar login
            </Link>
          </div>
        )}
      </div>

      {/* Bulk Category Assign */}
      <BulkCategoryAssign
        products={wizard.parsedProducts}
        selectedProductRefs={wizard.selectedProducts}
        brands={wizard.brands}
        internalCategories={wizard.internalCategories}
        publicCategories={wizard.publicCategories}
        productTags={wizard.productTags}
        onProductsChange={(updated) => wizard.setParsedProducts(updated)}
      />

      {/* Per Product Categorieën */}
      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-3">Per Product Categorieën</h3>
      <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-x-auto pb-80">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-blue-600 dark:bg-blue-700 text-white sticky top-0 z-10">
            <tr>
              <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Product</th>
              <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Merk</th>
              <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Interne Categorie</th>
              <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Webshopcat.</th>
              <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Productlabels</th>
            </tr>
          </thead>
          <tbody>
            {selectedProductsList.map((product, idx) => (
              <tr
                key={`${product.reference}_${product.color || ''}`}
                className={`border-b dark:border-gray-700 ${
                  idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
                }`}
              >
                {/* Product */}
                <td className="p-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{product.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{product.reference}</div>
                </td>

                {/* Merk */}
                <td className="p-3">
                  <FuzzySearchSelect
                    options={wizard.brands.map((b) => ({
                      id: b.id,
                      label: `${b.name} (${b.source})`,
                      group: b.source,
                    }))}
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
                    className="min-w-[180px]"
                    showGroupHeaders
                  />
                  {product.suggestedBrand && !product.selectedBrand && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Suggestie: {product.suggestedBrand}
                    </div>
                  )}
                </td>

                {/* Interne Categorie */}
                <td className="p-3">
                  <CategoryTreeSelect
                    categories={wizard.internalCategories}
                    selectedId={product.category?.id ?? null}
                    onChange={(id) => {
                      if (id != null) {
                        const category = wizard.internalCategories.find((c) => c.id === id);
                        if (category) {
                          wizard.setParsedProducts((products) =>
                            products.map((p) =>
                              p.reference === product.reference
                                ? { ...p, category: { id: category.id, name: category.display_name || category.name } }
                                : p,
                            ),
                          );
                        }
                      } else {
                        wizard.setParsedProducts((products) =>
                          products.map((p) =>
                            p.reference === product.reference
                              ? { ...p, category: undefined }
                              : p,
                          ),
                        );
                      }
                    }}
                    placeholder="Selecteer categorie..."
                  />
                </td>

                {/* eCommerce Cat. */}
                <td className="p-3">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {product.sizeAttribute && (
                      <span className="inline-block px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs">
                        {product.sizeAttribute}
                      </span>
                    )}
                    {product.csvCategory && (
                      <span className="inline-block px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-xs">
                        CSV: {product.csvCategory}
                      </span>
                    )}
                  </div>
                  <MultiTagSelect
                    options={wizard.publicCategories}
                    selectedIds={product.publicCategories.map((c) => c.id)}
                    onChange={(ids) => {
                      const cats = wizard.publicCategories
                        .filter((c) => ids.includes(c.id))
                        .map((c) => ({ id: c.id, name: c.display_name || c.name }));
                      wizard.setParsedProducts((products) =>
                        products.map((p) =>
                          p.reference === product.reference
                            ? { ...p, publicCategories: cats }
                            : p,
                        ),
                      );
                    }}
                    placeholder="+ Categorie..."
                    maxVisible={3}
                  />
                </td>

                {/* Productlabels */}
                <td className="p-3">
                  <MultiTagSelect
                    options={wizard.productTags}
                    selectedIds={product.productTags.map((t) => t.id)}
                    onChange={(ids) => {
                      const tags = wizard.productTags
                        .filter((t) => ids.includes(t.id))
                        .map((t) => ({ id: t.id, name: t.display_name || t.name }));
                      wizard.setParsedProducts((products) =>
                        products.map((p) =>
                          p.reference === product.reference
                            ? { ...p, productTags: tags }
                            : p,
                        ),
                      );
                    }}
                    placeholder="+ Label..."
                    maxVisible={3}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => wizard.setCurrentStep(3)}
          className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
        >
          ← Terug
        </button>
        <button
          onClick={() => wizard.setCurrentStep(5)}
          className="px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-800"
        >
          Volgende: Afbeeldingen →
        </button>
      </div>
    </div>
  );
}
