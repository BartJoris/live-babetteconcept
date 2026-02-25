import { determineSizeAttribute, toTitleCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

const COLOR_MAP: Record<string, string> = {
  '199': 'Off White',
  '311': 'Green',
  '421': 'Beige',
  '611': 'Red',
  '661': 'Pink',
  '721': 'Orange',
  '991': 'Multi',
  '211': 'Yellow',
};

function getColorName(colorCode: string): string {
  return COLOR_MAP[colorCode] || `Color ${colorCode}`;
}

function parsePackingListCSV(text: string, context: ParseContext, priceMap: Map<string, { wholesale: number; rrp: number }>): ParsedProduct[] {
  const lines = text.trim().split('\n');

  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].toUpperCase();
    if (line.includes('BOX') && line.includes('REFERENCE') && line.includes('DESCRIPTION')) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) return [];

  const headers = lines[headerLineIdx].split(';').map(h => h.trim().toUpperCase());
  const refIdx = headers.findIndex(h => h === 'REFERENCE');
  const descIdx = headers.findIndex(h => h === 'DESCRIPTION');
  const colorIdx = headers.findIndex(h => h === 'COLOR');
  const sizeIdx = headers.findIndex(h => h === 'SIZE');
  const eanIdx = headers.findIndex(h => h === 'EAN');
  const qtyIdx = headers.findIndex(h => h === 'QUANTITY');

  if (refIdx === -1 || descIdx === -1 || sizeIdx === -1 || eanIdx === -1) return [];

  const brand = context.findBrand('bobo', 'choses');
  const products: Record<string, ParsedProduct> = {};

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(';').map(v => v.trim());
    const reference = values[refIdx] || '';
    const description = values[descIdx] || '';
    const colorCode = colorIdx !== -1 ? values[colorIdx] || '' : '';
    const size = values[sizeIdx] || '';
    const ean = values[eanIdx] || '';
    const quantity = qtyIdx !== -1 ? parseInt(values[qtyIdx] || '0', 10) || 1 : 1;

    if (!reference || !description) continue;

    const productKey = `${reference}|${colorCode}`;
    const colorName = getColorName(colorCode);
    const formattedName = `Bobo Choses - ${toTitleCase(description)} - ${colorName}`;

    const priceData = priceMap.get(reference.toUpperCase());
    const wholesalePrice = priceData?.wholesale || 0;
    const rrpPrice = priceData?.rrp || 0;

    let displaySize = size;
    if (size === 'ONE SIZE') displaySize = 'U';

    if (!products[productKey]) {
      const uniqueReference = colorCode ? `${reference}_${colorCode}` : reference;

      products[productKey] = {
        reference: uniqueReference,
        name: formattedName,
        originalName: description,
        productName: reference,
        material: '',
        color: colorName,
        ecommerceDescription: description,
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
      size: displaySize,
      quantity,
      ean,
      sku: reference,
      price: wholesalePrice,
      rrp: rrpPrice,
    });
  }

  const productList = Object.values(products);

  productList.forEach(product => {
    const hasAdultSizes = product.variants.some(v =>
      /^(XXS|XS|S|M|L|XL|XXL)$/i.test(v.size.trim())
    );
    const hasAdultShoeSizes = product.variants.some(v => {
      const num = parseInt(v.size, 10);
      return num >= 35 && num <= 45;
    });

    if (hasAdultSizes || hasAdultShoeSizes) {
      product.sizeAttribute = 'MAAT Volwassenen';
    } else {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    }
  });

  return productList;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const priceMap = new Map<string, { wholesale: number; rrp: number }>();
  return parsePackingListCSV(text, context, priceMap);
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  _context: ParseContext,
): EnrichmentResult {
  const pdfPriceMap = (pdfData.priceMap || {}) as Record<string, { wholesale: number; rrp: number }>;
  const priceMap = new Map<string, { wholesale: number; rrp: number }>();

  for (const [ref, prices] of Object.entries(pdfPriceMap)) {
    priceMap.set(ref, prices);
  }

  if (priceMap.size === 0) {
    return { products: existingProducts, message: 'No prices found in PDF.' };
  }

  if (existingProducts.length === 0) {
    return { products: existingProducts, message: `${priceMap.size} prices loaded from PDF. Upload Packing List CSV to create products.` };
  }

  const updatedProducts = existingProducts.map(product => {
    const baseRef = product.reference.split('_')[0].toUpperCase();
    const priceData = priceMap.get(baseRef) || priceMap.get(product.reference.toUpperCase());
    if (!priceData) return product;

    return {
      ...product,
      variants: product.variants.map(variant => ({
        ...variant,
        price: priceData.wholesale || variant.price,
        rrp: priceData.rrp || variant.rrp,
      })),
    };
  });

  const matchedCount = updatedProducts.filter(p => {
    const baseRef = p.reference.split('_')[0].toUpperCase();
    return priceMap.has(baseRef) || priceMap.has(p.reference.toUpperCase());
  }).length;

  return {
    products: updatedProducts,
    message: `${priceMap.size} prices loaded from PDF. ${matchedCount}/${updatedProducts.length} products matched.`,
  };
}

const bobochosesPlugin: SupplierPlugin = {
  id: 'bobochoses',
  displayName: 'Bobo Choses',
  brandName: 'Bobo Choses',
  fileInputs: [
    { id: 'main_csv', label: 'Bobo Choses Packing List CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'pdf_prices', label: 'Price PDF (optional)', accept: '.pdf', required: false, type: 'pdf' },
  ],
  serverSideFileInputs: ['pdf_prices'],
  pdfParseEndpoint: '/api/parse-bobochoses-pdf',
  processPdfResults,
  parse,

  imageUpload: {
    enabled: true,
    instructions: 'Upload afbeeldingen via de dedicated pagina.',
    exampleFilenames: ['B126AD001_1.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^(B\d+[A-Z]+\d+)/i);
      return match ? match[1] : null;
    },
    dedicatedPageUrl: '/bobochoses-images-import',
    dedicatedPageLabel: 'Upload Bobo Choses Afbeeldingen',
  },
};

export default bobochosesPlugin;
