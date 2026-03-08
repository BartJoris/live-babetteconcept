/**
 * Tangerine supplier plugin.
 * - Packing list: PDF (BABETTE PACKING LIST) of optioneel CSV als de PDF niet leesbaar is.
 * - Price PDF (optional): ref + RRP.
 * - Images: root folder with subfolders per product (e.g. TG-622/TG_622_FRONT.jpg).
 */

import { determineSizeAttribute, convertSize } from '@/lib/import/shared';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

export interface TangerinePdfProduct {
  reference: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  rrp: number;
  ean?: string;
  sku?: string;
}

/**
 * Extract reference from image filename or path.
 * - From path: "Flats Lays/TG-622/TG_622_FRONT.jpg" → use folder name "TG-622".
 * - From filename: "TG_622_FRONT.jpg" → "TG-622", "TG_789_BLUE_FRONT.png" → "TG-789 BLUE".
 */
function extractReferenceFromFilename(filename: string): string | null {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  // TG_622_FRONT, TG_789_BLUE_FRONT, TG_789_YELLOW_BACK
  const m = base.match(/^TG_(\d+)(?:_([A-Z]+))?/i);
  if (!m) return null;
  const ref = `TG-${m[1]}`;
  const colorPart = m[2];
  if (colorPart && !/^(FRONT|BACK|SIDE|NO LACE)$/i.test(colorPart)) {
    return `${ref} ${colorPart}`;
  }
  return ref;
}

/**
 * When user selects a folder, the reference is the parent folder name (e.g. TG-622, TG-789 BLUE).
 * relativePath is e.g. "Flats Lays Photos - SS26/TG-622/TG_622_FRONT.jpg".
 */
function extractReferenceFromPath(relativePath: string): string | null {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const folderName = parts[parts.length - 2];
    if (/^TG-\d+/i.test(folderName)) return folderName;
  }
  return null;
}

/**
 * Parse packing list CSV (export from PDF table).
 * Expected columns (as in BABETTE PACKING LIST - TANGERINE SS26):
 * REFERENCE, IMAGE, PRODUCT NAME, COMPOSITION, COLOR NAME, TYPE, HS CODE, SIZE, EAN Code, UNITS, UNITS PER BOX, TOTAL UNITS.
 * Delimiter ; or ,. One row per size; same REFERENCE + PRODUCT NAME repeat per size row.
 */
function parsePackingCsv(text: string): ParsedProduct[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const firstLine = lines[0];
  const delim = firstLine.includes(';') ? ';' : ',';
  const headers = firstLine.split(delim).map(h => h.trim().toLowerCase());
  const col = (name: string) => headers.findIndex(h => h.includes(name));
  const iRef = col('reference');
  const iName = headers.findIndex(h => h.includes('product') && h.includes('name'));
  const iComposition = col('composition');
  const iColor = col('color') >= 0 ? col('color') : col('colour');
  const iSize = col('size');
  const iUnits = col('units');
  const iTotalUnits = headers.findIndex(h => h.includes('total') && h.includes('units'));
  const iEan = col('ean') >= 0 ? col('ean') : col('barcode');
  const iPrice = col('price');
  const iRrp = col('rrp') >= 0 ? col('rrp') : col('retail');
  const iSku = col('sku');
  if (iRef === -1) return [];

  const brand = { id: 0, name: 'Tangerine', source: 'tangerine' };
  const products = new Map<string, ParsedProduct>();
  let lastRef = '';
  let lastName = '';
  let lastColor = '';
  let lastMaterial = '';

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
    let refRaw = (cells[iRef] || '').trim();
    // Skip "TOTAL OF REFERENCE ..." summary lines
    if (/^TOTAL\s+OF\s+REFERENCE/i.test(refRaw)) continue;
    // Carry over from previous row when ref is empty (same product, next size)
    if (refRaw) {
      const refMatch = refRaw.match(/^(TG-?\d+)(?:\s*\(([^)]+)\))?/i);
      if (refMatch) {
        lastRef = refMatch[1].replace(/^TG(\d+)/i, 'TG-$1');
        lastName = iName >= 0 ? (cells[iName] || '') : lastRef;
        lastColor = iColor >= 0 ? (cells[iColor] || '') : (refMatch[2] || '');
        lastMaterial = iComposition >= 0 ? (cells[iComposition] || '') : '';
      }
    }
    const ref = lastRef || (refRaw ? refRaw.replace(/^TG(\d+)/i, 'TG-$1') : '');
    if (!ref || !/^TG-?\d+/i.test(ref)) continue;
    const name = (refRaw && iName >= 0 ? (cells[iName] || '') : lastName) || ref;
    const color = refRaw && iColor >= 0 ? (cells[iColor] || '') : lastColor;
    const material = (refRaw && iComposition >= 0 ? (cells[iComposition] || '') : lastMaterial) || '';
    const sizeRaw = iSize >= 0 ? (cells[iSize] || '') : '';
    const size = sizeRaw ? convertSize(sizeRaw) : sizeRaw;
    const qty = iTotalUnits >= 0 ? parseInt(cells[iTotalUnits] || '0', 10) : iUnits >= 0 ? parseInt(cells[iUnits] || '1', 10) : 1;
    const price = iPrice >= 0 ? parseEuroPrice(cells[iPrice] || '0') : 0;
    const rrp = iRrp >= 0 ? parseEuroPrice(cells[iRrp] || '0') : 0;
    let ean = iEan >= 0 ? (cells[iEan] || '') : '';
    if (ean) ean = ean.replace(/\s/g, '').replace(/\./g, '').trim();
    const sku = iSku >= 0 ? (cells[iSku] || '') : undefined;
    const productKey = `${ref}-${color}`.toLowerCase().replace(/\s+/g, '-');

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: ref,
        name: `Tangerine - ${name || ref} - ${color}`.trim(),
        originalName: name,
        color,
        material,
        variants: [],
        suggestedBrand: brand.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }
    const p = products.get(productKey)!;
    p.variants.push({
      size: size || '',
      ean,
      sku: sku || undefined,
      quantity: qty,
      price,
      rrp,
    });
  }
  const list = Array.from(products.values());
  list.forEach(p => { p.sizeAttribute = determineSizeAttribute(p.variants); });
  return list;
}

/**
 * Parse packing list from pasted text (bijv. na OCR van screenshot of copy-paste).
 * Accepteert tab- of spatie-gescheiden regels; zoekt header (REFERENCE, PRODUCT NAME, …) en datarijen met TG-xxx.
 */
function parsePackingPastedText(pasted: string): ParsedProduct[] {
  const lines = pasted.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const detectDelim = (line: string): { delim: RegExp | string; cells: string[] } => {
    if (line.includes('\t')) {
      const cells = line.split('\t').map((c) => c.trim());
      if (cells.length >= 5) return { delim: '\t', cells };
    }
    const bySpaces = line.split(/\s{2,}/).map((c) => c.trim());
    if (bySpaces.length >= 5) return { delim: /\s{2,}/, cells: bySpaces };
    return { delim: '\t', cells: line.split('\t').map((c) => c.trim()) };
  };

  const first = detectDelim(lines[0]);
  const headers = first.cells.map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iRef = col('reference');
  const iName = headers.findIndex((h) => h.includes('product') && h.includes('name'));
  const iComposition = col('composition');
  const iColor = col('color') >= 0 ? col('color') : col('colour');
  const iSize = col('size');
  const iUnits = col('units');
  const iTotalUnits = headers.findIndex((h) => h.includes('total') && h.includes('units'));
  const iEan = col('ean') >= 0 ? col('ean') : col('barcode');
  if (iRef === -1) {
    const anyRef = lines.join(' ');
    if (!/TG-?\d+/.test(anyRef)) return [];
    const headerIdx = lines.findIndex((l) => /REFERENCE|PRODUCT\s+NAME|TG-?\d+/.test(l));
    if (headerIdx >= 0 && headerIdx < lines.length - 1) {
      const reDetect = detectDelim(lines[headerIdx]);
      const h = reDetect.cells.map((x) => x.toLowerCase());
      const cRef = h.findIndex((x) => x.includes('reference'));
      if (cRef >= 0) {
        const rest = lines.slice(headerIdx + 1);
        return parsePackingPastedText([lines[headerIdx], ...rest].join('\n'));
      }
    }
    return [];
  }

  const splitLine = (line: string): string[] =>
    typeof first.delim === 'string'
      ? line.split(first.delim).map((c) => c.trim())
      : line.split(first.delim).map((c) => c.trim());

  const brand = { id: 0, name: 'Tangerine', source: 'tangerine' };
  const products = new Map<string, ParsedProduct>();
  let lastRef = '';
  let lastName = '';
  let lastColor = '';
  let lastMaterial = '';

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    let refRaw = (cells[iRef] || '').trim();
    if (/^TOTAL\s+OF\s+REFERENCE/i.test(refRaw)) continue;
    if (refRaw) {
      const m = refRaw.match(/^(TG-?\d+)(?:\s*\(([^)]+)\))?/i);
      if (m) {
        lastRef = m[1].replace(/^TG(\d+)/i, 'TG-$1');
        lastName = iName >= 0 ? (cells[iName] || '') : lastRef;
        lastColor = iColor >= 0 ? (cells[iColor] || '') : (m[2] || '');
        lastMaterial = iComposition >= 0 ? (cells[iComposition] || '') : '';
      }
    }
    const ref = lastRef || (refRaw ? refRaw.replace(/^TG(\d+)/i, 'TG-$1') : '');
    if (!ref || !/^TG-?\d+/i.test(ref)) continue;
    const name = (refRaw && iName >= 0 ? cells[iName] : lastName) || ref;
    const color = refRaw && iColor >= 0 ? cells[iColor] : lastColor;
    const material = (refRaw && iComposition >= 0 ? cells[iComposition] : lastMaterial) || '';
    const sizeRaw = iSize >= 0 ? (cells[iSize] || '') : '';
    const size = sizeRaw ? convertSize(sizeRaw) : sizeRaw;
    const qty = iTotalUnits >= 0 ? parseInt(cells[iTotalUnits] || '0', 10) : iUnits >= 0 ? parseInt(cells[iUnits] || '1', 10) : 1;
    let ean = iEan >= 0 ? (cells[iEan] || '') : '';
    if (ean) ean = ean.replace(/\s/g, '').replace(/\./g, '').trim();
    const productKey = `${ref}-${color}`.toLowerCase().replace(/\s+/g, '-');

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: ref,
        name: `Tangerine - ${name || ref} - ${color}`.trim(),
        originalName: name,
        color,
        material,
        variants: [],
        suggestedBrand: brand.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }
    const p = products.get(productKey)!;
    p.variants.push({
      size: size || '',
      ean,
      quantity: qty,
      price: 0,
      rrp: 0,
    });
  }
  const list = Array.from(products.values());
  list.forEach((p) => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });
  return list;
}

function processTangerinePdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as TangerinePdfProduct[];
  if (!pdfProducts.length) {
    return { products: [], message: 'Geen producten in PDF gevonden.' };
  }

  const brand = context.findBrand('tangerine');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfProducts) {
    const ref = item.reference.trim();
    const productKey = `${ref}-${(item.color || '').trim()}`.toLowerCase().replace(/\s+/g, '-');
    const productName = `Tangerine - ${item.name || ref} - ${item.color || ''}`.trim();

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: ref,
        name: productName,
        originalName: item.name,
        color: item.color || '',
        material: '',
        variants: [],
        suggestedBrand: brand?.name || 'Tangerine',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(productKey)!;
    const size = item.size ? convertSize(item.size) : item.size;
    product.variants.push({
      size: size || '',
      ean: item.ean || '',
      sku: item.sku || undefined,
      quantity: item.quantity,
      price: item.price,
      rrp: item.rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return {
    products: productList,
    message: `${productList.length} producten uit Tangerine PDF geladen.`,
  };
}

const tangerine: SupplierPlugin = {
  id: 'tangerine',
  displayName: 'Tangerine',
  brandName: 'Tangerine',

  fileInputs: [
    { id: 'packing_pdf', label: 'Packing list PDF (BABETTE PACKING LIST - TANGERINE SS26)', accept: '.pdf', required: false, type: 'pdf' },
    { id: 'packing_csv', label: 'Packing list CSV (als PDF niet leesbaar is)', accept: '.csv,.txt', required: false, type: 'csv' },
    { id: 'price_pdf', label: 'Prijzen PDF (IMT 100% Babette SS26 Tangerine)', accept: '.pdf', required: false, type: 'pdf' },
  ],

  serverSideFileInputs: ['packing_pdf', 'price_pdf'],
  pdfParseEndpoint: '/api/parse-tangerine-pdf',

  parse(files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
    const pasted = files['packing_pasted'];
    const pastedStr = typeof pasted === 'string' ? pasted : Array.isArray(pasted) ? pasted[0] : '';
    if (pastedStr && pastedStr.trim()) return parsePackingPastedText(pastedStr);
    const csv = files['packing_csv'];
    const text = typeof csv === 'string' ? csv : Array.isArray(csv) ? csv[0] : '';
    if (text && text.trim()) return parsePackingCsv(text);
    return [];
  },

  processPdfResults: processTangerinePdfResults,

  imageMatching: {
    strategy: 'filename-pattern',
    extractReference: (filename: string) => extractReferenceFromFilename(filename),
  },

  imageUpload: {
    enabled: true,
    instructions: 'Selecteer de hoofdmap van de afbeeldingen (bijv. Flats Lays Photos - SS26). Elke submap is een product (TG-622, TG-623, …). Bestanden in de submap (FRONT, BACK, …) worden automatisch aan dat product gekoppeld.',
    exampleFilenames: ['TG_622_FRONT.jpg', 'TG_622_BACK.jpg', 'TG-789 BLUE/TG_789_BLUE_FRONT.png'],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: (filename: string, relativePath?: string) => {
      if (relativePath) {
        const fromPath = extractReferenceFromPath(relativePath);
        if (fromPath) return fromPath;
      }
      return extractReferenceFromFilename(filename);
    },
  },
};

export default tangerine;
