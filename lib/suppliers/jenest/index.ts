import { parseEuroPrice, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function convertJenestSize(sizeStr: string): string {
  const normalized = sizeStr.trim().replace(/\s+/g, '').toUpperCase();

  // Age ranges: X-Yy -> X jaar (or Y jaar for exceptions)
  if (normalized.match(/^\d+-\d+Y$/)) {
    const match = normalized.match(/^(\d+)-(\d+)Y$/);
    if (match) {
      const first = parseInt(match[1]);
      const second = parseInt(match[2]);
      if ((first === 7 && second === 8) ||
          (first === 9 && second === 10) ||
          (first === 11 && second === 12)) {
        return `${second} jaar`;
      }
      return `${first} jaar`;
    }
    return sizeStr;
  }

  // Single ages: 2Y -> 2 jaar
  if (normalized.match(/^\d+Y$/)) {
    const match = normalized.match(/^(\d+)Y$/);
    return match ? `${match[1]} jaar` : sizeStr;
  }

  // Month ranges: 0-3M -> 0-3 maand
  if (normalized.match(/^\d+-\d+M$/)) {
    return normalized.replace(/M$/, ' maand');
  }

  // Single months: 3M -> 3 maand
  if (normalized.match(/^\d+M$/)) {
    return normalized.replace(/M$/, ' maand');
  }

  // Sock sizes: SIZE 24-27 -> 24/27
  if (normalized.startsWith('SIZE')) {
    const sizeMatch = normalized.match(/SIZE(\d+)-(\d+)/);
    if (sizeMatch) {
      return `${sizeMatch[1]}/${sizeMatch[2]}`;
    }
    return sizeStr;
  }

  return sizeStr;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(h => h.trim());

  const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
  const itemNumberIdx = headers.findIndex(h => h.toLowerCase() === 'item number');
  const colorIdx = headers.findIndex(h => h.toLowerCase() === 'color');
  const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
  const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
  const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean number');
  const retailPriceIdx = headers.findIndex(h => h.toLowerCase() === 'rec retail price');
  const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'line quantity');
  const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'line unit price');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'product description');
  const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');

  if (itemNumberIdx === -1 || productNameIdx === -1 || sizeIdx === -1) {
    return [];
  }

  const suggestedBrand = context.findBrand('jenest');
  const products: Record<string, ParsedProduct> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(';').map(v => v.trim());

    const productName = values[productNameIdx] || '';
    const itemNumber = values[itemNumberIdx] || '';
    const color = values[colorIdx] || '';
    const size = values[sizeIdx] || '';
    const sku = values[skuIdx] || '';
    const ean = values[eanIdx] || '';
    const retailPriceStr = values[retailPriceIdx] || '0';
    const quantityStr = values[quantityIdx] || '0';
    const unitPriceStr = values[unitPriceIdx] || '0';
    const description = values[descriptionIdx] || '';
    const composition = values[compositionIdx] || '';

    if (!itemNumber || !productName) continue;

    const retailPrice = parseEuroPrice(retailPriceStr);
    const unitPrice = parseEuroPrice(unitPriceStr);
    const quantity = parseInt(quantityStr) || 0;
    const dutchSize = convertJenestSize(size);

    const productKey = `${itemNumber}-${color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (!products[productKey]) {
      const formattedName = `Jenest - ${toSentenceCase(productName)}${color ? ` - ${toSentenceCase(color)}` : ''}`;

      products[productKey] = {
        reference: itemNumber,
        name: formattedName,
        originalName: productName,
        material: composition,
        color,
        ecommerceDescription: description,
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    products[productKey].variants.push({
      size: dutchSize,
      quantity,
      ean,
      sku,
      price: unitPrice,
      rrp: retailPrice,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

const jenestPlugin: SupplierPlugin = {
  id: 'jenest',
  displayName: 'Jenest',
  brandName: 'Jenest',
  fileInputs: [
    { id: 'main_csv', label: 'Jenest CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  parse,
};

export default jenestPlugin;
