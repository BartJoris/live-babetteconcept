import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { determineSizeAttribute } from '@/lib/import/shared/size-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

/**
 * FUB CSV format (Margot's list):
 * - Delimiter: ;
 * - Header: Naam;Maten baby;Categorie;Description;Aankoopprijs;Verkoopprijs
 * - Descriptions contain newlines inside quoted fields
 * - Sizes: "62 = 3 maand, 68 = 6 maand, 74 = 9 maand, ..."
 * - Names: "FUB - Baby body (butter)"
 */

interface FubCsvProduct {
  name: string;
  sizes: string;
  category: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
}

interface FubPdfProduct {
  articleName: string;
  color: string;
  totalQty: number;
  unitPrice: number;
  eanBySize: Array<{ euSize: string; qty: number; ean: string }>;
}

let pdfProductsCache: FubPdfProduct[] | null = null;

function parseQuotedCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ';') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }

  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

function parseSizeField(sizeStr: string): Array<{ euSize: string; displaySize: string }> {
  if (!sizeStr) return [];
  const pairs = sizeStr.split(',').map(s => s.trim()).filter(Boolean);
  const result: Array<{ euSize: string; displaySize: string }> = [];

  for (const pair of pairs) {
    const match = pair.match(/^(\d{2,3})\s*=\s*(.+)$/);
    if (match) {
      result.push({ euSize: match[1], displaySize: match[2].trim() });
    }
  }

  return result;
}

function extractColor(name: string): string {
  const match = name.match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim().toLowerCase() : '';
}

function extractMaterial(description: string): string {
  const match = description.match(/(\d+%\s+(?:certified\s+)?[a-z]+(?:\s+[a-z]+)*)/i);
  return match ? match[1] : '';
}

function generateReference(name: string): string {
  return name
    .replace(/^FUB\s*-\s*/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeProductType(name: string): string {
  return name
    .replace(/^FUB\s*-\s*/i, '')
    .replace(/\([^)]*\)\s*$/, '')       // remove trailing (color)
    .replace(/\(\d+\s*SS\)/gi, '')      // remove (4726 SS) article codes
    .replace(/\bSS\b/gi, '')            // remove standalone "SS"
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function matchKey(type: string, color: string): string {
  return `${type}|${color}`;
}

function parseFubCSV(text: string): FubCsvProduct[] {
  const rows = parseQuotedCSV(text);
  if (rows.length < 2) return [];

  const products: FubCsvProduct[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const name = cols[0]?.trim();
    if (!name || !name.toLowerCase().includes('fub')) continue;

    products.push({
      name,
      sizes: cols[1]?.trim() || '',
      category: cols[2]?.trim() || '',
      description: cols[3]?.trim() || '',
      purchasePrice: parseEuroPrice(cols[4]?.trim() || '0'),
      sellingPrice: parseEuroPrice(cols[5]?.trim() || '0'),
    });
  }

  return products;
}

function buildProducts(
  csvProducts: FubCsvProduct[],
  pdfProducts: FubPdfProduct[] | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('fub');
  const products: ParsedProduct[] = [];

  // Build lookup maps for PDF matching: (normalizedType|color) → pdfProduct
  const pdfByTypeColor = new Map<string, FubPdfProduct>();
  const pdfByColor = new Map<string, FubPdfProduct>();
  const pdfUsed = new Set<FubPdfProduct>();
  if (pdfProducts) {
    for (const pp of pdfProducts) {
      const pdfType = normalizeProductType(pp.articleName);
      const pdfColor = pp.color.toLowerCase();
      pdfByTypeColor.set(matchKey(pdfType, pdfColor), pp);
      // Only store first occurrence per color (fallback)
      if (!pdfByColor.has(pdfColor)) {
        pdfByColor.set(pdfColor, pp);
      }
    }
  }

  for (const csv of csvProducts) {
    const sizes = parseSizeField(csv.sizes);
    if (sizes.length === 0) continue;

    const color = extractColor(csv.name);
    const csvType = normalizeProductType(csv.name);
    const reference = generateReference(csv.name);
    const material = extractMaterial(csv.description);

    // Match: first by (type+color), then fallback to color-only
    let pdfMatch = pdfByTypeColor.get(matchKey(csvType, color));
    if (!pdfMatch && color) {
      // Fallback: try color-only but only if not already used
      const colorMatch = pdfByColor.get(color);
      if (colorMatch && !pdfUsed.has(colorMatch)) {
        pdfMatch = colorMatch;
      }
    }
    if (pdfMatch) pdfUsed.add(pdfMatch);

    const variants = sizes.map(s => {
      let ean = '';
      let qty = 1;
      if (pdfMatch) {
        const eanEntry = pdfMatch.eanBySize.find(e => e.euSize === s.euSize);
        if (eanEntry) {
          ean = eanEntry.ean;
          qty = eanEntry.qty;
        }
      }

      return {
        size: s.displaySize,
        ean,
        sku: `${reference}-${s.euSize}`,
        quantity: qty,
        price: csv.purchasePrice,
        rrp: csv.sellingPrice,
      };
    });

    const product: ParsedProduct = {
      reference,
      name: csv.name,
      originalName: csv.name.replace(/^FUB\s*-\s*/i, '').trim(),
      material,
      color,
      ecommerceDescription: csv.description,
      csvCategory: csv.category,
      variants,
      suggestedBrand: suggestedBrand?.name,
      selectedBrand: suggestedBrand,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
    };

    product.sizeAttribute = determineSizeAttribute(product.variants);
    products.push(product);
  }

  return products;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const csvText = files['main_csv'] as string;
  if (!csvText) return [];

  const csvProducts = parseFubCSV(csvText);
  if (csvProducts.length === 0) return [];

  return buildProducts(csvProducts, pdfProductsCache, context);
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as FubPdfProduct[];
  if (pdfProducts.length === 0) {
    return { products: existingProducts, message: 'Geen producten gevonden in de FUB PDF.' };
  }

  pdfProductsCache = pdfProducts;

  if (existingProducts.length === 0) {
    return {
      products: existingProducts,
      message: `${pdfProducts.length} producten met EAN codes geladen uit PDF. Upload de FUB CSV voor productdata.`,
    };
  }

  // Re-build products with EAN enrichment
  const csvProducts = existingProducts.map(p => ({
    name: p.name,
    sizes: p.variants.map(v => {
      const euMatch = v.sku?.match(/-(\d{2,3})$/);
      return euMatch ? `${euMatch[1]} = ${v.size}` : v.size;
    }).join(', '),
    category: p.csvCategory || '',
    description: p.ecommerceDescription || '',
    purchasePrice: p.variants[0]?.price || 0,
    sellingPrice: p.variants[0]?.rrp || 0,
  }));

  const enriched = buildProducts(csvProducts, pdfProducts, context);

  const eanCount = enriched.reduce((sum, p) => sum + p.variants.filter(v => v.ean).length, 0);
  return {
    products: enriched,
    message: `${eanCount} EAN codes toegevoegd uit de PDF aan ${enriched.length} producten.`,
  };
}

function isFubCSV(text: string): boolean {
  const first200 = text.substring(0, 200).toLowerCase();
  return first200.includes('fub') && (first200.includes('maten') || first200.includes('aankoopprijs'));
}

const fubPlugin: SupplierPlugin = {
  id: 'fub',
  displayName: 'FUB',
  brandName: 'FUB',
  fileInputs: [
    { id: 'main_csv', label: 'FUB Product CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'pdf_order', label: 'FUB Order PDF (optioneel - EAN codes)', accept: '.pdf', required: false, type: 'pdf' },
  ],
  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) => isFubCSV(text),
    },
  ],
  serverSideFileInputs: ['pdf_order'],
  pdfParseEndpoint: '/api/parse-fub-pdf',
  parse,
  processPdfResults,
};

export default fubPlugin;
