import { parseCSV, parseEuroPrice, convertSize, determineSizeAttribute, findHeader } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

const KNOWN_SUFFIXES = ['OVERALLS', 'SHORTS', 'SKIRT', 'SWEATSHIRT', 'TSHIRT', 'BAG', 'GIRL', 'BOY', 'BABY', 'LILLA'];

function splitProductName(raw: string): string[] {
  const words: string[] = [];
  let remaining = raw.toUpperCase();

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of KNOWN_SUFFIXES) {
      if (remaining.endsWith(suffix) && remaining.length > suffix.length) {
        words.unshift(suffix.charAt(0) + suffix.slice(1).toLowerCase());
        remaining = remaining.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }

  if (remaining) {
    words.unshift(remaining.charAt(0) + remaining.slice(1).toLowerCase());
  }

  return words;
}

function parseSKU(sku: string): { productNameRaw: string; productNameDisplay: string; size: string } | null {
  if (!sku) return null;

  // Strip season prefix (SS26, AW26, etc.)
  let body = sku.replace(/^[A-Z]{2}\d{2}/i, '');
  // Strip FP suffix
  body = body.replace(/FP$/i, '');

  if (!body) return null;

  // Extract size from end: digits+M, digits+Y, or TU
  const sizeMatch = body.match(/(\d+[MY]|TU)$/i);
  if (!sizeMatch) return null;

  const sizeRaw = sizeMatch[1].toUpperCase();
  const productNameRaw = body.slice(0, -sizeRaw.length);

  if (!productNameRaw) return null;

  const words = splitProductName(productNameRaw);
  const productNameDisplay = words.join(' ');

  return { productNameRaw: productNameRaw.toUpperCase(), productNameDisplay, size: sizeRaw };
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  const { headers, rows } = parseCSV(text, { delimiter: ';' });

  const upperHeaders = headers.map(h => h.toUpperCase());
  const skuIdx = upperHeaders.indexOf('SKU');
  const qtyIdx = upperHeaders.indexOf('QTY');
  const whlPriceIdx = upperHeaders.findIndex(h => h.includes('WHL') || h.includes('WHOLESALE'));
  const retailPriceIdx = upperHeaders.findIndex(h => h.includes('RETAIL'));
  const eanIdx = findHeader(headers, 'EAN CODE', 'EAN');

  if (skuIdx === -1 || eanIdx === -1) {
    return [];
  }

  const brand = context.findBrand('favorite people');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const sku = values[skuIdx] || '';
    const qty = qtyIdx !== -1 ? parseInt(values[qtyIdx] || '0') || 0 : 0;
    const whlPrice = whlPriceIdx !== -1 ? parseEuroPrice(values[whlPriceIdx] || '') : 0;
    const retailPrice = retailPriceIdx !== -1 ? parseEuroPrice(values[retailPriceIdx] || '') : 0;
    const ean = values[eanIdx] || '';

    if (!sku || !ean) continue;

    const parsed = parseSKU(sku);
    if (!parsed) continue;

    const { productNameRaw, productNameDisplay, size: sizeRaw } = parsed;
    const size = sizeRaw === 'TU' ? 'U' : convertSize(sizeRaw);

    const productKey = productNameRaw;
    const formattedName = `Favorite People - ${productNameDisplay}`;

    if (!products[productKey]) {
      products[productKey] = {
        reference: productNameRaw,
        name: formattedName,
        originalName: productNameDisplay,
        productName: sku,
        material: '',
        color: '',
        csvCategory: '',
        ecommerceDescription: productNameDisplay,
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
      quantity: qty,
      ean,
      sku,
      price: whlPrice,
      rrp: retailPrice,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

const favoritePeoplePlugin: SupplierPlugin = {
  id: 'favoritepeople',
  displayName: 'Favorite People',
  brandName: 'Favorite People',
  fileInputs: [
    { id: 'main_csv', label: 'Favorite People CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  parse,
};

export default favoritePeoplePlugin;
