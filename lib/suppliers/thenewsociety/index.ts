import { parseEuroPrice, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
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
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(h => h.trim());

  const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
  const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
  const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
  const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
  const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
  const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
  const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
  const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
  const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');

  if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || eanIdx === -1) {
    return [];
  }

  const brand = context.findBrand('the new society', 'thenewsociety', 'tns');
  const products: Record<string, ParsedProduct> = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';').map(v => v.trim());
    if (values.length < headers.length) continue;

    const productReference = values[productReferenceIdx] || '';
    const productName = values[productNameIdx] || '';
    const colorName = values[colorNameIdx] || '';
    const sizeName = values[sizeNameIdx] || '';
    const ean = values[eanIdx] || '';
    const sku = skuIdx !== -1 ? values[skuIdx] || '' : '';
    const quantity = quantityIdx !== -1 ? parseInt(values[quantityIdx] || '0') : 0;
    const unitPrice = unitPriceIdx !== -1 ? parseEuroPrice(values[unitPriceIdx] || '0') : 0;
    const composition = compositionIdx !== -1 ? values[compositionIdx] || '' : '';
    const description = descriptionIdx !== -1 ? values[descriptionIdx] || '' : '';

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
};

export default thenewsocietyPlugin;
