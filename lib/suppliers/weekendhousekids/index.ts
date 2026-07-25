import { parseEuroPrice, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type {
  SupplierPlugin,
  ParsedProduct,
  SupplierFiles,
  ParseContext,
  EnrichmentResult,
} from '@/lib/suppliers/types';
import {
  applyWeekendHouseKidsRrp,
  FALLBACK_MULTIPLIER,
  parseWeekendHouseKidsSrpFromText,
} from './rrp';

function convertWeekendHouseKidsSize(sizeStr: string): string {
  if (!sizeStr) return sizeStr;
  const normalized = sizeStr.trim();

  // Month ranges: 3/6m -> 6 maand, 6/12m -> 12 maand, 12/18m -> 18 maand, 18/24m -> 24 maand
  if (normalized.match(/^\d+\/\d+\s*m$/i)) {
    const match = normalized.match(/^(\d+)\/(\d+)\s*m$/i);
    if (match) {
      return `${parseInt(match[2])} maand`;
    }
  }

  // Single month: 6m -> 6 maand
  if (normalized.match(/^\d+\s*m$/i)) {
    const match = normalized.match(/^(\d+)\s*m$/i);
    if (match) {
      return `${match[1]} maand`;
    }
  }

  // Year ranges: 3/4 -> 4 jaar, 5/6 -> 6 jaar, 7/8 -> 8 jaar, etc.
  if (normalized.match(/^\d+\/\d+$/)) {
    const match = normalized.match(/^(\d+)\/(\d+)$/);
    if (match) {
      return `${parseInt(match[2])} jaar`;
    }
  }

  // Single year: 2 -> 2 jaar (small numbers likely years)
  if (normalized.match(/^\d+$/)) {
    const num = parseInt(normalized);
    if (num >= 2 && num <= 14) {
      return `${num} jaar`;
    }
  }

  return sizeStr;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(h => h.trim());

  const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
  const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
  const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
  const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
  const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
  const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
  const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
  const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');

  if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1) {
    return [];
  }

  const suggestedBrand = context.findBrand('weekend house kids', 'weekendhousekids', 'whk');
  const products: Record<string, ParsedProduct> = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map(v => v.trim());

    if (values.length < headers.length) continue;

    const productReference = values[productReferenceIdx] || '';
    const productName = values[productNameIdx] || '';
    const colorName = values[colorNameIdx] || '';
    const sizeName = values[sizeNameIdx] || '';
    const ean = eanIdx !== -1 ? values[eanIdx] || '' : '';
    const quantity = parseInt(values[quantityIdx] || '0');
    const unitPrice = parseEuroPrice(values[unitPriceIdx] || '0');
    const composition = values[compositionIdx] || '';
    const description = values[descriptionIdx] || '';

    // EAN may be empty — user fills later or leaves blank
    if (!productReference || !productName || !colorName || !sizeName) continue;

    const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (!products[productKey]) {
      const formattedName = `Weekend House Kids - ${toSentenceCase(productName)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

      products[productKey] = {
        reference: productReference,
        name: formattedName,
        originalName: productName,
        material: composition,
        color: colorName,
        ecommerceDescription: description || formattedName,
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        rrpSource: 'fallback',
      };
    }

    const dutchSize = convertWeekendHouseKidsSize(sizeName);

    products[productKey].variants.push({
      size: dutchSize,
      quantity,
      ean,
      price: unitPrice,
      rrp: Math.round(unitPrice * FALLBACK_MULTIPLIER * 100) / 100,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
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
      priceMap.set(ref.toUpperCase(), rrp);
    }
  }

  // Also accept pre-parsed text if API returns it (tests / alternate path)
  if (priceMap.size === 0 && typeof pdfData.text === 'string') {
    const fromText = parseWeekendHouseKidsSrpFromText(pdfData.text);
    for (const [ref, rrp] of fromText) {
      priceMap.set(ref, rrp);
    }
  }

  const result = applyWeekendHouseKidsRrp(existingProducts, priceMap);
  return {
    products: result.products,
    message: result.message,
  };
}

const weekendHouseKidsPlugin: SupplierPlugin = {
  id: 'weekendhousekids',
  displayName: 'Weekend House Kids',
  brandName: 'Weekend House Kids',
  fileInputs: [
    { id: 'main_csv', label: 'Weekend House Kids CSV', accept: '.csv', required: true, type: 'csv' },
    {
      id: 'rrp_pdf',
      label: 'RRP / Order Confirmation PDF (optioneel - verkoopprijs)',
      accept: '.pdf',
      required: false,
      type: 'pdf',
    },
  ],
  parse,
  serverSideFileInputs: ['rrp_pdf'],
  pdfParseEndpoint: '/api/parse-weekendhousekids-pdf',
  processPdfResults,

  imageUpload: {
    enabled: true,
    instructions: 'Upload product afbeeldingen via de dedicated pagina.',
    exampleFilenames: [],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^(\d+)[-_]/);
      return match ? match[1] : null;
    },
    dedicatedPageUrl: '/weekendhousekids-images-import',
    dedicatedPageLabel: 'Upload Weekend House Kids Afbeeldingen',
  },
};

export default weekendHouseKidsPlugin;
