/**
 * Babe & Tess supplier plugin.
 * Supports two import methods:
 * 1. Order CSV from Le New Black/MINI B portal (semicolon-delimited, one row per size).
 * 2. Order PDF from MINI B (z_ordine-xxx.pdf): product name, code, color, sizes, quantities.
 * Verkoopprijs (RRP) = unit price × 2.7.
 */

import { determineSizeAttribute, convertSize } from '@/lib/import/shared';
import { parseCSV, rowToObject } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

export interface BabeAndTessPdfProduct {
  reference: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  rrp: number;
  ean?: string;
  sku?: string;
}

const RRP_MULTIPLIER = 2.7;

/**
 * Normaliseer kleur voor weergave: 065LightRose → Light Rose, 001Bianco → Bianco.
 * Strip cijferprefix, splits camelCase, title case.
 */
function normalizeColorName(color: string): string {
  if (!color || typeof color !== 'string') return '';
  const withoutPrefix = color.replace(/^\d+[-]?/, '').trim();
  const withSpaces = withoutPrefix.replace(/([a-z])([A-Z])/g, '$1 $2');
  return withSpaces
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Extract color code from full "Color name" field.
 * "Linen Babe 065LightRose" → "065LightRose"
 * "Natural & Striped 327MelogranoStriped" → "327MelogranoStriped"
 */
function extractColorCode(colorName: string): string {
  const match = colorName.match(/(\d{3}\w+)$/);
  return match ? match[1] : colorName;
}

/**
 * Convert Italian-style sizes: "3A" → "3Y" (then convertSize handles "3Y" → "3 jaar").
 * "24M" stays "24M" (already handled by convertSize → "24 maand").
 */
function convertBabeAndTessSize(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();
  const italianYear = s.match(/^(\d+)A$/i);
  if (italianYear) {
    return convertSize(`${italianYear[1]}Y`);
  }
  return convertSize(s);
}

// ─── CSV parsing ────────────────────────────────────────────────────────────

function parseBabeAndTessCsv(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const brand = context.findBrand('babe', 'tess', 'babe & tess');
  const products = new Map<string, ParsedProduct>();

  for (const values of rows) {
    const row = rowToObject(headers, values);

    const ref = (row['Product reference'] || '').trim();
    if (!ref) continue;

    const rawColorName = (row['Color name'] || '').trim();
    const colorCode = extractColorCode(rawColorName);
    const displayColor = normalizeColorName(colorCode) || rawColorName;
    const productKey = `${ref}-${rawColorName}`.toLowerCase().replace(/\s+/g, '-');

    const productName = (row['Product name'] || '').trim();
    const fullName = `Babe & Tess - ${productName || ref} - ${displayColor}`.trim();
    const material = (row['Composition'] || '').trim();
    const description = (row['Description'] || '').trim();
    const category = (row['Category'] || '').trim();

    const rawSize = (row['Size name'] || '').trim();
    const size = convertBabeAndTessSize(rawSize);

    const price = parseEuroPrice(row['Unit price'] || '');
    const rrp = Math.round(price * RRP_MULTIPLIER * 100) / 100;
    const quantity = parseInt(row['Quantity'] || '0') || 0;
    const ean = (row['EAN13'] || '').trim();
    const sku = (row['SKU'] || '').trim();

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: ref,
        name: fullName,
        originalName: productName,
        color: displayColor,
        material: material || description,
        ecommerceDescription: description || fullName,
        csvCategory: category,
        variants: [],
        suggestedBrand: brand?.name || 'Babe & Tess',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(productKey)!;
    product.variants.push({
      size,
      ean,
      sku: sku || undefined,
      quantity,
      price,
      rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

// ─── PDF parsing (existing) ─────────────────────────────────────────────────

function processBabeAndTessPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as BabeAndTessPdfProduct[];
  if (!pdfProducts.length) {
    return { products: [], message: 'Geen producten in PDF gevonden.' };
  }

  const brand = context.findBrand('babe', 'tess', 'babe & tess');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfProducts) {
    const ref = (item.reference || '').trim();
    const rawColor = (item.color || '').trim();
    const displayColor = normalizeColorName(rawColor) || rawColor;
    const productKey = `${ref}-${rawColor}`.toLowerCase().replace(/\s+/g, '-');
    const productName = `Babe & Tess - ${item.name || ref} - ${displayColor}`.trim();

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: ref,
        name: productName,
        originalName: item.name,
        color: displayColor,
        material: '',
        ecommerceDescription: productName,
        variants: [],
        suggestedBrand: brand?.name || 'Babe & Tess',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(productKey)!;
    const size = item.size ? convertSize(item.size) : item.size;
    product.variants.push({
      size: size || '',
      ean: item.ean || '',
      sku: item.sku || undefined,
      quantity: item.quantity,
      price: item.price,
      rrp: item.rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return {
    products: productList,
    message: `${productList.length} producten uit Babe & Tess PDF geladen. Verkoopprijs = aankoopprijs × ${RRP_MULTIPLIER}.`,
  };
}

// ─── Plugin definition ──────────────────────────────────────────────────────

const babeandtess: SupplierPlugin = {
  id: 'babeandtess',
  displayName: 'Babe & Tess',
  brandName: 'Babe & Tess',

  fileInputs: [
    { id: 'main_csv', label: 'Order CSV (Le New Black export)', accept: '.csv', required: false, type: 'csv' },
    { id: 'pdf_invoice', label: 'Order PDF (z_ordine-xxx.pdf)', accept: '.pdf', required: false, type: 'pdf' },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-babeandtess-pdf',

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    return parseBabeAndTessCsv(files, context);
  },

  processPdfResults: processBabeAndTessPdfResults,
};

export default babeandtess;
