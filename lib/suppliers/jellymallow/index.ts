/**
 * Jelly Mallow supplier plugin.
 * Parses the SS26 Linesheet CSV (semicolon-delimited).
 *
 * CSV structure:
 * - Metadata/agency info rows at the top (variable count).
 * - Header row containing "Style no.", "PRODUCT NAME", "COLOR", etc.
 * - Product rows: have Style no., category, name, color, composition.
 * - Variant rows: have SIZE CODE (ERP) + SIZE (e.g. "3Y(100CM)").
 * - Prices (WHP/RRP) appear on one variant row or a standalone price row.
 * - Accessories use size "FREE" (→ "U" one-size).
 */

import { parseCSV } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function normalizeField(s: string): string {
  if (!s) return '';
  return s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Strip the "(XXXcm)" portion and convert: "3Y(100CM)" → "3Y" → "3 jaar", "FREE" → "U". */
function convertJellyMallowSize(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();
  if (/^FREE$/i.test(s)) return 'U';
  const cleaned = s.replace(/\s*\(\d+CM\)\s*/i, '').trim();
  return convertSize(cleaned);
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { rows } = parseCSV(text, { delimiter: ';', hasHeader: false });
  if (rows.length === 0) return [];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if (rows[i].some(cell => /style\s*no/i.test(cell))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headerCells = rows[headerIdx].map(h => h.toLowerCase().trim());
  const col = (name: string) => headerCells.findIndex(h => h.includes(name));

  const iStyle = col('style no');
  const iCategory = col('category');
  const iName = col('product name');
  const iColor = col('color');
  const iComposition = col('composition');
  const iSizeCode = headerCells.findIndex(h => h.includes('size') && (h.includes('code') || h.includes('erp')));
  const iSize = headerCells.findIndex((h, idx) => idx !== iSizeCode && h === 'size');
  const iOrderQty = headerCells.findIndex(h => h.includes('order') && h.includes('quantity'));
  const iWhp = col('whp');
  const iRrp = col('rrp');

  if (iStyle === -1 || iName === -1) return [];

  const brand = context.findBrand('jelly mallow', 'jellymallow');
  const products = new Map<string, ParsedProduct>();
  const productPrices = new Map<string, { whp: number; rrp: number }>();

  let currentStyle = '';
  let currentName = '';
  let currentColor = '';
  let currentComposition = '';
  let currentCategory = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i];

    const styleNo = (cells[iStyle] || '').trim();
    if (styleNo) {
      currentStyle = styleNo;
      currentName = normalizeField(iName >= 0 ? (cells[iName] || '') : '');
      currentColor = normalizeField(iColor >= 0 ? (cells[iColor] || '') : '');
      currentComposition = normalizeField(iComposition >= 0 ? (cells[iComposition] || '') : '');
      currentCategory = iCategory >= 0 ? (cells[iCategory] || '').trim() : '';
    }

    if (!currentStyle) continue;

    const productKey = `${currentStyle}-${currentColor}`.toLowerCase().replace(/\s+/g, '-');

    const whp = iWhp >= 0 ? parseEuroPrice(cells[iWhp] || '') : 0;
    const rrp = iRrp >= 0 ? parseEuroPrice(cells[iRrp] || '') : 0;
    if (whp > 0 || rrp > 0) {
      const existing = productPrices.get(productKey) || { whp: 0, rrp: 0 };
      if (whp > 0) existing.whp = whp;
      if (rrp > 0) existing.rrp = rrp;
      productPrices.set(productKey, existing);
    }

    const sizeCode = iSizeCode >= 0 ? (cells[iSizeCode] || '').trim() : '';
    if (!sizeCode) continue;

    const sizeRaw = iSize >= 0 ? (cells[iSize] || '').trim() : '';
    if (!sizeRaw) continue;

    const size = convertJellyMallowSize(sizeRaw);
    if (!size) continue;

    const qty = iOrderQty >= 0 ? parseInt(cells[iOrderQty] || '0', 10) || 0 : 0;
    const displayColor = toSentenceCase(currentColor);

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: currentStyle,
        name: `Jelly Mallow - ${toSentenceCase(currentName)}${displayColor ? ` - ${displayColor}` : ''}`,
        originalName: currentName,
        color: displayColor,
        material: currentComposition,
        csvCategory: currentCategory,
        ecommerceDescription: currentComposition || currentName,
        variants: [],
        suggestedBrand: brand?.name || 'Jelly Mallow',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    products.get(productKey)!.variants.push({
      size,
      ean: '',
      sku: sizeCode || undefined,
      quantity: qty,
      price: whp,
      rrp,
    });
  }

  for (const [key, product] of products) {
    const prices = productPrices.get(key);
    if (!prices) continue;
    for (const v of product.variants) {
      if (v.price === 0 && prices.whp > 0) v.price = prices.whp;
      if (v.rrp === 0 && prices.rrp > 0) v.rrp = prices.rrp;
    }
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

/**
 * Extract style reference from image filename.
 * "JM2610108.jpg" → "JM2610108"
 * "JM2610108_2.jpg" → "JM2610108"
 * "JM2610135-1_2048x.png.webp" → "JM2610135"
 * "JM2610149_1.png.webp" → "JM2610149"
 */
function extractImageReference(filename: string): string | null {
  const match = filename.match(/^(JM\d{7})/i);
  return match ? match[1].toUpperCase() : null;
}

const jellymallow: SupplierPlugin = {
  id: 'jellymallow',
  displayName: 'Jelly Mallow',
  brandName: 'Jelly Mallow',

  fileInputs: [
    { id: 'main_csv', label: 'Jelly Mallow Linesheet CSV', accept: '.csv', required: true, type: 'csv' },
  ],

  parse,

  imageMatching: {
    strategy: 'reference',
    extractReference: extractImageReference,
  },

  imageUpload: {
    enabled: true,
    instructions: 'Upload Jelly Mallow productafbeeldingen. Bestandsnamen moeten beginnen met het stijlnummer (bijv. JM2610108.jpg). Extra afbeeldingen met suffix (_2, _3, -1, -2) worden automatisch aan hetzelfde product gekoppeld.',
    exampleFilenames: [
      'JM2610108.jpg',
      'JM2610108_2.jpg',
      'JM2610135-1_2048x.png.webp',
    ],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: extractImageReference,
  },
};

export default jellymallow;
