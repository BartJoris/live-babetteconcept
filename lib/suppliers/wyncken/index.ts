import { parseEuroPrice, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

interface WynckenDescription {
  productId: string;
  style: string;
  fabric: string;
  colour: string;
  description: string;
  sizes: string;
  textileContent: string;
  productCategory1: string;
  wspEur: number;
  rrpEur: number;
}

interface WynckenBarcode {
  productId: string;
  style: string;
  fabric: string;
  colour: string;
  size: string;
  barcode: string;
}

interface WynckenPdfProduct {
  style: string;
  fabric: string;
  colour: string;
  materialContent?: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

function parseDescriptionsCSV(text: string): Map<string, WynckenDescription> {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return new Map();

  const headers = lines[0].split(';').map(h => h.trim());

  const productIdIdx = headers.findIndex(h => h.toLowerCase() === 'product id');
  const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
  const fabricIdx = headers.findIndex(h => h.toLowerCase() === 'fabric');
  const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour');
  const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
  const sizesIdx = headers.findIndex(h => h.toLowerCase() === 'sizes');
  const textileContentIdx = headers.findIndex(h => h.toLowerCase() === 'textile content');
  const productCategory1Idx = headers.findIndex(h => h.toLowerCase() === 'product category 1');
  const wspEurIdx = headers.findIndex(h => h.toLowerCase().includes('wsp') && h.toLowerCase().includes('eur'));
  const rrpEurIdx = headers.findIndex(h => h.toLowerCase().includes('rrp') && h.toLowerCase().includes('eur'));

  if (productIdIdx === -1 || styleIdx === -1) return new Map();

  const descriptions = new Map<string, WynckenDescription>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(';').map(v => v.trim());
    const productId = values[productIdIdx] || '';
    const style = values[styleIdx] || '';
    if (!productId || !style) continue;

    descriptions.set(productId, {
      productId,
      style,
      fabric: fabricIdx !== -1 ? values[fabricIdx] || '' : '',
      colour: colourIdx !== -1 ? values[colourIdx] || '' : '',
      description: descriptionIdx !== -1 ? values[descriptionIdx] || '' : '',
      sizes: sizesIdx !== -1 ? values[sizesIdx] || '' : '',
      textileContent: textileContentIdx !== -1 ? values[textileContentIdx] || '' : '',
      productCategory1: productCategory1Idx !== -1 ? values[productCategory1Idx] || '' : '',
      wspEur: wspEurIdx !== -1 ? parseEuroPrice(values[wspEurIdx] || '0') : 0,
      rrpEur: rrpEurIdx !== -1 ? parseEuroPrice(values[rrpEurIdx] || '0') : 0,
    });
  }

  return descriptions;
}

function parseBarcodesCSV(text: string): Map<string, WynckenBarcode> {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return new Map();

  const headers = lines[0].split(',').map(h => h.trim());

  const productIdIdx = headers.findIndex(h => h.toLowerCase() === 'product id');
  const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
  const fabricIdx = headers.findIndex(h => h.toLowerCase() === 'fabric');
  const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour');
  const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
  const barcodeIdx = headers.findIndex(h => h.toLowerCase() === 'barcode');

  if (productIdIdx === -1 || styleIdx === -1 || sizeIdx === -1 || barcodeIdx === -1) return new Map();

  const barcodes = new Map<string, WynckenBarcode>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    const productId = values[productIdIdx] || '';
    const style = values[styleIdx] || '';
    const size = values[sizeIdx] || '';
    const barcode = values[barcodeIdx] || '';

    if (!productId || !style || !size || !barcode) continue;

    const key = `${productId}-${size}`;
    barcodes.set(key, {
      productId,
      style,
      fabric: fabricIdx !== -1 ? values[fabricIdx] || '' : '',
      colour: colourIdx !== -1 ? values[colourIdx] || '' : '',
      size,
      barcode,
    });
  }

  return barcodes;
}

function formatProductName(style: string, colour: string): string {
  const removeStyleCode = (text: string): string => {
    if (!text) return '';
    const styleCodePattern = /^[A-Z]{2,}\d+[A-Z0-9]*\s+/i;
    let cleaned = text.replace(styleCodePattern, '').trim();
    if (cleaned === text) {
      const words = text.split(' ');
      if (words.length > 0 && /^[A-Z]{2,}.*\d+.*/i.test(words[0])) {
        cleaned = words.slice(1).join(' ').trim();
      }
    }
    return cleaned || text;
  };

  const cleanedStyle = removeStyleCode(style).toLowerCase();
  const formattedColour = colour ? colour.toLowerCase() : '';
  return `Wynken - ${cleanedStyle}${formattedColour ? ` - ${formattedColour}` : ''}`;
}

function convertWynckenSize(sizeStr: string): string {
  if (sizeStr.match(/^\d+M$/i)) {
    const match = sizeStr.match(/^(\d+)M$/i);
    if (match) return `${match[1]} maand`;
  }
  if (/^\d+$/.test(sizeStr)) {
    return `${sizeStr} jaar`;
  }
  if (sizeStr.match(/^\d+Y-\d+Y$/i)) {
    const match = sizeStr.match(/^(\d+)Y-\d+Y$/i);
    return match ? `${match[1]} jaar` : sizeStr;
  }
  if (sizeStr.match(/^\d+Y$/i)) {
    const match = sizeStr.match(/^(\d+)Y$/i);
    return match ? `${match[1]} jaar` : sizeStr;
  }
  if (sizeStr === 'ONE SIZE') return 'One size';
  return sizeStr;
}

function normalizeStyle(s: string): string {
  return s.toUpperCase().trim().replace(/\s+/g, ' ');
}

function normalizeColour(c: string): string {
  return c.toUpperCase().trim().replace(/\s+/g, ' ');
}

function findDescriptionMatch(
  pdfStyle: string,
  pdfColour: string,
  descriptions: Map<string, WynckenDescription>,
): WynckenDescription | null {
  const normPdfStyle = normalizeStyle(pdfStyle);
  const normPdfColour = normalizeColour(pdfColour);

  const allDescs = Array.from(descriptions.values());

  // Exact match
  for (const desc of allDescs) {
    if (normalizeStyle(desc.style) === normPdfStyle && normalizeColour(desc.colour) === normPdfColour) {
      return desc;
    }
  }

  // Partial style match
  const matchingStyles: WynckenDescription[] = [];
  for (const desc of allDescs) {
    const descStyle = normalizeStyle(desc.style);
    if (descStyle.includes(normPdfStyle) || normPdfStyle.includes(descStyle) ||
        descStyle.split(' ')[0] === normPdfStyle.split(' ')[0]) {
      matchingStyles.push(desc);
    }
  }

  if (matchingStyles.length === 0) return null;

  if (!normPdfColour || normPdfColour.trim() === '') {
    return matchingStyles.length === 1 ? matchingStyles[0] : null;
  }

  for (const desc of matchingStyles) {
    const descColour = normalizeColour(desc.colour);
    if (descColour === normPdfColour || descColour.includes(normPdfColour) || normPdfColour.includes(descColour)) {
      return desc;
    }
  }

  return null;
}

function combineData(
  pdfProducts: WynckenPdfProduct[],
  descriptions: Map<string, WynckenDescription>,
  barcodes: Map<string, WynckenBarcode>,
  context: ParseContext,
): ParsedProduct[] {
  const brand = context.findBrand('wyncken', 'wynken');
  const products: Record<string, ParsedProduct> = {};
  const hasDescriptions = descriptions.size > 0;
  const hasBarcodes = barcodes.size > 0;

  for (const pdfProduct of pdfProducts) {
    const matchedDescription = hasDescriptions
      ? findDescriptionMatch(pdfProduct.style, pdfProduct.colour, descriptions)
      : null;

    if (!matchedDescription) {
      const productKey = `${pdfProduct.style}-${pdfProduct.colour}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const formattedName = formatProductName(pdfProduct.style, pdfProduct.colour);

      if (!products[productKey]) {
        products[productKey] = {
          reference: pdfProduct.style,
          name: formattedName,
          originalName: pdfProduct.style,
          color: pdfProduct.colour || '',
          material: pdfProduct.materialContent || '',
          ecommerceDescription: `${pdfProduct.style}${pdfProduct.colour ? ` - ${pdfProduct.colour}` : ''}`,
          variants: [],
          suggestedBrand: brand?.name,
          selectedBrand: brand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: 'MAAT Kinderen',
          images: [],
          imagesFetched: false,
        };
      }

      let sizes: string[] = [];
      if (hasDescriptions) {
        const normPdfStyle = normalizeStyle(pdfProduct.style);
        const styleMatches = Array.from(descriptions.values())
          .filter(d => normalizeStyle(d.style) === normPdfStyle);
        if (styleMatches.length > 0) {
          sizes = styleMatches[0].sizes.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      if (sizes.length === 0) sizes = ['ONE SIZE'];

      for (const size of sizes) {
        const dutchSize = convertWynckenSize(size);
        if (!products[productKey].variants.some(v => v.size === dutchSize)) {
          products[productKey].variants.push({
            size: dutchSize,
            quantity: pdfProduct.quantity,
            ean: '',
            sku: `${pdfProduct.style}-${size}`,
            price: pdfProduct.unitPrice,
            rrp: pdfProduct.unitPrice * 2.5,
          });
        }
      }
      continue;
    }

    const sizes = matchedDescription.sizes.split(',').map(s => s.trim()).filter(Boolean);
    const productKey = `${matchedDescription.style}-${matchedDescription.colour}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (!products[productKey]) {
      const formattedName = formatProductName(matchedDescription.style, matchedDescription.colour);

      products[productKey] = {
        reference: matchedDescription.style,
        name: formattedName,
        originalName: matchedDescription.style,
        color: matchedDescription.colour,
        material: matchedDescription.textileContent,
        ecommerceDescription: matchedDescription.description,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        sizeAttribute: 'MAAT Kinderen',
        images: [],
        imagesFetched: false,
      };
    }

    for (const size of sizes) {
      const barcodeKey = `${matchedDescription.productId}-${size}`;
      const barcodeData = hasBarcodes ? barcodes.get(barcodeKey) : undefined;
      const dutchSize = convertWynckenSize(size);

      if (!products[productKey].variants.some(v => v.size === dutchSize)) {
        const costPrice = matchedDescription.wspEur > 0 ? matchedDescription.wspEur : pdfProduct.unitPrice;
        const retailPrice = matchedDescription.rrpEur > 0 ? matchedDescription.rrpEur : (costPrice * 2.5);

        products[productKey].variants.push({
          size: dutchSize,
          quantity: pdfProduct.quantity,
          ean: barcodeData?.barcode || '',
          sku: `${matchedDescription.style}-${size}`,
          price: costPrice,
          rrp: retailPrice,
        });
      }
    }
  }

  const productList = Object.values(products);
  productList.forEach(product => {
    if (!product.sizeAttribute) {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    }
  });

  return productList;
}

function isDescriptionsCSV(text: string): boolean {
  const firstLine = text.split('\n')[0].toLowerCase();
  return firstLine.includes('product id') && firstLine.includes('style') && firstLine.includes('description');
}

function isBarcodesCSV(text: string): boolean {
  const firstLine = text.split('\n')[0].toLowerCase();
  return firstLine.includes('product id') && firstLine.includes('style') && firstLine.includes('barcode');
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const pdfDataRaw = files['pdf_invoice'] as string;
  if (!pdfDataRaw) return [];

  let pdfProducts: WynckenPdfProduct[] = [];
  try {
    const parsed = JSON.parse(pdfDataRaw);
    pdfProducts = parsed.products || parsed || [];
  } catch {
    return [];
  }

  if (!Array.isArray(pdfProducts) || pdfProducts.length === 0) return [];

  const descriptionsText = files['descriptions_csv'] as string;
  const barcodesText = files['barcodes_csv'] as string;

  const descriptions = descriptionsText ? parseDescriptionsCSV(descriptionsText) : new Map<string, WynckenDescription>();
  const barcodes = barcodesText ? parseBarcodesCSV(barcodesText) : new Map<string, WynckenBarcode>();

  return combineData(pdfProducts, descriptions, barcodes, context);
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as WynckenPdfProduct[];
  if (!pdfProducts.length) {
    return { products: existingProducts, message: 'No products found in PDF.' };
  }

  const products = combineData(
    pdfProducts,
    new Map(),
    new Map(),
    context,
  );

  return {
    products,
    message: `${pdfProducts.length} products parsed from PDF. Upload CSV files to enrich with descriptions and barcodes.`,
  };
}

const wynckenPlugin: SupplierPlugin = {
  id: 'wyncken',
  displayName: 'Wyncken',
  brandName: 'Wynken',
  fileInputs: [
    { id: 'pdf_invoice', label: 'PDF Proforma Invoice (required)', accept: '.pdf', required: true, type: 'pdf' },
    { id: 'descriptions_csv', label: 'Product Descriptions CSV (optional)', accept: '.csv', required: false, type: 'csv' },
    { id: 'barcodes_csv', label: 'Barcodes CSV (optional)', accept: '.csv', required: false, type: 'csv' },
  ],
  fileDetection: [
    {
      fileInputId: 'descriptions_csv',
      detect: (text) => isDescriptionsCSV(text),
    },
    {
      fileInputId: 'barcodes_csv',
      detect: (text) => isBarcodesCSV(text),
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-wyncken-pdf',
  processPdfResults,
  parse,
};

export default wynckenPlugin;
