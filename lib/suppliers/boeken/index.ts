/**
 * Babette boeken import (resterende voorraad / uitgeverij-lijsten).
 *
 * Numbers/CSV columns:
 *   Uitgeverij; Titel; Aankoopprijs; Verkoopprijs; BTW; Categorie; Barcode;
 *   Kenmerken: uitgeverij; Gewicht; E-commerce categorieën;
 *   Productsjabloonlabel; Lange beschrijving; Bericht niet op voorraad
 *
 * Differs from clothing suppliers: BTW 6%, internal Speelgoed/Boeken path,
 * multi ecommerce age categories, product tag (klantenkaart), weight, no sizes.
 */

import { parseCSV, rowToObject } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { splitPublicCategoryPaths } from '@/lib/import/shared/public-category-match';
import type {
  SupplierPlugin,
  ParsedProduct,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

function parseTaxRate(raw: string): number | undefined {
  if (!raw?.trim()) return undefined;
  const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!match) return undefined;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function parseWeight(raw: string): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = parseEuroPrice(raw);
  return n > 0 ? n : undefined;
}

function splitTagNames(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function isBoekenPricesCSV(text: string): boolean {
  const header = (text.split(/\r?\n/)[0] || '').toLowerCase();
  return (
    header.includes('uitgeverij') &&
    header.includes('titel') &&
    header.includes('barcode') &&
    (header.includes('e-commerce categorie') || header.includes('categorie')) &&
    (header.includes('btw') || header.includes('aankoopprijs'))
  );
}

function parseBoekenCSV(text: string, context: ParseContext): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const products: ParsedProduct[] = [];
  const seen = new Set<string>();

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const barcode = (row['Barcode'] || '').trim();
    const title = (row['Titel'] || '').trim();
    const publisher = (row['Uitgeverij'] || row['Kenmerken: uitgeverij'] || '').trim();
    if (!barcode || !title) continue;
    if (seen.has(barcode)) continue;
    seen.add(barcode);

    // Prefer suggestedBrand only — wizard rematches against Uitgeverij values
    // once those are loaded (findBrand here would search clothing MERK values).
    const brand = context.findBrand(publisher) || undefined;
    const purchase = parseEuroPrice(row['Aankoopprijs'] || '');
    const rrp = parseEuroPrice(row['Verkoopprijs'] || '');
    const taxRate = parseTaxRate(row['BTW'] || '');
    const weight = parseWeight(row['Gewicht'] || '');
    const internalCategory = (row['Categorie'] || '').trim();
    const publicPaths = splitPublicCategoryPaths(row['E-commerce categorieën'] || '');
    const tagNames = splitTagNames(row['Productsjabloonlabel'] || '');
    const description = (row['Lange beschrijving'] || '').trim();

    const displayName = publisher ? `${publisher} - ${title}` : title;

    products.push({
      reference: barcode,
      name: displayName,
      originalName: title,
      material: '',
      color: '',
      ecommerceDescription: description || displayName,
      csvCategory: publicPaths[0],
      csvInternalCategory: internalCategory || undefined,
      csvPublicCategoryPaths: publicPaths.length ? publicPaths : undefined,
      csvProductTagNames: tagNames.length ? tagNames : undefined,
      taxRate,
      weight,
      brandAttributeName: 'Uitgeverij',
      variants: [
        {
          size: 'U',
          quantity: 1,
          ean: barcode,
          sku: barcode,
          price: purchase,
          rrp,
        },
      ],
      suggestedBrand: publisher || brand?.name,
      // Leave unset until wizard matches Uitgeverij attribute values by name
      selectedBrand: undefined,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
      sizeAttribute: 'MAAT Kinderen',
      rrpSource: rrp > 0 ? 'pdf' : 'fallback',
    });
  }

  return products;
}

const boekenPlugin: SupplierPlugin = {
  id: 'boeken',
  displayName: 'Boeken (uitgeverijen)',
  brandName: 'Boeken',
  brandAttributeName: 'Uitgeverij',
  brandAttributeLabel: 'Uitgeverij',
  fileInputs: [
    {
      id: 'main_csv',
      label: 'Boekenlijst (CSV / Numbers / Excel)',
      accept: '.csv,.numbers,.xlsx,.xls',
      required: true,
      type: 'xlsx',
    },
  ],
  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) => isBoekenPricesCSV(text),
    },
  ],
  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const text = files['main_csv'] as string | undefined;
    if (!text) return [];
    return parseBoekenCSV(text, context);
  },

  imageMatching: {
    strategy: 'reference',
    extractReference: (filename) => {
      const base = filename.replace(/\.[^.]+$/, '');
      const isbn = base.match(/978\d{10}|979\d{10}/)?.[0];
      return isbn || null;
    },
  },

  imageUpload: {
    enabled: true,
    instructions:
      'Upload covers (JPG/PNG/WebP) of gebruik “Zoek covers (ISBN)” om automatisch afbeeldingen op te halen via barcode/ISBN.',
    exampleFilenames: ['9789002286957.jpg', '9781474986991.png'],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: (filename) => {
      const base = filename.replace(/\.[^.]+$/, '');
      const isbn = base.match(/978\d{10}|979\d{10}/)?.[0];
      return isbn || base;
    },
  },
};

export default boekenPlugin;
export { parseBoekenCSV };
