import { parseEuroPrice, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

function parseQuotedCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        j++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim().replace(/^"|"$/g, ''));
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim().replace(/^"|"$/g, ''));
  return values;
}

function parseCatalogCSV(text: string, context: ParseContext): ParsedProduct[] {
  const lines = text.trim().split('\n');
  if (lines.length < 3) return [];

  // Line 0 is "Table 1", Line 1 is headers
  const headers = lines[1].split(';').map(h => h.trim());

  const idIdx = headers.indexOf('ID');
  const itemNumberIdx = headers.indexOf('Item Number');
  const descriptionIdx = headers.indexOf('Item Description');
  const colorDescIdx = headers.indexOf('Color Description');
  const colorCodeIdx = headers.indexOf('Color Code');
  const sizeCodeIdx = headers.indexOf('Size Code');
  const skuIdx = headers.indexOf('SKU Number');
  const eanIdx = headers.indexOf('EAN');
  const priceWholesaleIdx = headers.indexOf('Price Whoesale (EUR)');
  const rrpIdx = headers.indexOf('RPR (EUR)');

  if (idIdx === -1 || itemNumberIdx === -1 || descriptionIdx === -1 || eanIdx === -1 || priceWholesaleIdx === -1) {
    return [];
  }

  const brand = context.findBrand('armed angels', 'armedangels');
  const products: Record<string, ParsedProduct> = {};

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(';').map(v => v.trim());
    if (values.length < Math.max(idIdx, itemNumberIdx, descriptionIdx, eanIdx, priceWholesaleIdx) + 1) continue;

    const combinedId = values[idIdx] || '';
    const itemNumber = values[itemNumberIdx] || '';
    const description = values[descriptionIdx] || '';
    const colorCode = colorCodeIdx !== -1 ? values[colorCodeIdx] || '' : '';
    const colorDesc = colorDescIdx !== -1 ? values[colorDescIdx] || '' : '';
    const sizeCode = sizeCodeIdx !== -1 ? values[sizeCodeIdx] || '' : '';
    const sku = skuIdx !== -1 ? values[skuIdx] || '' : '';
    const ean = values[eanIdx] || '';
    const price = parseEuroPrice(values[priceWholesaleIdx] || '0');
    const rrp = rrpIdx !== -1 ? parseEuroPrice(values[rrpIdx] || '0') : 0;

    if (!combinedId || !itemNumber || !description) continue;

    const productKey = combinedId;
    const colorDisplay = colorCode ? `${colorCode} ${colorDesc}` : colorDesc;

    if (!products[productKey]) {
      products[productKey] = {
        reference: itemNumber,
        name: `Armed Angels - ${description} - ${colorDisplay}`,
        originalName: description,
        color: colorDisplay,
        material: '',
        ecommerceDescription: '',
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
      size: sizeCode,
      quantity: 0,
      ean: ean || sku || '',
      price,
      rrp,
    });
  }

  return Object.values(products);
}

function parseInvoiceCSV(text: string, context: ParseContext): ParsedProduct[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  if (!headers.includes('Item Number') || !headers.includes('Description') || !headers.includes('Color')) {
    return [];
  }

  const itemNumberIdx = headers.indexOf('Item Number');
  const descriptionIdx = headers.indexOf('Description');
  const colorIdx = headers.indexOf('Color');
  const sizeIdx = headers.indexOf('Size');
  const skuIdx = headers.indexOf('SKU');
  const quantityIdx = headers.indexOf('Quantity');
  const priceIdx = headers.indexOf('Price (EUR)');

  const brand = context.findBrand('armed angels', 'armedangels');
  const products: Record<string, ParsedProduct> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseQuotedCSVLine(line);
    if (values.length < Math.max(itemNumberIdx, descriptionIdx, colorIdx) + 1) continue;

    const itemNumber = values[itemNumberIdx]?.trim() || '';
    const description = values[descriptionIdx]?.trim() || '';
    const color = values[colorIdx]?.trim() || '';
    const size = sizeIdx !== -1 ? values[sizeIdx]?.trim() || '' : '';
    const sku = skuIdx !== -1 ? values[skuIdx]?.trim() || '' : '';
    const quantity = quantityIdx !== -1 ? parseInt(values[quantityIdx]?.trim() || '0') : 0;
    const price = priceIdx !== -1 ? parseEuroPrice(values[priceIdx]?.trim() || '0') : 0;

    if (!itemNumber || !description) continue;

    const productKey = `${itemNumber}_${color}`;

    if (!products[productKey]) {
      products[productKey] = {
        reference: itemNumber,
        name: `Armed Angels - ${description} - ${itemNumber}`,
        originalName: description,
        color,
        material: '',
        ecommerceDescription: '',
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
      size,
      quantity,
      ean: sku || '',
      price,
      rrp: price * 2.4,
    });
  }

  return Object.values(products);
}

function enrichCatalogWithInvoice(catalogProducts: ParsedProduct[], invoiceProducts: ParsedProduct[]): ParsedProduct[] {
  const enrichedReferences = new Set<string>();

  for (const catalogProduct of catalogProducts) {
    const invoiceProduct = invoiceProducts.find(p => {
      if (p.reference === catalogProduct.reference && p.color === catalogProduct.color) return true;
      if (p.reference === catalogProduct.reference && (!p.color || p.color.trim() === '')) return true;
      return false;
    });

    if (!invoiceProduct) continue;

    enrichedReferences.add(catalogProduct.reference + '|' + (catalogProduct.color || ''));

    for (const invoiceVariant of invoiceProduct.variants) {
      const catalogVariant = catalogProduct.variants.find(v =>
        v.size === invoiceVariant.size ||
        (invoiceVariant.size === 'One Size' && catalogProduct.variants.length === 1)
      );
      if (catalogVariant) {
        catalogVariant.quantity = invoiceVariant.quantity;
      }
    }
  }

  return catalogProducts
    .filter(p => enrichedReferences.has(p.reference + '|' + (p.color || '')))
    .map(product => ({
      ...product,
      variants: product.variants.filter(v => v.quantity > 0),
    }));
}

function isCatalogCSV(text: string): boolean {
  return text.trimStart().startsWith('Table 1');
}

function isInvoiceCSV(text: string): boolean {
  const firstLine = text.split('\n')[0] || '';
  return firstLine.includes('Item Number') && firstLine.includes('Description') && firstLine.includes('Color');
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  if (isCatalogCSV(text)) {
    const catalogProducts = parseCatalogCSV(text, context);
    catalogProducts.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });

    const invoiceText = files['invoice_csv'] as string;
    if (invoiceText) {
      const invoiceProducts = parseInvoiceCSV(invoiceText, context);
      const enriched = enrichCatalogWithInvoice(catalogProducts, invoiceProducts);
      enriched.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
      return enriched;
    }

    return catalogProducts;
  }

  if (isInvoiceCSV(text)) {
    const invoiceProducts = parseInvoiceCSV(text, context);
    invoiceProducts.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });

    const catalogText = files['catalog_csv'] as string;
    if (catalogText) {
      const catalogProducts = parseCatalogCSV(catalogText, context);
      const enriched = enrichCatalogWithInvoice(catalogProducts, invoiceProducts);
      enriched.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
      return enriched;
    }

    return invoiceProducts;
  }

  return [];
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  _context: ParseContext,
): EnrichmentResult {
  const invoiceProducts = (pdfData.products || []) as Array<{
    itemNumber: string;
    description: string;
    color: string;
    size: string;
    quantity: number;
    price: number;
  }>;

  if (!invoiceProducts.length) {
    return { products: existingProducts, message: 'No products found in PDF.' };
  }

  if (existingProducts.length === 0) {
    return { products: existingProducts, message: 'Upload catalog CSV first, then use PDF for enrichment.' };
  }

  const enrichedReferences = new Set<string>();

  for (const catalogProduct of existingProducts) {
    for (const inv of invoiceProducts) {
      if (inv.itemNumber === catalogProduct.reference) {
        enrichedReferences.add(catalogProduct.reference + '|' + (catalogProduct.color || ''));
        const catalogVariant = catalogProduct.variants.find(v => v.size === inv.size);
        if (catalogVariant) {
          catalogVariant.quantity = inv.quantity;
        }
      }
    }
  }

  const enriched = existingProducts
    .filter(p => enrichedReferences.has(p.reference + '|' + (p.color || '')))
    .map(product => ({
      ...product,
      variants: product.variants.filter(v => v.quantity > 0),
    }));

  return {
    products: enriched.length > 0 ? enriched : existingProducts,
    message: `PDF enrichment: ${enrichedReferences.size} products matched with invoice data.`,
  };
}

const armedangelsPlugin: SupplierPlugin = {
  id: 'armedangels',
  displayName: 'Armed Angels',
  brandName: 'Armed Angels',
  fileInputs: [
    { id: 'main_csv', label: 'Armed Angels CSV (Catalog of Invoice)', accept: '.csv', required: true, type: 'csv' },
    { id: 'pdf_invoice', label: 'Invoice PDF (optional)', accept: '.pdf', required: false, type: 'pdf' },
  ],
  fileDetection: [
    {
      fileInputId: 'catalog_csv',
      detect: (text) => isCatalogCSV(text),
    },
    {
      fileInputId: 'invoice_csv',
      detect: (text) => isInvoiceCSV(text),
      requiresExistingProducts: true,
      orderError: 'Upload eerst de Catalog CSV!',
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-armedangels-pdf',
  processPdfResults,
  parse,
};

export default armedangelsPlugin;
