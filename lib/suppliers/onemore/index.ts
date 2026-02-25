import { parseEuroPrice, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function convertOneMoreSize(sizeStr: string): string {
  if (!sizeStr) return sizeStr;
  const normalized = sizeStr.trim().toUpperCase();

  // T sizes (T0, T1, T2, T3, T4) - keep as-is
  if (normalized.match(/^T\d+$/)) {
    return sizeStr;
  }

  // Month sizes: 1m, 3m, 6m, etc. - also handles >= 12 months to years
  if (normalized.match(/^\d+M$/)) {
    const months = parseInt(normalized.replace(/M$/, ''));
    if (months >= 12) {
      const years = Math.floor(months / 12);
      return `${years} jaar`;
    }
    return `${months} maand`;
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
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
  const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
  const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
  const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
  const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
  const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
  const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
  const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');

  if (productReferenceIdx === -1 || descriptionIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || eanIdx === -1) {
    return [];
  }

  const suggestedBrand = context.findBrand('one more', '1+ in the family', 'onemore');
  const products: Record<string, ParsedProduct> = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map(v => v.trim());

    if (values.length < headers.length) continue;

    const productReference = values[productReferenceIdx] || '';
    const productName = productNameIdx >= 0 ? (values[productNameIdx] || '') : '';
    const description = values[descriptionIdx] || '';
    const colorName = values[colorNameIdx] || '';
    const sizeName = values[sizeNameIdx] || '';
    const ean = values[eanIdx] || '';
    const sku = values[skuIdx] || '';
    const quantity = parseInt(values[quantityIdx] || '0');
    const unitPrice = parseEuroPrice(values[unitPriceIdx] || '0');
    const composition = values[compositionIdx] || '';

    if (!productReference || !description || !colorName || !sizeName || !ean) continue;

    const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (!products[productKey]) {
      const formattedName = `1+ in the family - ${toSentenceCase(description)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;
      const normalizedReference = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      products[productKey] = {
        reference: normalizedReference,
        name: formattedName,
        originalName: description,
        material: composition,
        color: colorName,
        ecommerceDescription: formattedName,
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        productName,
      };
    }

    const dutchSize = convertOneMoreSize(sizeName);

    products[productKey].variants.push({
      size: dutchSize,
      quantity,
      ean,
      sku,
      price: unitPrice,
      rrp: unitPrice * 2.5,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

const onemorePlugin: SupplierPlugin = {
  id: 'onemore',
  displayName: '1+ in the family',
  brandName: '1+ in the family',
  fileInputs: [
    { id: 'main_csv', label: '1+ in the family CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  parse,

  imageUpload: {
    enabled: true,
    instructions: 'Upload product afbeeldingen via de dedicated pagina.',
    exampleFilenames: [],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: () => null,
    dedicatedPageUrl: '/onemore-images-import',
    dedicatedPageLabel: 'Upload 1+ in the family Afbeeldingen',
  },
};

export default onemorePlugin;
