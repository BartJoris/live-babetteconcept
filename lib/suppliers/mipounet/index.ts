import { parseCSV, parseEuroPrice, convertSize, determineSizeAttribute, toTitleCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function convertMipounetSize(sizeName: string): string {
  if (!sizeName || sizeName === '0') return 'U';
  // "S (2Y-6Y)" -> "S", "M (8Y-10Y)" -> "M", "L (12Y-16Y)" -> "L"
  const letterMatch = sizeName.match(/^([SML])\s*\(/);
  if (letterMatch) return letterMatch[1];
  return convertSize(sizeName);
}

function extractColor(colorName: string): string {
  // "COTTON TWILL (PINK) - SS26" -> "PINK"
  const match = colorName.match(/\(([^)]+)\)/);
  return match ? match[1] : colorName.replace(/\s*-\s*SS\d+.*$/i, '').trim();
}

function isExportCsv(text: string): boolean {
  const upper = text.slice(0, 500).toUpperCase();
  return upper.includes('PRODUCT REFERENCE') && upper.includes('PRODUCT NAME');
}

function isEanCsv(text: string): boolean {
  const upper = text.slice(0, 500).toUpperCase();
  return upper.includes('SKU') && upper.includes('EAN') && upper.includes('MV26');
}

function isOrderConfirmationCsv(text: string): boolean {
  const lines = text.split('\n').slice(0, 5);
  for (const line of lines) {
    const cols = line.split(';');
    if (cols.length >= 17) {
      const refRaw = cols[2]?.trim();
      if (refRaw && /^\d+,\d+$/.test(refRaw)) return true;
    }
  }
  return false;
}

function parseExportCsv(text: string, context: ParseContext): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, { delimiter: ';' });

  const refIdx = headers.findIndex(h => h.toUpperCase() === 'PRODUCT REFERENCE');
  const nameIdx = headers.findIndex(h => h.toUpperCase() === 'PRODUCT NAME');
  const colorIdx = headers.findIndex(h => h.toUpperCase() === 'COLOR NAME');
  const compositionIdx = headers.findIndex(h => h.toUpperCase() === 'COMPOSITION');
  const fabricIdx = headers.findIndex(h => h.toUpperCase() === 'FABRIC / PRINT');
  const categoryIdx = headers.findIndex(h => h.toUpperCase() === 'CATEGORY');
  const sizeNameIdx = headers.findIndex(h => h.toUpperCase() === 'SIZE NAME');
  const qtyIdx = headers.findIndex(h => h.toUpperCase() === 'QUANTITY');
  const priceIdx = headers.findIndex(h => h.toUpperCase() === 'UNIT PRICE');
  const eanIdx = headers.findIndex(h => h.toUpperCase() === 'EAN13');

  if (refIdx === -1 || nameIdx === -1) return [];

  const brand = context.findBrand('mipounet');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const ref = values[refIdx] || '';
    const productName = values[nameIdx] || '';
    const colorName = colorIdx !== -1 ? values[colorIdx] || '' : '';
    const composition = compositionIdx !== -1 ? values[compositionIdx] || '' : '';
    const fabric = fabricIdx !== -1 ? values[fabricIdx] || '' : '';
    const category = categoryIdx !== -1 ? values[categoryIdx] || '' : '';
    const sizeRaw = sizeNameIdx !== -1 ? values[sizeNameIdx] || '' : '';
    const qty = qtyIdx !== -1 ? parseInt(values[qtyIdx] || '0') || 0 : 0;
    const price = priceIdx !== -1 ? parseEuroPrice(values[priceIdx] || '0') : 0;
    const ean = eanIdx !== -1 ? values[eanIdx] || '' : '';

    if (!ref || !productName) continue;

    const color = extractColor(colorName);
    const size = convertMipounetSize(sizeRaw);

    if (!products[ref]) {
      products[ref] = {
        reference: ref,
        name: `Mipounet - ${toTitleCase(productName)}`,
        originalName: productName,
        material: composition,
        color,
        fabricPrint: fabric,
        csvCategory: category,
        ecommerceDescription: `${toTitleCase(productName)} - ${color}`,
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

    products[ref].variants.push({
      size,
      quantity: qty,
      ean,
      sku: `MV-${ref}-${sizeRaw}`,
      price,
      rrp: 0,
    });
  }

  return Object.values(products);
}

function buildEanMap(text: string): Map<string, string> {
  const lines = text.trim().split('\n');
  const eanMap = new Map<string, string>();

  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].toUpperCase().includes('SKU') && lines[i].toUpperCase().includes('EAN')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return eanMap;

  const headers = lines[headerIdx].split(';').map(h => h.trim().toUpperCase());
  const skuIdx = headers.findIndex(h => h === 'SKU');
  const eanIdx = headers.findIndex(h => h.includes('EAN'));
  if (skuIdx === -1 || eanIdx === -1) return eanMap;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';').map(c => c.trim());
    const sku = cols[skuIdx] || '';
    const ean = cols[eanIdx] || '';
    if (!sku || !ean) continue;

    // SKU format: MV26.{model}.{fabric}.{color}.{sizeCode}
    const parts = sku.split('.');
    if (parts.length < 5 || parts[0] !== 'MV26') continue;

    const model = parts[1];
    const color = parts[3];
    const sizeCode = parts.slice(4).join('.');
    const ref = `${model}.${color}`;

    let convertedSize: string;
    if (/^[SML]$/i.test(sizeCode)) {
      convertedSize = sizeCode.toUpperCase();
    } else {
      convertedSize = convertSize(sizeCode);
    }

    eanMap.set(`${ref}|${convertedSize}`, ean);
  }

  return eanMap;
}

function buildSrpMap(text: string): Map<string, number> {
  const lines = text.split('\n');
  const srpMap = new Map<string, number>();

  for (const line of lines) {
    const cols = line.split(';');
    if (cols.length < 17) continue;

    const refRaw = cols[2]?.trim();
    const srpRaw = cols[4]?.trim();
    if (!refRaw || !srpRaw) continue;

    // "1310,02" -> "1310.02"
    const refMatch = refRaw.match(/^(\d+),(\d+)$/);
    if (!refMatch) continue;

    const ref = `${refMatch[1]}.${refMatch[2]}`;
    const srp = parseFloat(srpRaw.replace(',', '.')) || 0;
    if (srp > 0) srpMap.set(ref, srp);
  }

  return srpMap;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const mainCsv = files['main_csv'];
  if (!mainCsv) return [];

  const texts = Array.isArray(mainCsv) ? mainCsv : [mainCsv];

  let exportText: string | null = null;
  let eanText: string | null = null;
  let confirmationText: string | null = null;

  for (const text of texts) {
    if (isEanCsv(text)) {
      eanText = text;
    } else if (isOrderConfirmationCsv(text)) {
      confirmationText = text;
    } else if (isExportCsv(text)) {
      exportText = text;
    }
  }

  if (!exportText) return [];

  const products = parseExportCsv(exportText, context);

  if (eanText) {
    const eanMap = buildEanMap(eanText);
    for (const product of products) {
      for (const variant of product.variants) {
        const key = `${product.reference}|${variant.size}`;
        const ean = eanMap.get(key);
        if (ean) variant.ean = ean;
      }
    }
  }

  if (confirmationText) {
    const srpMap = buildSrpMap(confirmationText);
    for (const product of products) {
      const srp = srpMap.get(product.reference);
      if (srp && srp > 0) {
        for (const variant of product.variants) {
          variant.rrp = srp;
        }
      }
    }
  }

  products.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return products;
}

const mipounetPlugin: SupplierPlugin = {
  id: 'mipounet',
  displayName: 'Mipounet',
  brandName: 'Mipounet',

  fileInputs: [
    { id: 'main_csv', label: 'Mipounet CSV (Export / EAN / Order Confirmation)', accept: '.csv', required: true, multiple: true, type: 'csv' },
  ],

  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) => isExportCsv(text) || isEanCsv(text) || isOrderConfirmationCsv(text),
    },
  ],

  parse,
};

export default mipounetPlugin;
