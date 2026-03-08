/**
 * Cozmo supplier plugin.
 * - Order CSV: Order id, Product reference, Product name, Color name, Description, Composition, Fabric / print, Size name, EAN13, SKU, Quantity, Unit price.
 * - Price CSV (optional): Model, Variant, Retail price — used for RRP.
 * E-commerce: Description, Composition and Fabric/print are kept for e-commerce description.
 * Images: JPG ALTA folder; filenames like ABEL264s6_ivory-soft gauze cotton_1.jpg → reference ABEL264s6_ivory-soft gauze cotton.
 */

import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import type { SupplierPlugin, ParsedProduct, ProductVariant, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

interface OrderRow {
  productReference: string;
  productName: string;
  colorName: string;
  description: string;
  composition: string;
  fabricPrint: string;
  sizeName: string;
  ean: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

let priceMapCache: Map<string, number> | null = null;

function isOrderCSV(text: string): boolean {
  const first = text.split('\n')[0] || '';
  return first.includes('Order id') && first.includes('Product reference') && first.includes('Color name');
}

function isPriceCSV(text: string): boolean {
  const first = text.split('\n')[0] || '';
  return first.includes('Price catalog') && first.includes('Model') && first.includes('Retail price');
}

function parsePriceCSV(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const raw = text.trim().replace(/^\uFEFF/, '');
  const lines = raw.split('\n');
  if (lines.length < 2) return map;

  const headers = lines[0].split(';').map(h => h.trim().replace(/^\uFEFF/, ''));
  const iModel = headers.findIndex(h => h === 'Model');
  const iVariant = headers.findIndex(h => h === 'Variant');
  const iRetail = headers.findIndex(h => h.toLowerCase().includes('retail'));
  if (iModel === -1 || iVariant === -1 || iRetail === -1) return map;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim());
    const model = cols[iModel]?.trim();
    const variant = cols[iVariant]?.trim();
    const retailStr = cols[iRetail]?.trim();
    if (!model || !variant || !retailStr) continue;
    const key = `${model}|${variant}`;
    const price = parseEuroPrice(retailStr);
    if (price > 0) {
      map.set(key, price);
      const normKey = `${model}|${variant.replace(/\s+/g, ' ').trim()}`;
      if (normKey !== key) map.set(normKey, price);
    }
  }
  return map;
}

function getRrp(priceMap: Map<string, number> | null, productRef: string, colorName: string): number {
  if (!priceMap) return 0;
  const exact = `${productRef}|${colorName}`;
  const rrp = priceMap.get(exact);
  if (rrp != null) return rrp;
  const normalized = `${productRef}|${colorName.replace(/\s+/g, ' ').trim()}`;
  return priceMap.get(normalized) ?? 0;
}

function parseOrderCSV(text: string): OrderRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(h => h.trim());
  const col = (name: string) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

  // Cozmo order CSV: "Product name" kolom bevat de artikelcode (ABEL264s6), "Product reference" bevat de beschrijving (soft gauze cotton baby shirt)
  const iProductRef = col('Product name');
  const iProductName = col('Product reference');
  const iColorName = col('Color name');
  const iDescription = col('Description');
  const iComposition = col('Composition');
  const iFabric = headers.findIndex(h => h.includes('Fabric') && h.includes('print'));
  const iSizeName = col('Size name');
  const iEAN = col('EAN13');
  const iSku = col('SKU');
  const iQuantity = col('Quantity');
  const iUnitPrice = col('Unit price');

  if (iProductRef === -1) return [];

  const rows: OrderRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(';').map(c => c.trim());
    const productRef = cols[iProductRef]?.trim();
    if (!productRef) continue;

    rows.push({
      productReference: productRef,
      productName: cols[iProductName]?.trim() || '',
      colorName: cols[iColorName]?.trim() || '',
      description: cols[iDescription]?.trim() || '',
      composition: cols[iComposition]?.trim() || '',
      fabricPrint: iFabric !== -1 ? (cols[iFabric]?.trim() || '') : '',
      sizeName: cols[iSizeName]?.trim() || '',
      ean: cols[iEAN]?.trim() || '',
      sku: cols[iSku]?.trim() || '',
      quantity: parseInt(cols[iQuantity]?.trim() || '0', 10) || 0,
      unitPrice: parseEuroPrice(cols[iUnitPrice]?.trim() || '0'),
    });
  }
  return rows;
}

function productKey(ref: string, color: string): string {
  const c = color.trim().replace(/\s+/g, ' ');
  return `${ref}_${c}`;
}

/** Kleur voor weergave in productnaam: alleen het deel vóór het eerste koppelteken (ivory, sand, navy, ...) */
function shortColorForDisplay(colorName: string): string {
  const trimmed = colorName.trim();
  const dash = trimmed.indexOf('-');
  return dash >= 0 ? trimmed.slice(0, dash).trim() : trimmed;
}

function buildEcommerceDescription(description: string, composition: string, fabricPrint: string): string {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (composition) parts.push(`Samenstelling: ${composition}`);
  if (fabricPrint) parts.push(`Stof / print: ${fabricPrint}`);
  return parts.join('\n\n');
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const orderText = files['order_csv'] as string;
  const priceText = files['price_csv'] as string;

  if (priceText) {
    priceMapCache = parsePriceCSV(priceText);
  }

  if (!orderText) return [];

  const orderRows = parseOrderCSV(orderText);
  if (orderRows.length === 0) return [];

  const brand = context.findBrand('cozmo');
  const products = new Map<string, ParsedProduct>();

  for (const row of orderRows) {
    const key = productKey(row.productReference, row.colorName);
    const size = convertSize(row.sizeName);
    const rrp = getRrp(priceMapCache, row.productReference, row.colorName);

    if (!products.has(key)) {
      const ecommerceDescription = buildEcommerceDescription(
        row.description,
        row.composition,
        row.fabricPrint,
      );
      products.set(key, {
        reference: key,
        name: `Cozmo - ${row.productName} - ${shortColorForDisplay(row.colorName)}`,
        originalName: row.productName,
        material: row.composition,
        fabricPrint: row.fabricPrint || undefined,
        color: row.colorName,
        ecommerceDescription: ecommerceDescription || undefined,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(key)!;
    const variant: ProductVariant = {
      size,
      quantity: row.quantity,
      ean: row.ean,
      sku: row.sku || undefined,
      price: row.unitPrice,
      rrp,
    };
    product.variants.push(variant);
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

const cozmo: SupplierPlugin = {
  id: 'cozmo',
  displayName: 'Cozmo',
  brandName: 'Cozmo',

  fileInputs: [
    { id: 'order_csv', label: 'Cozmo Order CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'price_csv', label: 'Aanbevolen verkoopprijzen CSV (optioneel)', accept: '.csv', required: false, type: 'csv' },
  ],

  fileDetection: [
    { fileInputId: 'order_csv', detect: (text) => isOrderCSV(text) },
    { fileInputId: 'price_csv', detect: (text) => isPriceCSV(text) },
  ],

  parse,

  imageMatching: {
    strategy: 'filename-pattern',
    extractReference: (filename: string) => {
      const m = filename.match(/^(.+)_\d+\.(jpg|jpeg|png)$/i);
      return m ? m[1].trim() : null;
    },
  },

  imageUpload: {
    enabled: true,
    instructions: 'Afbeeldingen staan in JPG ALTA (bijv. iCloud: Babette Bart/Cozmo/JPG ALTA). Bestandsnaam: Productref_kleur-stof_1.jpg (bijv. ABEL264s6_ivory-soft gauze cotton_1.jpg). Upload de gewenste JPG’s.',
    exampleFilenames: ['ABEL264s6_ivory-soft gauze cotton_1.jpg', 'CLAY266s6_sand-double faced striped cotton_1.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const m = filename.match(/^(.+)_\d+\.(jpg|jpeg|png)$/i);
      return m ? m[1].trim() : null;
    },
  },
};

export default cozmo;
