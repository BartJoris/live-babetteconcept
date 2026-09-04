/**
 * Fliink supplier plugin.
 *
 * CSV structure (semicolon-delimited, from Fliink's order export):
 *   Style No;Style Name;Brand;Type;Category;Quality;Color;Size;Qty;Barcode;
 *   Weight;Country;Customs Tariff No;Wholesale Price EURO;
 *   Recommended Retail Price EURO;Season;Delivery;...;Description;...
 *
 * Sizes use two formats:
 *   - "2Y/92", "3Y/98" — age/EU pairs
 *   - "2-3 YRS (95 CM)", "4-5 YRS (110 CM)" — age range with height
 *
 * Images: "{StyleNo} - {StyleName} - {Color} - Main.jpg" / "Extra N.jpg"
 *   e.g. "F1500 - CODY LS SHIRT - INSIGNIA CHECK - Main.jpg"
 */

import { parseCSV, rowToObject } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  ProductVariant,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

/**
 * Convert Fliink size formats to Odoo-compatible Dutch age strings.
 *   "2Y/92"               → "2 jaar"
 *   "2-3 YRS (95 CM)"     → "3 jaar"
 *   anything else          → delegates to shared convertSize
 */
function convertFliinkSize(size: string): string {
  if (!size) return size;
  const s = size.trim();

  const ageSlashMatch = s.match(/^(\d+)Y\/\d+$/i);
  if (ageSlashMatch) {
    return `${ageSlashMatch[1]} jaar`;
  }

  const yrsMatch = s.match(/^(\d+)-(\d+)\s*YRS?\s*\(\d+\s*CM\)$/i);
  if (yrsMatch) {
    return `${yrsMatch[2]} jaar`;
  }

  return convertSize(s);
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const brand = context.findBrand('fliink');
  const products = new Map<string, ParsedProduct>();

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const styleNo = (row['Style No'] || '').trim();
    if (!styleNo) continue;

    const styleName = (row['Style Name'] || '').trim();
    const color = (row['Color'] || '').trim();
    const rawSize = (row['Size'] || '').trim();
    const qty = parseInt(row['Qty'] || '0', 10) || 0;
    const barcode = (row['Barcode'] || '').trim();
    const material = (row['Quality'] || '').trim();
    const description = (row['Description'] || '').trim();
    const category = (row['Type'] || '').trim();

    const price = parseEuroPrice(row['Wholesale Price EURO'] || '0');
    const rrp = parseEuroPrice(row['Recommended Retail Price EURO'] || '0');

    const reference = styleNo;

    if (!products.has(reference)) {
      const nameColor = color ? toSentenceCase(color) : '';
      const formattedName = `Fliink - ${toSentenceCase(styleName)}${nameColor ? ` - ${nameColor}` : ''}`;

      products.set(reference, {
        reference,
        name: formattedName,
        originalName: styleName,
        material: toSentenceCase(material),
        color: toSentenceCase(color),
        csvCategory: category,
        ecommerceDescription: description || formattedName,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const variant: ProductVariant = {
      size: convertFliinkSize(rawSize),
      quantity: qty,
      ean: barcode,
      price,
      rrp,
    };

    products.get(reference)!.variants.push(variant);
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

/**
 * Extract Style No from image filename.
 * "F1500 - CODY LS SHIRT - INSIGNIA CHECK - Main.jpg" → "F1500"
 */
function extractImageReference(filename: string): string | null {
  const match = filename.match(/^(F\d+)\s*-/i);
  return match ? match[1].toUpperCase() : null;
}

const fliink: SupplierPlugin = {
  id: 'fliink',
  displayName: 'Fliink',
  brandName: 'Fliink',

  fileInputs: [
    { id: 'main_csv', label: 'Fliink Order CSV', accept: '.csv', required: true, type: 'csv' },
  ],

  parse,

  imageMatching: {
    strategy: 'filename-pattern',
    extractReference: extractImageReference,
  },

  imageUpload: {
    enabled: true,
    instructions:
      'Upload productafbeeldingen. Bestandsnamen: {StyleNo} - {StyleName} - {Color} - Main.jpg (of Extra 1.jpg, Extra 2.jpg, etc.).',
    exampleFilenames: [
      'F1500 - CODY LS SHIRT - INSIGNIA CHECK - Main.jpg',
      'F1500 - CODY LS SHIRT - INSIGNIA CHECK - Extra 1.jpg',
      'F2061 - ALVIN AUTUMN SWEATSHIRT - COFFEE BEAN - Main.jpg',
    ],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: extractImageReference,
  },
};

export default fliink;
