/**
 * Petit Bateau supplier plugin.
 *
 * CSV structure (semicolon-delimited order export):
 *   Style Name;Style Number;Color Name;Color Code;Size;…;UPC/EAN;SKU;
 *   Currency;Wholesale Price;Retail Price;…;Quantity Requested;…;
 *   Category;…;Material;…
 *
 * One row per size. Same Style Number + Color Code = one product.
 * Image filenames: "A0ARW 01 Large.png" → Style Number + Color Code.
 *
 * Sizes mix baby months (1M), French years (2A = 2 ans) and adult (S/M/L/2XL).
 */

import { parseCSV, rowToObject } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function buildReference(styleNumber: string, colorCode: string): string {
  const style = styleNumber.trim().toUpperCase();
  const color = colorCode.trim().padStart(2, '0');
  return color ? `${style}-${color}` : style;
}

/**
 * Convert Petit Bateau sizes:
 * - "2A" / "10A" (French ans) → "2 jaar" / "10 jaar"
 * - "2XL" → "XXL" (StockStep maps adult letters to "XXL - 44")
 * - "1M" / "S" / … via shared convertSize
 */
function convertPetitBateauSize(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();

  const ansMatch = s.match(/^(\d+)\s*A$/i);
  if (ansMatch) {
    return `${ansMatch[1]} jaar`;
  }

  if (/^2XL$/i.test(s)) return 'XXL';

  return convertSize(s);
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const brand = context.findBrand('petit bateau', 'petitbateau');
  const products = new Map<string, ParsedProduct>();

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const styleNumber = (row['Style Number'] || '').trim().toUpperCase();
    const styleName = (row['Style Name'] || '').trim();
    const colorName = (row['Color Name'] || '').trim();
    const colorCode = (row['Color Code'] || '').trim();
    const sizeRaw = (row['Size'] || '').trim();
    const ean = (row['UPC/EAN'] || '').trim();
    const sku = (row['SKU'] || '').trim();
    const price = parseEuroPrice(row['Wholesale Price'] || '');
    const rrp = parseEuroPrice(row['Retail Price'] || '');
    const quantity = parseInt(row['Quantity Requested'] || '0', 10) || 0;
    const category = (row['Category'] || '').trim();
    const material = (row['Material'] || '').trim();

    if (!styleNumber || !styleName) continue;

    const reference = buildReference(styleNumber, colorCode);

    if (!products.has(reference)) {
      const colorFormatted = colorName ? toSentenceCase(colorName) : '';
      products.set(reference, {
        reference,
        name: `Petit Bateau - ${toSentenceCase(styleName)}${colorFormatted ? ` - ${colorFormatted}` : ''}`,
        originalName: styleName,
        productName: styleNumber,
        material,
        color: colorFormatted,
        csvCategory: category || undefined,
        ecommerceDescription: material || undefined,
        variants: [],
        suggestedBrand: brand?.name || 'Petit Bateau',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    products.get(reference)!.variants.push({
      size: convertPetitBateauSize(sizeRaw),
      quantity,
      ean,
      sku: sku || undefined,
      price,
      rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach((p) => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

/**
 * "A0ARW 01 Large.png" → "A0ARW-01"
 * "A0DO0 02 Large.png" → "A0DO0-02"
 */
function extractPetitBateauImageReference(filename: string): string | null {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const match = base.match(/^([A-Z0-9]+)\s+(\d+)\b/i);
  if (!match) return null;
  return buildReference(match[1], match[2]);
}

const petitbateauPlugin: SupplierPlugin = {
  id: 'petitbateau',
  displayName: 'Petit Bateau',
  brandName: 'Petit Bateau',

  fileInputs: [
    { id: 'main_csv', label: 'Petit Bateau Order CSV', accept: '.csv', required: true, type: 'csv' },
  ],

  parse,

  imageMatching: {
    strategy: 'reference',
    extractReference: extractPetitBateauImageReference,
  },

  imageUpload: {
    enabled: true,
    instructions:
      'Upload productafbeeldingen. Bestandsnamen bestaan uit Style Number + Color Code (bijv. A0ARW 01 Large.png).',
    exampleFilenames: [
      'A0ARW 01 Large.png',
      'A0DO0 02 Large.png',
      'A0F7G 01 Large.png',
    ],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: extractPetitBateauImageReference,
  },
};

export default petitbateauPlugin;
