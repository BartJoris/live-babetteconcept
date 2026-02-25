import { parseEuroPrice, convertSize, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, ProductVariant, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function parseOrderSheet(text: string, context: ParseContext): ParsedProduct[] {
  const lines = text.split(/\r?\n/);
  const products: Record<string, ParsedProduct> = {};
  const brand = context.findBrand('petit blush', 'petitblush');

  let currentSizeHeaders: string[] = [];

  for (let i = 9; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim());
    const sku = cols[0] || '';
    const style = cols[1] || '';
    const color = cols[2] || '';
    const material = cols[3] || '';

    if (!sku && style && /^[A-Z\s]+$/.test(style)) {
      currentSizeHeaders = cols.slice(4, 13).filter(Boolean);
      continue;
    }

    if (!/^SS\d+-\d+$/.test(sku)) continue;

    const totalItems = parseInt(cols[13] || '0');
    if (totalItems === 0) continue;

    const wsp = parseEuroPrice(cols[14] || '');
    const rrp = parseEuroPrice(cols[15] || '');

    const variants: ProductVariant[] = [];
    for (let s = 0; s < currentSizeHeaders.length; s++) {
      const qty = parseInt(cols[4 + s] || '0');
      if (qty > 0) {
        variants.push({
          size: convertSize(currentSizeHeaders[s]),
          quantity: qty,
          ean: '',
          price: wsp,
          rrp,
        });
      }
    }

    if (variants.length === 0) continue;

    const formattedName = `Petit Blush - ${toSentenceCase(style.trim())} - ${toSentenceCase(color.trim())}`;

    products[sku] = {
      reference: sku,
      name: formattedName,
      originalName: style.trim(),
      material,
      color: color.trim(),
      ecommerceDescription: material,
      variants,
      suggestedBrand: brand?.name,
      selectedBrand: brand,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
    };
  }

  return Object.values(products);
}

function parseEanList(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const eanMap = new Map<string, string>();

  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (lines[i].includes('Style') && lines[i].includes('EAN Code')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return eanMap;

  const headers = lines[headerIdx].split(',').map(h => h.trim());
  const skuIdx = headers.findIndex(h => h === 'SKU' || h.startsWith('SKU'));
  const eanIdx = headers.findIndex(h => h.includes('EAN'));
  const sizeIdx = headers.findIndex(h => h === 'Size');

  if (skuIdx === -1 || eanIdx === -1) return eanMap;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const fullSku = cols[skuIdx] || '';
    const ean = cols[eanIdx] || '';
    const rawSize = cols[sizeIdx] || '';

    if (!fullSku || !ean || !/^SS\d+-/.test(fullSku)) continue;

    const baseSku = fullSku.replace(/-[^-]+$/, '');
    const convertedSize = convertSize(rawSize.replace(/^1YY$/, '1Y'));
    eanMap.set(`${baseSku}-${convertedSize}`, ean);
  }

  return eanMap;
}

function isOrderSheet(text: string): boolean {
  const firstLines = text.split(/\r?\n/).slice(0, 15).join('\n');
  return firstLines.includes(';') && /SS\d+-\d+/.test(text.slice(0, 3000));
}

function isEanList(text: string): boolean {
  const firstLines = text.split(/\r?\n/).slice(0, 20).join('\n');
  return firstLines.includes('Style') && firstLines.includes('EAN Code');
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const mainCsv = files['main_csv'];
  if (!mainCsv) return [];

  const texts = Array.isArray(mainCsv) ? mainCsv : [mainCsv];

  let orderText: string | null = null;
  let eanText: string | null = null;

  for (const text of texts) {
    if (isEanList(text)) {
      eanText = text;
    } else if (isOrderSheet(text)) {
      orderText = text;
    }
  }

  if (!orderText) return [];

  const products = parseOrderSheet(orderText, context);

  if (eanText) {
    const eanMap = parseEanList(eanText);
    for (const product of products) {
      for (const variant of product.variants) {
        const eanKey = `${product.reference}-${variant.size}`;
        const ean = eanMap.get(eanKey);
        if (ean) variant.ean = ean;
      }
    }
  }

  products.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return products;
}

const petitblushPlugin: SupplierPlugin = {
  id: 'petitblush',
  displayName: 'Petit Blush',
  brandName: 'Petit Blush',

  fileInputs: [
    { id: 'main_csv', label: 'Petit Blush CSV (Order Sheet / EAN List)', accept: '.csv', required: true, multiple: true, type: 'csv' },
  ],

  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) => isOrderSheet(text) || isEanList(text),
    },
  ],

  parse,
};

export default petitblushPlugin;
