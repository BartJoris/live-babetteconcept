import { useState, useCallback } from 'react';

import type { ParsedProduct } from '@/lib/suppliers/types';

import FuzzySearchSelect from './FuzzySearchSelect';
import MultiTagSelect from './MultiTagSelect';

interface CategoryOption {
  id: number;
  name: string;
  display_name?: string;
}

interface BulkCategoryAssignProps {
  products: ParsedProduct[];
  selectedProductRefs: Set<string>;
  brands: Array<{ id: number; name: string }>;
  internalCategories: CategoryOption[];
  publicCategories: CategoryOption[];
  productTags: CategoryOption[];
  onProductsChange: (products: ParsedProduct[]) => void;
}

export default function BulkCategoryAssign({
  products,
  selectedProductRefs,
  brands,
  internalCategories,
  publicCategories,
  productTags,
  onProductsChange,
}: BulkCategoryAssignProps) {
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedPublicCats, setSelectedPublicCats] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);

  const selectedCount = selectedProductRefs.size;
  const hasAnySelection =
    selectedBrand || selectedCategory || selectedPublicCats.length > 0 || selectedTags.length > 0;

  const handleApply = useCallback(() => {
    if (selectedCount === 0 || !hasAnySelection) return;

    const updated = products.map((p) => {
      if (!selectedProductRefs.has(p.reference)) return p;

      const changes: Partial<ParsedProduct> = {};

      if (selectedBrand) {
        const brand = brands.find((b) => b.id.toString() === selectedBrand);
        if (brand) changes.selectedBrand = { id: brand.id, name: brand.name };
      }

      if (selectedCategory) {
        const cat = internalCategories.find((c) => c.id.toString() === selectedCategory);
        if (cat) changes.category = { id: cat.id, name: cat.display_name || cat.name };
      }

      if (selectedPublicCats.length > 0) {
        const cats = publicCategories
          .filter((c) => selectedPublicCats.includes(c.id))
          .map((c) => ({ id: c.id, name: c.display_name || c.name }));
        changes.publicCategories = [...p.publicCategories, ...cats.filter(
          (newCat) => !p.publicCategories.some((existing) => existing.id === newCat.id),
        )];
      }

      if (selectedTags.length > 0) {
        const tags = productTags
          .filter((t) => selectedTags.includes(t.id))
          .map((t) => ({ id: t.id, name: t.display_name || t.name }));
        changes.productTags = [...p.productTags, ...tags.filter(
          (newTag) => !p.productTags.some((existing) => existing.id === newTag.id),
        )];
      }

      return { ...p, ...changes };
    });

    onProductsChange(updated);
    setSelectedBrand('');
    setSelectedCategory('');
    setSelectedPublicCats([]);
    setSelectedTags([]);
  }, [
    products,
    selectedProductRefs,
    selectedCount,
    hasAnySelection,
    selectedBrand,
    selectedCategory,
    selectedPublicCats,
    selectedTags,
    brands,
    internalCategories,
    publicCategories,
    productTags,
    onProductsChange,
  ]);

  if (selectedCount === 0) return null;

  const brandOptions = brands.map((b) => ({ id: b.id, label: b.name }));
  const categoryOptions = internalCategories.map((c) => ({
    id: c.id,
    label: c.display_name || c.name,
  }));

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {selectedCount}
        </span>
        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          Bulk toewijzing voor geselecteerde producten
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <FuzzySearchSelect
          options={brandOptions}
          value={selectedBrand || null}
          onChange={setSelectedBrand}
          placeholder="Selecteer merk..."
          label="Merk"
        />

        <FuzzySearchSelect
          options={categoryOptions}
          value={selectedCategory || null}
          onChange={setSelectedCategory}
          placeholder="Selecteer interne categorie..."
          label="Interne categorie"
        />

        <MultiTagSelect
          options={publicCategories}
          selectedIds={selectedPublicCats}
          onChange={setSelectedPublicCats}
          placeholder="Zoek eCommerce categorieën..."
          label="eCommerce categorieën"
          maxVisible={3}
        />

        <MultiTagSelect
          options={productTags}
          selectedIds={selectedTags}
          onChange={setSelectedTags}
          placeholder="Zoek product tags..."
          label="Product tags"
          maxVisible={3}
        />
      </div>

      <button
        onClick={handleApply}
        disabled={!hasAnySelection}
        className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
          hasAnySelection
            ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
        }`}
      >
        Toepassen op {selectedCount} geselecteerde product{selectedCount !== 1 ? 'en' : ''}
      </button>
    </div>
  );
}
