import { parseCSV, parseEuroPrice, convertSize, determineSizeAttribute, toTitleCase } from '@/lib/import/shared';
import type {
  SupplierPlugin,
  ParsedProduct,
  SupplierFiles,
  ParseContext,
  EnrichmentResult,
} from '@/lib/suppliers/types';
import { buildMipounetEanMap, isMipounetEanCsv } from './ean';
import {
  applyMipounetRrp,
  FALLBACK_MULTIPLIER,
  parseMipounetSrpFromText,
} from './rrp';

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
  return match ? match[1] : colorName.replace(/\s*-\s*(SS|FW|AW)\d+.*$/i, '').trim();
}

function isExportCsv(text: string): boolean {
  const upper = text.slice(0, 500).toUpperCase();
  return upper.includes('PRODUCT REFERENCE') && upper.includes('PRODUCT NAME') && !isMipounetEanCsv(text);
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
    const title = toTitleCase(productName);
    const colorSuffix = color ? ` - ${toTitleCase(color)}` : '';

    if (!products[ref]) {
      products[ref] = {
        reference: ref,
        name: `Mipounet - ${title}${colorSuffix}`,
        originalName: productName,
        material: composition,
        color,
        fabricPrint: fabric,
        csvCategory: category,
        ecommerceDescription: `${title}${colorSuffix}`,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        sizeAttribute: '',
        rrpSource: 'fallback',
      };
    }

    products[ref].variants.push({
      size,
      quantity: qty,
      ean,
      sku: `I26-${ref}-${sizeRaw}`,
      price,
      rrp: Math.round(price * FALLBACK_MULTIPLIER * 100) / 100,
    });
  }

  return Object.values(products);
}

function buildSrpMapFromConfirmationCsv(text: string): Map<string, number> {
  const lines = text.split('\n');
  const srpMap = new Map<string, number>();

  for (const line of lines) {
    const cols = line.split(';');
    if (cols.length < 17) continue;

    const refRaw = cols[2]?.trim();
    const srpRaw = cols[4]?.trim();
    if (!refRaw || !srpRaw) continue;

    const refMatch = refRaw.match(/^(\d+),(\d+)$/);
    if (!refMatch) continue;

    const ref = `${refMatch[1]}.${refMatch[2]}`;
    const srp = parseFloat(srpRaw.replace(',', '.')) || 0;
    if (srp > 0) srpMap.set(ref, srp);
  }

  return srpMap;
}

function collectCsvTexts(files: SupplierFiles): string[] {
  const texts: string[] = [];
  for (const key of ['main_csv', 'ean_csv', 'confirmation_csv'] as const) {
    const value = files[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      texts.push(...value.filter((t): t is string => typeof t === 'string'));
    } else if (typeof value === 'string' && !value.trimStart().startsWith('{')) {
      texts.push(value);
    }
  }
  return texts;
}

function applyEanMap(products: ParsedProduct[], eanMap: Map<string, string>): void {
  for (const product of products) {
    for (const variant of product.variants) {
      const ean = eanMap.get(`${product.reference}|${variant.size}`);
      if (ean) variant.ean = ean;
    }
  }
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const texts = collectCsvTexts(files);

  let exportText: string | null = null;
  let eanText: string | null = null;
  let confirmationText: string | null = null;

  for (const text of texts) {
    if (isMipounetEanCsv(text)) {
      eanText = text;
    } else if (isOrderConfirmationCsv(text)) {
      confirmationText = text;
    } else if (isExportCsv(text)) {
      exportText = text;
    }
  }

  // Also accept dedicated slots when content type detection is ambiguous
  if (!exportText && typeof files['main_csv'] === 'string' && isExportCsv(files['main_csv'])) {
    exportText = files['main_csv'];
  }
  if (!eanText && typeof files['ean_csv'] === 'string' && isMipounetEanCsv(files['ean_csv'])) {
    eanText = files['ean_csv'];
  }

  if (!exportText) return [];

  const products = parseExportCsv(exportText, context);

  if (eanText) {
    applyEanMap(products, buildMipounetEanMap(eanText));
  }

  if (confirmationText) {
    const srpMap = buildSrpMapFromConfirmationCsv(confirmationText);
    const result = applyMipounetRrp(products, srpMap);
    result.products.forEach((product) => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    return result.products;
  }

  // Optional: RRP PDF JSON already in file map (smart-upload)
  const rrpRaw = files['rrp_pdf'];
  if (typeof rrpRaw === 'string' && rrpRaw.trimStart().startsWith('{')) {
    try {
      const pdfData = JSON.parse(rrpRaw) as { priceMap?: Record<string, number>; text?: string };
      let priceMap = new Map<string, number>();
      if (pdfData.priceMap) {
        for (const [ref, rrp] of Object.entries(pdfData.priceMap)) {
          if (typeof rrp === 'number' && rrp > 0) priceMap.set(ref, rrp);
        }
      }
      if (priceMap.size === 0 && typeof pdfData.text === 'string') {
        priceMap = parseMipounetSrpFromText(pdfData.text);
      }
      const result = applyMipounetRrp(products, priceMap);
      result.products.forEach((product) => {
        product.sizeAttribute = determineSizeAttribute(product.variants);
      });
      return result.products;
    } catch {
      /* fall through */
    }
  }

  products.forEach((product) => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return products;
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  _context: ParseContext,
): EnrichmentResult {
  const rawMap = (pdfData.priceMap || {}) as Record<string, number>;
  const priceMap = new Map<string, number>();
  for (const [ref, rrp] of Object.entries(rawMap)) {
    if (typeof rrp === 'number' && rrp > 0) {
      priceMap.set(ref, rrp);
    }
  }

  if (priceMap.size === 0 && typeof pdfData.text === 'string') {
    const fromText = parseMipounetSrpFromText(pdfData.text);
    for (const [ref, rrp] of fromText) {
      priceMap.set(ref, rrp);
    }
  }

  const result = applyMipounetRrp(existingProducts, priceMap);
  return {
    products: result.products,
    message: result.message,
  };
}

const mipounetPlugin: SupplierPlugin = {
  id: 'mipounet',
  displayName: 'Mipounet',
  brandName: 'Mipounet',

  fileInputs: [
    {
      id: 'main_csv',
      label: 'Mipounet Order / Export CSV',
      accept: '.csv',
      required: true,
      type: 'csv',
    },
    {
      id: 'ean_csv',
      label: 'Mipounet EAN CSV (I26 / MV26)',
      accept: '.csv',
      required: false,
      type: 'csv',
    },
    {
      id: 'rrp_pdf',
      label: 'RRP / Order Confirmation PDF (optioneel)',
      accept: '.pdf',
      required: false,
      type: 'pdf',
    },
  ],

  fileDetection: [
    {
      fileInputId: 'ean_csv',
      detect: (text) => isMipounetEanCsv(text),
    },
    {
      fileInputId: 'main_csv',
      detect: (text) => isExportCsv(text) || isOrderConfirmationCsv(text),
    },
  ],

  serverSideFileInputs: ['rrp_pdf'],
  pdfParseEndpoint: '/api/parse-mipounet-pdf',
  processPdfResults,

  parse,

  imageUpload: {
    enabled: true,
    instructions: 'Upload silhouettes (I26.{model}.{fabric}.{color}_FRONT.jpg). LOOKS/Shot_* matchen niet automatisch.',
    exampleFilenames: ['I26.271.JER007.23_FRONT.jpg', 'I26.130.JER005.23_FRONT.jpg'],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: (filename: string) => {
      const clean = filename.replace(/\s+/g, '');
      const base = clean.replace(/\.(jpg|jpeg|png|webp)$/i, '');
      const match = base.match(/^(?:I26|MV26)\.(\d+)\.[A-Z0-9]+\.(\d+)(?:[_.-]|$)/i);
      return match ? `${match[1]}.${match[2]}` : null;
    },
    dedicatedPageUrl: '/mipounet-images-import',
    dedicatedPageLabel: 'Upload Mipounet Afbeeldingen',
  },
};

export default mipounetPlugin;
