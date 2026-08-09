import { parseCSV, parseEuroPrice, rowToObject, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';
import { buildTinycottonsRrpMap, isTinycottonsRrpCsv, lookupTinycottonsRrp } from './prices';

/**
 * On the order-confirmation export, "Description" repeats the reference and
 * product name, then the real color, then a throwaway sample size (e.g.
 * "AW26-602 Frills Long Coat Washed Blue 34"). The "Color name" column is
 * not a color at all - it's an internal style code (e.g. "FRILLS LONG COAT L15").
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

  // Optional separate RRP export (print-style order-confirmation sheet with
  // real SRP per reference+variant) - see ./prices.ts. When absent, falls
  // back to the inline "RRP" column (older catalog exports) or a markup.
  const rrpMap = buildTinycottonsRrpMap((files['rrp_csv'] as string) || '');

  const brand = context.findBrand('tiny big sister', 'tinycottons', 'tiny cottons');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const productName = row['Product name'] || '';
    if (!productName) continue;

    // Order-confirmation exports include a real "Product reference" so
    // colorways of the same product name stay separate products. Older,
    // simpler catalog exports don't have it - fall back to the product name.
    const reference = row['Product reference'] || productName;

    const category = row['Category'] || '';
    const material = row['Composition'] || '';
    const description = row['Description'] || '';
    const size = row['Size name'] || '';
    const ean = row['EAN13'] || '';
    const sku = row['SKU'] || '';
    const quantity = parseInt(row['Quantity'] || '0') || 0;
    const price = parseEuroPrice(row['Unit price'] || '');
    // "Color name" doubles as the RRP export's VARIANT key (see ./prices.ts).
    const variantCode = row['Color name'] || '';
    const rrp = row['RRP']
      ? parseEuroPrice(row['RRP'])
      : lookupTinycottonsRrp(rrpMap, reference, variantCode, price);
    const color = description ? extractColor(description, reference, productName) : '';

    if (!products[reference]) {
      const formattedName = ['Tiny Big sister', toSentenceCase(productName), toSentenceCase(color)]
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
    {
      id: 'rrp_csv',
      label: 'Tiny RRP export (optioneel)',
      accept: '.csv',
      required: false,
      type: 'csv',
    },
  ],
  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text: string) => {
        const firstLine = text.split('\n')[0]?.toLowerCase() || '';
        return firstLine.includes('product name') && firstLine.includes('ean13');
      },
    },
    {
      fileInputId: 'rrp_csv',
      detect: (text: string) => isTinycottonsRrpCsv(text),
    },
  ],
  defaultSizeAttribute: 'MAAT Volwassenen',
  parse,
};

export default tinycottonsPlugin;
