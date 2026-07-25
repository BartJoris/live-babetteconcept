import { parseEuroPrice, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';
import {
  isWynckenBarcodesCSV,
  isWynckenMasterDataCSV,
  parseWynckenBarcodesCSV,
  type WynckenBarcode,
} from './barcodes';
import type { WynckenPdfProduct } from './sales-order';

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

/** Cached CSVs so processPdfResults can enrich after PDF-only parse */
let cachedDescriptions = new Map<string, WynckenDescription>();
let cachedBarcodes = new Map<string, WynckenBarcode>();

function parseDescriptionsCSV(text: string): Map<string, WynckenDescription> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return new Map();

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim());

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

    const values = line.split(delimiter).map(v => v.trim());
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
  // Drop trailing fabric word noise from SO style lines
  const withoutFabric = cleanedStyle
    .replace(/\s+(cotton(?: mix)?|polyester|nylon(?:\s*\/\s*\w+)?|acrylic mix|wool mix|wool\s*\/\s*poly)\s*$/i, '')
    .trim();
  const formattedColour = colour ? colour.toLowerCase() : '';
  return `Wynken - ${withoutFabric || cleanedStyle}${formattedColour ? ` - ${formattedColour}` : ''}`;
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
  if (sizeStr === 'ONE SIZE' || sizeStr === 'OS') return 'One size';
  return sizeStr;
}

function normalizeStyle(s: string): string {
  return s.toUpperCase().trim().replace(/\s+/g, ' ');
}

function normalizeColour(c: string): string {
  return c.toUpperCase().trim().replace(/\s+/g, ' ');
}

function styleCode(style: string): string {
  const m = style.trim().match(/^([A-Z]{2}\d+[A-Z0-9]*)/i);
  return m ? m[1].toUpperCase() : normalizeStyle(style);
}

function findDescriptionMatch(
  pdfStyle: string,
  pdfColour: string,
  descriptions: Map<string, WynckenDescription>,
): WynckenDescription | null {
  const normPdfStyle = normalizeStyle(pdfStyle);
  const normPdfColour = normalizeColour(pdfColour);
  const pdfCode = styleCode(pdfStyle);

  const allDescs = Array.from(descriptions.values());

  for (const desc of allDescs) {
    if (normalizeStyle(desc.style) === normPdfStyle && normalizeColour(desc.colour) === normPdfColour) {
      return desc;
    }
  }

  const matchingStyles = allDescs.filter((desc) => {
    const descStyle = normalizeStyle(desc.style);
    const descCode = styleCode(desc.style);
    return (
      descCode === pdfCode ||
      descStyle.includes(normPdfStyle) ||
      normPdfStyle.includes(descStyle) ||
      descStyle.split(' ')[0] === normPdfStyle.split(' ')[0]
    );
  });

  if (matchingStyles.length === 0) return null;

  if (!normPdfColour) {
    return matchingStyles.length === 1 ? matchingStyles[0] : null;
  }

  for (const desc of matchingStyles) {
    const descColour = normalizeColour(desc.colour);
    if (
      descColour === normPdfColour ||
      descColour.includes(normPdfColour) ||
      normPdfColour.includes(descColour)
    ) {
      return desc;
    }
  }

  // Soft colour match: ignore punctuation
  const softPdf = normPdfColour.replace(/[^A-Z0-9]+/g, ' ');
  for (const desc of matchingStyles) {
    const softDesc = normalizeColour(desc.colour).replace(/[^A-Z0-9]+/g, ' ');
    if (softDesc === softPdf || softDesc.includes(softPdf) || softPdf.includes(softDesc)) {
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
    if (pdfProduct.quantity <= 0 && !pdfProduct.sizeQuantities?.some((s) => s.quantity > 0)) {
      continue;
    }

    const matchedDescription = hasDescriptions
      ? findDescriptionMatch(pdfProduct.style, pdfProduct.colour, descriptions)
      : null;

    const sizeEntries: Array<{ rawSize: string; quantity: number }> =
      pdfProduct.sizeQuantities && pdfProduct.sizeQuantities.length > 0
        ? pdfProduct.sizeQuantities.map((s) => ({ rawSize: s.size, quantity: s.quantity }))
        : (() => {
            let sizes: string[] = [];
            if (matchedDescription?.sizes) {
              sizes = matchedDescription.sizes.split(',').map((s) => s.trim()).filter(Boolean);
            } else if (hasDescriptions) {
              const code = styleCode(pdfProduct.style);
              const styleMatches = Array.from(descriptions.values()).filter(
                (d) => styleCode(d.style) === code,
              );
              if (styleMatches[0]?.sizes) {
                sizes = styleMatches[0].sizes.split(',').map((s) => s.trim()).filter(Boolean);
              }
            }
            if (sizes.length === 0) sizes = ['ONE SIZE'];
            return sizes.map((rawSize) => ({
              rawSize,
              quantity: pdfProduct.quantity,
            }));
          })();

    if (!matchedDescription) {
      const productKey = `${pdfProduct.style}-${pdfProduct.colour}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const formattedName = formatProductName(pdfProduct.style, pdfProduct.colour);

      if (!products[productKey]) {
        products[productKey] = {
          reference: styleCode(pdfProduct.style) || pdfProduct.style,
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
          rrpSource: 'fallback',
        };
      }

      for (const { rawSize, quantity } of sizeEntries) {
        const dutchSize = convertWynckenSize(rawSize);
        if (!products[productKey].variants.some((v) => v.size === dutchSize)) {
          products[productKey].variants.push({
            size: dutchSize,
            quantity,
            ean: '',
            sku: `${pdfProduct.style}-${rawSize}`,
            price: pdfProduct.unitPrice,
            rrp: Math.round(pdfProduct.unitPrice * 2.5 * 100) / 100,
          });
        }
      }
      continue;
    }

    const productKey = `${matchedDescription.style}-${matchedDescription.colour}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');

    if (!products[productKey]) {
      const formattedName = formatProductName(matchedDescription.style, matchedDescription.colour);
      const hasRrp = matchedDescription.rrpEur > 0;

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
        rrpSource: hasRrp ? 'pdf' : 'fallback',
      };
    }

    for (const { rawSize, quantity } of sizeEntries) {
      const barcodeKey = `${matchedDescription.productId}-${rawSize}`;
      const barcodeData = hasBarcodes ? barcodes.get(barcodeKey) : undefined;
      const dutchSize = convertWynckenSize(rawSize);

      if (!products[productKey].variants.some((v) => v.size === dutchSize)) {
        const costPrice =
          matchedDescription.wspEur > 0 ? matchedDescription.wspEur : pdfProduct.unitPrice;
        const retailPrice =
          matchedDescription.rrpEur > 0
            ? matchedDescription.rrpEur
            : Math.round(costPrice * 2.5 * 100) / 100;

        products[productKey].variants.push({
          size: dutchSize,
          quantity,
          ean: barcodeData?.barcode || '',
          sku: `${matchedDescription.style}-${rawSize}`,
          price: costPrice,
          rrp: retailPrice,
        });
      }
    }
  }

  const productList = Object.values(products);
  productList.forEach((product) => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

function loadCsvCaches(files: SupplierFiles): void {
  const descriptionsText = files['descriptions_csv'] as string | undefined;
  const barcodesText = files['barcodes_csv'] as string | undefined;

  if (descriptionsText) {
    cachedDescriptions = parseDescriptionsCSV(descriptionsText);
  }
  if (barcodesText) {
    cachedBarcodes = parseWynckenBarcodesCSV(barcodesText);
  }
}

function extractPdfProducts(pdfDataRaw: string): WynckenPdfProduct[] {
  try {
    const parsed = JSON.parse(pdfDataRaw);
    return (parsed.products || parsed || []) as WynckenPdfProduct[];
  } catch {
    return [];
  }
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  loadCsvCaches(files);

  const pdfDataRaw = files['pdf_invoice'] as string | undefined;
  if (!pdfDataRaw) return [];

  const pdfProducts = extractPdfProducts(pdfDataRaw);
  if (!Array.isArray(pdfProducts) || pdfProducts.length === 0) return [];

  return combineData(pdfProducts, cachedDescriptions, cachedBarcodes, context);
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as WynckenPdfProduct[];
  if (!pdfProducts.length) {
    return { products: _existingProducts, message: 'Geen producten gevonden in de Wyncken PDF.' };
  }

  const products = combineData(pdfProducts, cachedDescriptions, cachedBarcodes, context);
  const withEan = products.reduce(
    (n, p) => n + p.variants.filter((v) => v.ean).length,
    0,
  );
  const withSizes = products.reduce((n, p) => n + p.variants.length, 0);

  return {
    products,
    message: `${pdfProducts.length} regels uit PDF → ${products.length} producten, ${withSizes} maten, ${withEan} EANs. Upload Master Data + Barcodes CSV indien nog niet gedaan.`,
  };
}

const wynckenPlugin: SupplierPlugin = {
  id: 'wyncken',
  displayName: 'Wyncken',
  brandName: 'Wynken',
  fileInputs: [
    {
      id: 'pdf_invoice',
      label: 'Sales Order PDF (SO-… — maten + aantallen)',
      accept: '.pdf',
      required: true,
      type: 'pdf',
    },
    {
      id: 'descriptions_csv',
      label: 'Master Data CSV (beschrijving + WSP/RRP)',
      accept: '.csv',
      required: false,
      type: 'csv',
    },
    {
      id: 'barcodes_csv',
      label: 'Barcodes CSV (EAN per maat)',
      accept: '.csv',
      required: false,
      type: 'csv',
    },
  ],
  fileDetection: [
    {
      fileInputId: 'barcodes_csv',
      detect: (text) => isWynckenBarcodesCSV(text),
    },
    {
      fileInputId: 'descriptions_csv',
      detect: (text) => isWynckenMasterDataCSV(text) || (
        text.split('\n')[0]?.toLowerCase().includes('product id') &&
        text.split('\n')[0]?.toLowerCase().includes('description') &&
        !text.split('\n')[0]?.toLowerCase().includes('barcode')
      ),
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-wyncken-pdf',
  processPdfResults,
  parse,

  imageUpload: {
    enabled: true,
    instructions: 'Upload afbeeldingen van SS26 FLAT SHOTS folder.',
    exampleFilenames: ['MW20J01-ARTISTS BLUE-2.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^([A-Z0-9]+)-/);
      return match ? match[1] : null;
    },
    dedicatedPageUrl: '/wyncken-images-import',
    dedicatedPageLabel: 'Upload Wyncken Afbeeldingen',
  },
};

export default wynckenPlugin;
