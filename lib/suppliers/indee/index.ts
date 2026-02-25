import { parseCSV, parseEuroPrice, toSentenceCase, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  const { headers, rows } = parseCSV(text, { delimiter: ';' });

  const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
  const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
  const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
  const barcodeIdx = headers.findIndex(h => h.toLowerCase() === 'barcode');
  const materialIdx = headers.findIndex(h => h.toLowerCase() === 'textile content');
  const wspIdx = headers.findIndex(h => h.toLowerCase() === 'wsp eur');
  const rrpIdx = headers.findIndex(h => h.toLowerCase() === 'rrp');
  const qtyIdx = headers.findIndex(h => h.toLowerCase() === 'sales order quantity');
  const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'product category 1');

  const brand = context.findBrand('indee');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const style = values[styleIdx] || '';
    const colour = values[colourIdx] || '';
    const description = values[descriptionIdx] || '';
    const rawSize = values[sizeIdx] || '';
    const barcode = values[barcodeIdx] || '';
    const material = values[materialIdx] || '';
    const price = parseEuroPrice(values[wspIdx] || '');
    const rrp = parseEuroPrice(values[rrpIdx] || '');
    const quantity = parseInt(values[qtyIdx] || '0') || 0;
    const category = values[categoryIdx] || '';

    if (!style) continue;

    const size = rawSize.toUpperCase() === 'TU' ? 'U' : rawSize;
    const productKey = `${style}|${colour}`;

    if (!products[productKey]) {
      const formattedName = `Indee - ${toSentenceCase(style)} ${description.toLowerCase()} ${colour.toLowerCase()}`.trim();
      products[productKey] = {
        reference: style,
        name: formattedName,
        originalName: style,
        material,
        color: colour,
        csvCategory: category,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        sizeAttribute: '',
      };
    }

    products[productKey].variants.push({
      size,
      quantity,
      ean: barcode,
      price,
      rrp,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

const indeePlugin: SupplierPlugin = {
  id: 'indee',
  displayName: 'Indee',
  brandName: 'Indee',
  fileInputs: [
    { id: 'main_csv', label: 'Indee CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  parse,
};

export default indeePlugin;
