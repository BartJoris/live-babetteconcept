import { parseCSV, parseEuroPrice, rowToObject, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

const RRP_MULTIPLIER = 1.2;

/**
 * "Description" is the only column with the real color: it repeats the
 * reference and product name, then the color, then a throwaway sample size
 * (e.g. "AW26-602 Frills Long Coat Washed Blue 34"). The "Color name" column
 * is not a color at all - it's an internal style code (e.g. "FRILLS LONG COAT L15").
 */
function extractColor(description: string, reference: string, productName: string): string {
  let rest = description.trim();
  if (reference && rest.startsWith(reference)) {
    rest = rest.slice(reference.length).trim();
  }
  if (productName && rest.toLowerCase().startsWith(productName.toLowerCase())) {
    rest = rest.slice(productName.length).trim();
  }
  return rest.replace(/\s+\S+$/, '').trim() || rest;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const brand = context.findBrand('tiny big sister', 'tinycottons', 'tiny cottons');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const reference = row['Product reference'];
    if (!reference) continue;

    const productName = row['Product name'] || '';
    const category = row['Category'] || '';
    const material = row['Composition'] || '';
    const description = row['Description'] || '';
    const size = row['Size name'] || '';
    const ean = row['EAN13'] || '';
    const sku = row['SKU'] || '';
    const quantity = parseInt(row['Quantity'] || '0') || 0;
    const price = parseEuroPrice(row['Unit price'] || '');
    const color = extractColor(description, reference, productName);

    if (!products[reference]) {
      const formattedName = ['Tiny Big Sister', toSentenceCase(productName), toSentenceCase(color)]
        .filter(Boolean)
        .join(' - ');

      products[reference] = {
        reference,
        name: formattedName,
        originalName: productName,
        material,
        color,
        csvCategory: category,
        ecommerceDescription: formattedName,
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

    products[reference].variants.push({
      size,
      quantity,
      ean,
      sku: sku || undefined,
      price,
      rrp: price * RRP_MULTIPLIER,
    });
  }

  return Object.values(products);
}

const tinybigsisterPlugin: SupplierPlugin = {
  id: 'tinybigsister',
  displayName: 'Tiny Big Sister',
  brandName: 'Tiny Big Sister',
  fileInputs: [
    { id: 'main_csv', label: 'Tiny Big Sister CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  defaultSizeAttribute: 'MAAT Volwassenen',
  parse,
};

export default tinybigsisterPlugin;
