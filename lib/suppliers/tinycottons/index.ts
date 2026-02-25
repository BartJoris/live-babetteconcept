import { parseCSV, parseEuroPrice, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  const { headers, rows } = parseCSV(text, { delimiter: ';' });

  const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
  const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
  const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
  const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
  const qtyIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
  const priceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
  const rrpIdx = headers.findIndex(h => h.toLowerCase() === 'rrp');
  const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');

  const brand = context.findBrand('tiny big sister', 'tinycottons', 'tiny cottons');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const productName = values[productNameIdx] || '';
    const composition = values[compositionIdx] || '';
    const size = values[sizeIdx] || '';
    const ean = values[eanIdx] || '';
    const quantity = parseInt(values[qtyIdx] || '0') || 0;
    const price = parseEuroPrice(values[priceIdx] || '');
    const rrp = parseEuroPrice(values[rrpIdx] || '');
    const category = values[categoryIdx] || '';

    if (!productName) continue;

    const productKey = productName;

    if (!products[productKey]) {
      const formattedName = `Tiny Big sister - ${toSentenceCase(productName)}`;
      products[productKey] = {
        reference: productName,
        name: formattedName,
        originalName: productName,
        material: composition,
        color: '',
        csvCategory: category,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        sizeAttribute: 'MAAT Volwassenen',
      };
    }

    products[productKey].variants.push({
      size,
      quantity,
      ean,
      price,
      rrp,
    });
  }

  return Object.values(products);
}

const tinycottonsPlugin: SupplierPlugin = {
  id: 'tinycottons',
  displayName: 'Tiny Big sister',
  brandName: 'Tiny Big sister',
  fileInputs: [
    { id: 'main_csv', label: 'Tiny Big sister CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  defaultSizeAttribute: 'MAAT Volwassenen',
  parse,
};

export default tinycottonsPlugin;
