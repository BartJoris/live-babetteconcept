import { parseEuroPrice, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import { parseCSV } from '@/lib/import/shared/csv-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function convertSizeToDutch(sizeStr: string): string {
  if (!sizeStr) return sizeStr;
  const normalized = sizeStr.trim();

  // 2y, 3y, 10y -> "X jaar"
  const yMatch = normalized.match(/^(\d+)\s*y$/i);
  if (yMatch) return `${yMatch[1]} jaar`;

  // 3/6m, 6/12m -> second number as "X maand"
  const rangeMonthMatch = normalized.match(/^(\d+)\/(\d+)\s*m$/i);
  if (rangeMonthMatch) return `${parseInt(rangeMonthMatch[2])} maand`;

  // 3m, 6m, 12m -> "X maand"
  const monthMatch = normalized.match(/^(\d+)\s*m$/i);
  if (monthMatch) return `${monthMatch[1]} maand`;

  // 3/4, 5/6 -> second number as "X jaar"
  const rangeMatch = normalized.match(/^(\d+)\/(\d+)$/);
  if (rangeMatch) return `${parseInt(rangeMatch[2])} jaar`;

  // Bare number 2-18 -> "X jaar"
  const numMatch = normalized.match(/^(\d+)$/);
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    if (num >= 2 && num <= 18) return `${num} jaar`;
  }

  return sizeStr;
}

function parseOrderCSV(text: string, context: ParseContext): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const col = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

  const productReferenceIdx = col('Product reference');
  const productNameIdx = col('Product name');
  const colorNameIdx = col('Color name');
  const sizeNameIdx = col('Size name');
  const eanIdx = col('EAN13');
  const skuIdx = col('SKU');
  const quantityIdx = col('Quantity');
  const unitPriceIdx = col('Unit price');
  const compositionIdx = col('Composition');
  const descriptionIdx = col('Description');

  if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || eanIdx === -1) {
    return [];
  }

  const brand = context.findBrand('the new society', 'thenewsociety', 'tns');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const get = (idx: number) => (idx >= 0 ? (values[idx] || '').trim() : '');

    const productReference = get(productReferenceIdx);
    const productName = get(productNameIdx);
    const colorName = get(colorNameIdx);
    const sizeName = get(sizeNameIdx);
    const ean = get(eanIdx);
    const sku = get(skuIdx);
    const quantity = parseInt(get(quantityIdx) || '0') || 0;
    const unitPrice = parseEuroPrice(get(unitPriceIdx) || '0');
    const composition = get(compositionIdx);
    const description = get(descriptionIdx);

    if (!productReference || !productName || !colorName || !sizeName || !ean) continue;

    const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const dutchSize = convertSizeToDutch(sizeName);

    if (!products[productKey]) {
      const formattedName = `The New Society - ${toSentenceCase(productName)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

      products[productKey] = {
        reference: productReference,
        name: formattedName,
        originalName: productName,
        material: composition,
        color: colorName,
        ecommerceDescription: description || formattedName,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
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
      rrp: unitPrice * 2.5,
    });
  }

  return Object.values(products);
}

function parseOrderConfirmationCSV(text: string, context: ParseContext): ParsedProduct[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const line = lines[i].trim();
    if (line && line.includes(';')) {
      const lineUpper = line.toUpperCase();
      if (lineUpper.includes('SRP') && lineUpper.includes('REFERENCIA') && lineUpper.includes('VARIANTE')) {
        headerLineIdx = i;
        break;
      }
    }
  }

  if (headerLineIdx === -1) return [];

  const headers = lines[headerLineIdx].split(';').map(h => h.trim());
  const srpIdx = headers.findIndex(h => h.toUpperCase() === 'SRP');
  const referenciaIdx = headers.findIndex(h => h.toUpperCase() === 'REFERENCIA');
  const varianteIdx = headers.findIndex(h => h.toUpperCase() === 'VARIANTE');
  const unidadIdx = headers.findIndex(h => h.toUpperCase() === 'UNIDAD');
  const cantIdx = headers.findIndex(h => h.toUpperCase() === 'CANT.' || h.toUpperCase() === 'CANT');
  const estiloIdx = headers.findIndex(h => h.toUpperCase() === 'ESTILO');

  if (referenciaIdx === -1 || varianteIdx === -1 || srpIdx === -1 || unidadIdx === -1) return [];

  const brand = context.findBrand('the new society', 'thenewsociety', 'tns');
  const products: Record<string, ParsedProduct> = {};

  let currentProductName = '';
  let currentSizeColumns: { idx: number; size: string }[] = [];

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || (line.startsWith(';') && line.split(';').filter(c => c.trim()).length <= 1)) continue;

    const values = line.split(';').map(v => v.trim());
    const estiloValue = estiloIdx >= 0 ? values[estiloIdx] || '' : '';
    const referenciaValue = referenciaIdx >= 0 ? values[referenciaIdx] || '' : '';

    if (estiloValue && !referenciaValue) {
      currentProductName = estiloValue;
      currentSizeColumns = [];

      for (let j = srpIdx + 1; j < cantIdx; j++) {
        const value = values[j] || '';
        if (!value) continue;
        const valueUpper = value.toUpperCase();
        if (valueUpper === 'TALLAS' || valueUpper === 'TALLA' || valueUpper === 'SIZE' || valueUpper === 'SIZES') continue;

        if (value.match(/^[A-Z]$/i) ||
            value.match(/^\d+[my]$/i) ||
            value.match(/^\d+\/\d+[my]?$/i) ||
            value.match(/^\d+$/)) {
          currentSizeColumns.push({ idx: j, size: value });
        }
      }
      continue;
    }

    if (!referenciaValue || currentSizeColumns.length === 0) continue;

    const productReference = referenciaValue;
    const colorName = varianteIdx >= 0 ? values[varianteIdx] || '' : '';
    const srp = parseEuroPrice(values[srpIdx] || '0');
    const unitPrice = parseEuroPrice(values[unidadIdx] || '0');

    if (!productReference || !colorName || srp === 0) continue;

    const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (!products[productKey]) {
      const formattedName = `The New Society - ${toSentenceCase(currentProductName || productReference)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

      products[productKey] = {
        reference: productReference,
        name: formattedName,
        originalName: currentProductName || productReference,
        material: '',
        color: colorName,
        ecommerceDescription: formattedName,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    for (const sizeCol of currentSizeColumns) {
      const quantity = parseInt(values[sizeCol.idx] || '0');
      if (quantity > 0) {
        products[productKey].variants.push({
          size: convertSizeToDutch(sizeCol.size),
          quantity,
          ean: '',
          sku: '',
          price: unitPrice,
          rrp: srp,
        });
      }
    }
  }

  return Object.values(products);
}

function isOrderCSV(text: string): boolean {
  const upper = text.slice(0, 500).toUpperCase();
  return upper.includes('PRODUCT REFERENCE') && upper.includes('EAN13');
}

function isOrderConfirmationCSV(text: string): boolean {
  const lines = text.trim().split('\n');
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const lineUpper = lines[i].toUpperCase();
    if (lineUpper.includes('SRP') && lineUpper.includes('REFERENCIA') && lineUpper.includes('VARIANTE')) {
      return true;
    }
  }
  return false;
}

function normalizeSizeForMatching(size: string): string {
  if (!size) return '';
  const normalized = size.trim().toLowerCase();
  const jaarMatch = normalized.match(/^(\d+)\s*jaar$/);
  if (jaarMatch) return `${jaarMatch[1]}y`;
  const maandMatch = normalized.match(/^(\d+)\s*maand$/);
  if (maandMatch) return `${maandMatch[1]}m`;
  const sizeMatch = normalized.match(/^([a-z])\s*-\s*\d+$/);
  if (sizeMatch) return sizeMatch[1];
  return normalized.replace(/\s+/g, '');
}

function enrichWithSRP(orderProducts: ParsedProduct[], confirmationProducts: ParsedProduct[]): void {
  for (const orderProduct of orderProducts) {
    const confirmationProduct = confirmationProducts.find(p =>
      p.reference.toLowerCase() === orderProduct.reference.toLowerCase() &&
      p.color.toLowerCase() === orderProduct.color.toLowerCase()
    );

    if (!confirmationProduct) continue;

    const confirmationVariantsBySize = new Map<string, (typeof confirmationProduct.variants)[0]>();
    for (const cv of confirmationProduct.variants) {
      const normalizedSize = normalizeSizeForMatching(cv.size);
      if (!confirmationVariantsBySize.has(normalizedSize)) {
        confirmationVariantsBySize.set(normalizedSize, cv);
      }
    }

    for (const orderVariant of orderProduct.variants) {
      const normalizedOrderSize = normalizeSizeForMatching(orderVariant.size);
      const confirmationVariant = confirmationVariantsBySize.get(normalizedOrderSize);

      if (confirmationVariant) {
        orderVariant.rrp = confirmationVariant.rrp || orderVariant.rrp;
      } else {
        const avgRrp = confirmationProduct.variants.length > 0
          ? confirmationProduct.variants.reduce((sum, v) => sum + v.rrp, 0) / confirmationProduct.variants.length
          : orderVariant.rrp;
        orderVariant.rrp = avgRrp;
      }
    }
  }
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  if (isOrderCSV(text)) {
    const products = parseOrderCSV(text, context);
    products.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });

    const confirmationText = files['confirmation_csv'] as string;
    if (confirmationText) {
      const confirmationProducts = parseOrderConfirmationCSV(confirmationText, context);
      enrichWithSRP(products, confirmationProducts);
    }

    return products;
  }

  if (isOrderConfirmationCSV(text)) {
    const confirmationProducts = parseOrderConfirmationCSV(text, context);
    confirmationProducts.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });

    const orderText = files['order_csv'] as string;
    if (orderText) {
      const orderProducts = parseOrderCSV(orderText, context);
      orderProducts.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
      enrichWithSRP(orderProducts, confirmationProducts);
      return orderProducts;
    }

    return confirmationProducts;
  }

  return [];
}

const thenewsocietyPlugin: SupplierPlugin = {
  id: 'thenewsociety',
  displayName: 'The New Society',
  brandName: 'The New Society',
  fileInputs: [
    { id: 'main_csv', label: 'The New Society CSV (Order of Order Confirmation)', accept: '.csv', required: true, type: 'csv' },
  ],
  fileDetection: [
    {
      fileInputId: 'order_csv',
      detect: (text) => isOrderCSV(text),
    },
    {
      fileInputId: 'confirmation_csv',
      detect: (text) => isOrderConfirmationCSV(text),
      requiresExistingProducts: true,
      orderError: 'Upload eerst het Order CSV bestand (met EAN13)!',
    },
  ],
  parse,

  imageUpload: {
    enabled: true,
    instructions: 'Upload afbeeldingen. Bestandsnamen bevatten referentie en kleur gescheiden door koppeltekens.',
    exampleFilenames: ['s26ahb1p362-pink_lavander_bow-1-3dc260.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.toLowerCase().match(/^([a-z0-9]+)-/);
      return match ? match[1].toUpperCase() : null;
    },
  },
};

export default thenewsocietyPlugin;
