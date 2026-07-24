import { parseCSV, findHeader, parseEuroPrice, determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';
import { extractEmileetidaImageInfo } from '@/lib/suppliers/emileetida/image-filename';
import {
  buildEmileetidaPriceLookup,
  isEmileetidaOrderConfirmationCsv,
  isEmileetidaTarifCsv,
  lookupEmileetidaRrp,
  type EmileetidaPriceLookup,
} from '@/lib/suppliers/emileetida/prices';

/**
 * Emile et Ida size format: 02A -> 2 jaar, 03M -> 3 maand, TU -> U,
 * 06-18M -> 6 - 18 maand, 02A-04A -> 2 - 4 jaar
 */
function convertEmileetidaSize(size: string): string {
  if (!size) return '';
  const upper = size.toUpperCase().trim();

  if (upper === 'TU') return 'U';

  const monthRange = upper.match(/^(\d+)-(\d+)M$/);
  if (monthRange) return `${parseInt(monthRange[1])} - ${parseInt(monthRange[2])} maand`;

  const yearRange = upper.match(/^(\d+)A-(\d+)A$/);
  if (yearRange) return `${parseInt(yearRange[1])} - ${parseInt(yearRange[2])} jaar`;

  const singleYear = upper.match(/^(\d+)A$/);
  if (singleYear) return `${parseInt(singleYear[1])} jaar`;

  const singleMonth = upper.match(/^(\d+)M$/);
  if (singleMonth) return `${parseInt(singleMonth[1])} maand`;

  return size;
}

function parseEmileetidaOrder(
  text: string,
  priceLookup: EmileetidaPriceLookup,
  context: ParseContext,
): ParsedProduct[] {
  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return [];

  const productNameIdx = findHeader(headers, 'product name');
  const productRefIdx = findHeader(headers, 'product reference');
  const colorNameIdx = findHeader(headers, 'color name');
  const compositionIdx = findHeader(headers, 'composition');
  const fabricPrintIdx = findHeader(headers, 'fabric / print');
  const categoryIdx = findHeader(headers, 'category');
  const sizeNameIdx = findHeader(headers, 'size name');
  const ean13Idx = findHeader(headers, 'ean13');
  const skuIdx = findHeader(headers, 'sku');
  const quantityIdx = findHeader(headers, 'quantity');
  const unitPriceIdx = findHeader(headers, 'unit price');

  if (productNameIdx === -1 || ean13Idx === -1 || productRefIdx === -1) return [];

  const brand = context.findBrand('emile', 'ida');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const productName = values[productNameIdx]?.trim() || '';
    const productRef = values[productRefIdx]?.trim() || '';
    const colorName = colorNameIdx !== -1 ? values[colorNameIdx]?.trim() || '' : '';
    const composition = compositionIdx !== -1 ? values[compositionIdx]?.trim() || '' : '';
    const fabricPrint = fabricPrintIdx !== -1 ? values[fabricPrintIdx]?.trim() || '' : '';
    const csvCategory = categoryIdx !== -1 ? values[categoryIdx]?.trim() || '' : '';
    const sizeName = sizeNameIdx !== -1 ? values[sizeNameIdx]?.trim() || '' : '';
    const ean13 = values[ean13Idx]?.trim() || '';
    const sku = skuIdx !== -1 ? values[skuIdx]?.trim() || '' : '';
    const quantity = quantityIdx !== -1 ? parseInt(values[quantityIdx]?.trim() || '0') || 0 : 0;
    const unitPrice = unitPriceIdx !== -1 ? parseEuroPrice(values[unitPriceIdx]?.trim() || '0') : 0;

    if (!productName || !ean13) continue;

    const rrp = lookupEmileetidaRrp(
      priceLookup,
      ean13,
      productRef,
      colorName,
      unitPrice,
    );
    const productKey = `${productRef}|${colorName}`;
    const displaySize = convertEmileetidaSize(sizeName);

    if (!products[productKey]) {
      const uniqueReference = colorName
        ? `${productRef}_${colorName.toUpperCase().replace(/\s+/g, '')}`
        : productRef;

      const formattedName = `Emile & Ida - ${toSentenceCase(productName)} - ${toSentenceCase(colorName)} (${productRef.toLowerCase()})`;
      const ecommerceRef = fabricPrint ? `${productName} ${fabricPrint}` : productName;

      products[productKey] = {
        reference: uniqueReference,
        name: formattedName,
        originalName: productName,
        productName: productRef,
        material: composition,
        color: colorName,
        fabricPrint,
        csvCategory,
        ecommerceDescription: ecommerceRef,
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
      ean: ean13,
      sku: sku || undefined,
      price: unitPrice,
      rrp,
    });
  }

  const productList = Object.values(products);
  productList.forEach((product) => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });
  return productList;
}

const emileetidaPlugin: SupplierPlugin = {
  id: 'emileetida',
  displayName: 'Emile et Ida',
  brandName: 'Emile & Ida',

  fileInputs: [
    { id: 'main_csv', label: 'Order CSV', accept: '.csv', required: true, type: 'csv' },
    {
      id: 'tarif_csv',
      label: 'RRP / SRP CSV (TARIF of orderbevestiging)',
      accept: '.csv',
      required: false,
      type: 'csv',
    },
  ],

  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text: string) => {
        const firstLine = text.split('\n')[0]?.toLowerCase() || '';
        return firstLine.includes('product name') && firstLine.includes('ean13');
      },
    },
    {
      fileInputId: 'tarif_csv',
      detect: (text: string) =>
        isEmileetidaTarifCsv(text) || isEmileetidaOrderConfirmationCsv(text),
    },
  ],

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const tarifText = (files['tarif_csv'] as string) || '';
    const priceLookup = buildEmileetidaPriceLookup(tarifText);

    const orderText = files['main_csv'] as string;
    if (!orderText) return [];

    return parseEmileetidaOrder(orderText, priceLookup, context);
  },

  imageUpload: {
    enabled: true,
    instructions:
      'Upload product afbeeldingen via de dedicated pagina. AW26: IDA-REF-kleur-01.jpg of AE119-blush-01.jpg',
    exampleFilenames: [
      'IDA-EDGAR-farine-01.jpg',
      'AE119-BB-blush-01.jpg',
      'EMILE IDA E26 AD019 AD009.jpg',
    ],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const info = extractEmileetidaImageInfo(filename);
      return info.ref ? info.ref.toLowerCase() : null;
    },
    dedicatedPageUrl: '/emileetida-images-import',
    dedicatedPageLabel: 'Upload Emile et Ida Afbeeldingen',
  },
};

export default emileetidaPlugin;
