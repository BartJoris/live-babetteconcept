import { determineSizeAttribute, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

interface CsvRow {
  styleCode: string;
  description: string;
  colourName: string;
  composition: string;
  size: string;
  barcode: string;
  retailPrice: number;
  wholesalePrice: number;
  fitComments: string;
  productFeatures: string;
}

interface InvoiceProduct {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

function convertGoldieSize(sizeStr: string): string {
  // Age ranges: "1-2Y" -> "1 jaar", "3-4Y" -> "3 jaar" (use start of range)
  const ageRange = sizeStr.match(/^(\d+)-\d+Y$/i);
  if (ageRange) return `${ageRange[1]} jaar`;

  // Single ages: "2Y" -> "2 jaar"
  const singleAge = sizeStr.match(/^(\d+)Y$/i);
  if (singleAge) return `${singleAge[1]} jaar`;

  // Month ranges: "0-3M" -> "0-3 maand", "6-12M" -> "6-12 maand"
  if (/\d+-\d+M$/i.test(sizeStr)) return sizeStr.replace(/M$/i, ' maand');

  // Single months: "3M" -> "3 maand"
  if (/^\d+M$/i.test(sizeStr)) return sizeStr.replace(/M$/i, ' maand');

  return sizeStr;
}

function parseGoldieAndAceCsvData(text: string): Map<string, CsvRow> {
  const csvData = new Map<string, CsvRow>();

  const lines = text.split('\n');
  if (lines.length < 2) return csvData;

  const parseHeaderIndices = (headerLine: string) => {
    const hdrs = headerLine.split(';').map(h => h.trim());
    return {
      styleCodeIdx: hdrs.findIndex(h => h.toLowerCase() === 'style code'),
      descriptionIdx: hdrs.findIndex(h => h.toLowerCase() === 'description'),
      colourNameIdx: hdrs.findIndex(h => h.toLowerCase() === 'colour name'),
      compositionIdx: hdrs.findIndex(h => h.toLowerCase() === 'composition'),
      sizeIdx: hdrs.findIndex(h => h.toLowerCase() === 'size'),
      barcodesIdx: hdrs.findIndex(h => h.toLowerCase() === 'barcodes'),
      retailEurIdx: hdrs.findIndex(h => h.toLowerCase() === 'retail eur'),
      wsEurIdx: hdrs.findIndex(h => h.toLowerCase() === 'w/s eur'),
      fitCommentsIdx: hdrs.findIndex(h => h.toLowerCase() === 'fit comments'),
      productFeaturesIdx: hdrs.findIndex(h => h.toLowerCase() === 'product features'),
    };
  };

  let colIdx = parseHeaderIndices(lines[0]);
  if (colIdx.styleCodeIdx === -1 || colIdx.descriptionIdx === -1 || colIdx.sizeIdx === -1) {
    return csvData;
  }

  let i = 1;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    // Detect new header section (e.g. SWIM with different column layout)
    const lineLower = line.toLowerCase();
    if (lineLower.includes('style code') && lineLower.includes('description') && lineLower.includes('size')) {
      colIdx = parseHeaderIndices(line);
      i++;
      continue;
    }

    const parts = line.split(';');
    const productFeaturesValue = parts[colIdx.productFeaturesIdx] || '';
    const isMultiLineFeatures = productFeaturesValue.startsWith('"') && !productFeaturesValue.endsWith('"');

    if (isMultiLineFeatures) {
      const styleCode = parts[colIdx.styleCodeIdx]?.trim() || '';
      const description = parts[colIdx.descriptionIdx]?.trim() || '';
      const colourName = parts[colIdx.colourNameIdx]?.trim() || '';
      const composition = parts[colIdx.compositionIdx]?.trim() || '';
      const size = parts[colIdx.sizeIdx]?.trim() || '';
      const barcode = parts[colIdx.barcodesIdx]?.trim() || '';
      const retailStr = parts[colIdx.retailEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
      const wholesaleStr = parts[colIdx.wsEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
      const fitComments = parts[colIdx.fitCommentsIdx]?.trim() || '';

      const productFeaturesLines: string[] = [];
      productFeaturesLines.push(parts[colIdx.productFeaturesIdx]?.replace(/^"/, '') || '');

      let j = i + 1;
      let foundClosingQuote = false;
      while (j < lines.length && !foundClosingQuote) {
        const nextLine = lines[j].trim();
        productFeaturesLines.push(nextLine);
        if (nextLine.endsWith('"')) {
          productFeaturesLines[productFeaturesLines.length - 1] = nextLine.slice(0, -1);
          foundClosingQuote = true;
        }
        j++;
      }

      const key = `${description}-${colourName}-${size}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      csvData.set(key, {
        styleCode,
        description,
        colourName,
        composition,
        size,
        barcode,
        retailPrice: parseFloat(retailStr) || 0,
        wholesalePrice: parseFloat(wholesaleStr) || 0,
        fitComments,
        productFeatures: productFeaturesLines.join('\n').trim(),
      });

      i = j;
    } else {
      if (parts.length > colIdx.productFeaturesIdx) {
        const styleCode = parts[colIdx.styleCodeIdx]?.trim() || '';
        const description = parts[colIdx.descriptionIdx]?.trim() || '';
        const colourName = parts[colIdx.colourNameIdx]?.trim() || '';
        const composition = parts[colIdx.compositionIdx]?.trim() || '';
        const size = parts[colIdx.sizeIdx]?.trim() || '';
        const barcode = parts[colIdx.barcodesIdx]?.trim() || '';
        const retailStr = parts[colIdx.retailEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
        const wholesaleStr = parts[colIdx.wsEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
        const fitComments = parts[colIdx.fitCommentsIdx]?.trim() || '';
        const productFeatures = parts[colIdx.productFeaturesIdx]?.replace(/^"/, '').replace(/"$/, '').trim() || '';

        const key = `${description}-${colourName}-${size}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        csvData.set(key, {
          styleCode,
          description,
          colourName,
          composition,
          size,
          barcode,
          retailPrice: parseFloat(retailStr) || 0,
          wholesalePrice: parseFloat(wholesaleStr) || 0,
          fitComments,
          productFeatures,
        });
      }
      i++;
    }
  }

  return csvData;
}

function buildProductsFromCsvOnly(csvData: Map<string, CsvRow>, context: ParseContext): ParsedProduct[] {
  const brand = context.findBrand('goldie', 'ace', 'goldie and ace');
  const products = new Map<string, ParsedProduct>();

  for (const [, item] of csvData) {
    if (!item.styleCode || !item.description) continue;

    const productKey = `${item.styleCode}-${item.colourName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const dutchSize = convertGoldieSize(item.size);

    if (!products.has(productKey)) {
      const formattedName = `Goldie + Ace - ${toSentenceCase(item.description)} - ${toSentenceCase(item.colourName)}`;
      const ecommerceDescription = [item.fitComments, item.productFeatures].filter(Boolean).join('\n\n').trim();

      products.set(productKey, {
        reference: item.styleCode,
        name: formattedName,
        originalName: item.description,
        color: item.colourName,
        material: item.composition,
        ecommerceDescription,
        variants: [],
        suggestedBrand: brand?.name || 'Goldie and Ace',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    products.get(productKey)!.variants.push({
      size: dutchSize,
      ean: item.barcode,
      sku: `${item.styleCode}-${item.colourName}-${item.size}`.replace(/\s+/g, '-'),
      quantity: 0,
      price: item.wholesalePrice,
      rrp: item.retailPrice,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
  return productList;
}

function processGoldieAndAcePdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const invoiceProducts = (pdfData.products || []) as InvoiceProduct[];
  if (!invoiceProducts.length) {
    return { products: existingProducts, message: 'No products found in PDF.' };
  }

  const brand = context.findBrand('goldie', 'ace', 'goldie and ace');

  // If we have existing products from CSV, build lookup for enrichment
  const csvData = new Map<string, CsvRow>();
  if (existingProducts.length > 0) {
    // Rebuild CSV lookup from existing products + variants
    for (const p of existingProducts) {
      for (const v of p.variants) {
        const key = `${p.originalName}-${p.color}-${v.size}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        csvData.set(key, {
          styleCode: p.reference,
          description: p.originalName || '',
          colourName: p.color,
          composition: p.material,
          size: v.size,
          barcode: v.ean,
          retailPrice: v.rrp,
          wholesalePrice: v.price,
          fitComments: '',
          productFeatures: '',
        });
      }
    }
  }

  const products = new Map<string, ParsedProduct>();

  for (const invoiceItem of invoiceProducts) {
    const invoiceDesc = invoiceItem.description.trim();

    // Extract size (last part: 1-2Y, 0-3M, 2Y, etc.)
    const sizeMatch = invoiceDesc.match(/(\d+-\d+Y|\d+-\d+M|\d+Y|\d+M)$/i);
    if (!sizeMatch) continue;

    const size = sizeMatch[1];
    const productName = invoiceDesc.substring(0, invoiceDesc.length - size.length).trim();
    const invoiceNameNorm = productName.toUpperCase();
    const invoiceSizeNorm = size.toUpperCase();

    let matchedCsv: CsvRow | null = null;

    // First pass: match description + colour + size
    for (const [, csvItem] of csvData) {
      if (csvItem.size.toUpperCase() !== invoiceSizeNorm) continue;
      const fullCsvName = (`${csvItem.description.trim()} ${csvItem.colourName.trim()}`).toUpperCase();
      if (invoiceNameNorm === fullCsvName || invoiceNameNorm.includes(fullCsvName) || fullCsvName.includes(invoiceNameNorm)) {
        matchedCsv = csvItem;
        break;
      }
    }

    // Second pass: match description + size only
    if (!matchedCsv) {
      for (const [, csvItem] of csvData) {
        if (csvItem.size.toUpperCase() !== invoiceSizeNorm) continue;
        const csvDescNorm = csvItem.description.trim().toUpperCase();
        if (csvDescNorm === invoiceNameNorm || csvDescNorm.includes(invoiceNameNorm) || invoiceNameNorm.includes(csvDescNorm)) {
          matchedCsv = csvItem;
          break;
        }
      }
    }

    if (!matchedCsv) continue;

    const dutchSize = convertGoldieSize(size);
    const productKey = `${matchedCsv.styleCode}-${matchedCsv.colourName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (!products.has(productKey)) {
      const formattedName = `Goldie + Ace - ${toSentenceCase(matchedCsv.description)} - ${toSentenceCase(matchedCsv.colourName)}`;
      const ecommerceDescription = [matchedCsv.fitComments, matchedCsv.productFeatures].filter(Boolean).join('\n\n').trim();

      products.set(productKey, {
        reference: matchedCsv.styleCode,
        name: formattedName,
        originalName: matchedCsv.description,
        color: matchedCsv.colourName,
        material: matchedCsv.composition,
        ecommerceDescription,
        variants: [],
        suggestedBrand: brand?.name || 'Goldie and Ace',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    products.get(productKey)!.variants.push({
      size: dutchSize,
      ean: matchedCsv.barcode,
      sku: `${matchedCsv.styleCode}-${matchedCsv.colourName}-${size}`.replace(/\s+/g, '-'),
      quantity: invoiceItem.quantity,
      price: invoiceItem.unitPrice,
      rrp: matchedCsv.retailPrice,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });

  return {
    products: productList,
    message: `${productList.length} products loaded from Goldie + Ace invoice.`,
  };
}

const goldieAndAcePlugin: SupplierPlugin = {
  id: 'goldieandace',
  displayName: 'Goldie + Ace',
  brandName: 'Goldie and Ace',

  fileInputs: [
    { id: 'main_csv', label: 'Line Sheet CSV', accept: '.csv', required: false, type: 'csv' },
    { id: 'pdf_invoice', label: 'Invoice PDF', accept: '.pdf', required: false, type: 'pdf' },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-goldieandace-pdf',

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const csvText = files['main_csv'] as string;
    if (!csvText) return [];

    const csvData = parseGoldieAndAceCsvData(csvText);
    if (csvData.size === 0) return [];

    return buildProductsFromCsvOnly(csvData, context);
  },

  processPdfResults: processGoldieAndAcePdfResults,
};

export default goldieAndAcePlugin;
