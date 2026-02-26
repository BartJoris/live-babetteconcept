import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { mapSizeToOdooFormat, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

interface OrderLine {
  productName: string;
  productReference: string;
  colorName: string;
  description: string;
  composition: string;
  sizeFamilyName: string;
  sizeName: string;
  ean: string;
  quantity: number;
  unitPrice: number;
  collection: string;
}

let rrpCache: Map<string, number> | null = null;
let orderLinesCache: OrderLine[] | null = null;
let lastContext: ParseContext | null = null;

function isOrderCSV(text: string): boolean {
  const firstLine = text.split('\n')[0] || '';
  return firstLine.includes('Order id') && firstLine.includes('Product name') && firstLine.includes('EAN13');
}

function isRrpCSV(text: string): boolean {
  return text.includes('STYLE') && text.includes('REFERENCE') && text.includes('SRP');
}

function parseRrpCSV(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = text.split('\n');

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('STYLE') && lines[i].includes('REFERENCE') && lines[i].includes('SRP')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return map;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const reference = cols[2]?.trim();
    const srpStr = cols[4]?.trim();

    if (!reference || !srpStr) continue;
    if (reference.includes('%') || reference.startsWith('Origin:')) continue;
    if (!/^[A-Z]/i.test(reference)) continue;

    const price = parseEuroPrice(srpStr);
    if (price > 0) {
      map.set(reference.toUpperCase(), price);
    }
  }

  return map;
}

function convertAmvSize(size: string): string {
  if (!size) return size;
  const s = size.trim();

  if (/^(XXS|XS|S|M|L|XL|XXL)$/i.test(s)) {
    return mapSizeToOdooFormat(s);
  }

  if (/^\d{1,2}$/.test(s)) {
    const num = parseInt(s);
    if (num >= 1 && num <= 16) {
      return `${num} jaar`;
    }
  }

  return s;
}

function parseOrderCSV(text: string): OrderLine[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(h => h.trim());
  const col = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

  const iProductName = col('Product name');
  const iProductRef = col('Product reference');
  const iColorName = col('Color name');
  const iDescription = col('Description');
  const iComposition = col('Composition');
  const iSizeFamilyName = col('Size family name');
  const iSizeName = col('Size name');
  const iEAN = col('EAN13');
  const iQuantity = col('Quantity');
  const iUnitPrice = col('Unit price');
  const iCollection = col('Collection');

  if (iProductRef === -1 || iEAN === -1) return [];

  const result: OrderLine[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const productRef = cols[iProductRef]?.trim();
    if (!productRef) continue;

    result.push({
      productName: cols[iProductName]?.trim() || '',
      productReference: productRef,
      colorName: cols[iColorName]?.trim() || '',
      description: cols[iDescription]?.trim() || '',
      composition: cols[iComposition]?.trim() || '',
      sizeFamilyName: iSizeFamilyName !== -1 ? (cols[iSizeFamilyName]?.trim() || '') : '',
      sizeName: iSizeName !== -1 ? (cols[iSizeName]?.trim() || '') : '',
      ean: cols[iEAN]?.trim() || '',
      quantity: parseInt(cols[iQuantity]?.trim() || '0') || 0,
      unitPrice: iUnitPrice !== -1 ? parseEuroPrice(cols[iUnitPrice]?.trim() || '0') : 0,
      collection: iCollection !== -1 ? (cols[iCollection]?.trim() || '') : '',
    });
  }

  return result;
}

function buildProducts(
  orderLines: OrderLine[],
  rrpMap: Map<string, number> | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('american', 'vintage');
  const products = new Map<string, ParsedProduct>();

  for (const line of orderLines) {
    const productKey = line.productReference.toUpperCase();
    const size = convertAmvSize(line.sizeName);
    const rrp = rrpMap?.get(productKey) || 0;

    if (!products.has(productKey)) {
      const colorFormatted = toSentenceCase(line.colorName);
      const nameFormatted = toSentenceCase(line.productName);

      products.set(productKey, {
        reference: line.productReference,
        name: `American Vintage - ${nameFormatted} - ${colorFormatted}`,
        originalName: line.productName,
        productName: line.productName,
        material: line.composition,
        color: line.colorName,
        ecommerceDescription: toSentenceCase(line.description),
        csvCategory: line.description,
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(productKey)!;
    product.variants.push({
      size,
      ean: line.ean,
      sku: line.productReference,
      quantity: line.quantity,
      price: line.unitPrice,
      rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const orderText = files['order_csv'] as string;
  const rrpText = files['rrp_csv'] as string;

  if (rrpText) {
    rrpCache = parseRrpCSV(rrpText);
  }

  if (orderText) {
    orderLinesCache = parseOrderCSV(orderText);
    lastContext = context;
  }

  if (orderLinesCache && orderLinesCache.length > 0) {
    const products = buildProducts(orderLinesCache, rrpCache, lastContext || context);

    const enrichedCount = rrpCache ? products.filter(p => p.variants.some(v => v.rrp > 0)).length : 0;
    if (rrpCache && enrichedCount > 0) {
      console.log(`American Vintage: ${products.length} producten, ${enrichedCount} met verkoopprijs uit prijslijst.`);
    }

    return products;
  }

  return [];
}

const americanVintagePlugin: SupplierPlugin = {
  id: 'americanvintage',
  displayName: 'American Vintage',
  brandName: 'American Vintage',
  fileInputs: [
    { id: 'order_csv', label: 'American Vintage Order CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'rrp_csv', label: 'Prijslijst CSV (optioneel - verkoopprijs)', accept: '.csv', required: false, type: 'csv' },
  ],
  fileDetection: [
    {
      fileInputId: 'order_csv',
      detect: (text) => isOrderCSV(text),
    },
    {
      fileInputId: 'rrp_csv',
      detect: (text) => isRrpCSV(text),
    },
  ],
  parse,
};

export default americanVintagePlugin;
