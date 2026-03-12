import { parseCSV, parseEuroPrice, convertSize, toSentenceCase, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  const { headers, rows } = parseCSV(text, { delimiter: ';' });

  const idIdx = headers.findIndex(h => h.toLowerCase() === 'id');
  const artNoIdx = headers.findIndex(h => h.toLowerCase() === 'art. no.');
  const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
  const variantNameIdx = headers.findIndex(h => h.toLowerCase() === 'variant name');
  const variantNoIdx = headers.findIndex(h => h.toLowerCase() === 'variant no.');
  const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
  const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean');
  const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
  const wholesalePriceIdx = headers.findIndex(h => h.toLowerCase() === 'wholesale price - eur');
  const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
  const rrpIdx = headers.findIndex(h => h.toLowerCase() === 'rrp - eur');
  const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
  const shortDescIdx = headers.findIndex(h => h.toLowerCase() === 'short description');

  if (eanIdx === -1 || productNameIdx === -1) {
    return [];
  }

  const isSimplifiedFormat = artNoIdx === -1;
  const brand = context.findBrand('mini rodini');
  const products: Record<string, ParsedProduct> = {};

  for (const values of rows) {
    const id = idIdx !== -1 ? values[idIdx] || '' : '';
    const artNo = artNoIdx !== -1 ? values[artNoIdx] || '' : '';
    const productName = values[productNameIdx] || '';
    const variantName = variantNameIdx !== -1 ? values[variantNameIdx] || '' : '';
    const variantNo = variantNoIdx !== -1 ? values[variantNoIdx] || '' : '';
    const rawSize = sizeIdx !== -1 ? values[sizeIdx] || '' : '';
    const size = convertSize(rawSize);
    const ean = values[eanIdx] || '';
    const quantity = quantityIdx !== -1 ? parseInt(values[quantityIdx] || '0') || 0 : 0;
    const priceIdx = wholesalePriceIdx !== -1 ? wholesalePriceIdx : unitPriceIdx;
    const wholesalePrice = priceIdx !== -1 ? parseEuroPrice(values[priceIdx] || '') : 0;
    const rrp = rrpIdx !== -1 ? parseEuroPrice(values[rrpIdx] || '') : 0;
    const csvCategory = categoryIdx !== -1 ? values[categoryIdx] || '' : '';
    const composition = descriptionIdx !== -1 ? values[descriptionIdx] || '' : '';
    const shortDescription = shortDescIdx !== -1 ? values[shortDescIdx] || '' : '';

    if (!ean) continue;
    if (!isSimplifiedFormat && !artNo) continue;

    let productKey: string;
    let formattedName: string;
    let uniqueReference: string;
    let sku: string;

    if (isSimplifiedFormat) {
      productKey = productName;
      formattedName = `Mini Rodini - ${toSentenceCase(productName)}`;
      uniqueReference = id || ean;
      sku = `${id}-${rawSize}`;
    } else {
      productKey = `${artNo}|${variantName}`;
      formattedName = `Mini Rodini - ${toSentenceCase(productName)} - ${toSentenceCase(variantName)} (${artNo})`;
      uniqueReference = variantNo ? `${artNo}_${variantNo}` : artNo;
      sku = `${artNo}-${variantNo}-${rawSize}`;
    }

    if (!products[productKey]) {
      products[productKey] = {
        reference: uniqueReference,
        name: formattedName,
        originalName: productName,
        productName: isSimplifiedFormat ? productName : artNo,
        material: composition,
        color: variantName,
        csvCategory,
        ecommerceDescription: shortDescription || productName,
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
      size,
      quantity,
      ean,
      sku,
      price: wholesalePrice,
      rrp,
    });
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

const minirodiniPlugin: SupplierPlugin = {
  id: 'minirodini',
  displayName: 'Mini Rodini',
  brandName: 'Mini Rodini',
  fileInputs: [
    { id: 'main_csv', label: 'Mini Rodini CSV', accept: '.csv', required: true, type: 'csv' },
  ],
  parse,
  imageMatching: {
    strategy: 'reference',
    extractReference: (filename: string) => {
      const match = filename.match(/^(\d+)_(\d+)/);
      return match ? `${match[1]}_${match[2]}` : null;
    },
  },

  imageUpload: {
    enabled: true,
    instructions: 'Upload product afbeeldingen via de dedicated pagina.',
    exampleFilenames: ['18397_01bd66254b-11000335-75-1-original.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^\d+_/);
      return match ? match[0].replace('_', '') : null;
    },
    dedicatedPageUrl: '/minirodini-images-import',
    dedicatedPageLabel: 'Upload Mini Rodini Afbeeldingen',
  },
};

export default minirodiniPlugin;
