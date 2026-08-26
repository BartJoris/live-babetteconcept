import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';
import {
  matchArticleColor,
  type FubInvoiceLine,
  type FubOrderLine,
} from '@/lib/suppliers/fub/pdf';

/**
 * FUB CSV format (Margot's list):
 * - Delimiter: ;
 * - Header: Naam;Maten baby;Categorie;Description;Aankoopprijs;Verkoopprijs
 * - Descriptions contain newlines inside quoted fields
 * - Sizes: "62 = 3 maand, 68 = 6 maand, 74 = 9 maand, ..."
 * - Names: "FUB - Baby body (butter)"
 *
 * PDF-only (Order confirmation + optional Invoice):
 * - Order: EAN triplets + purchase price
 * - Invoice: composition + unit/RRP
 */

interface FubCsvProduct {
  name: string;
  sizes: string;
  category: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
}

let orderCache: FubOrderLine[] | null = null;
let invoiceCache: FubInvoiceLine[] | null = null;

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
  const pairs = sizeStr.split(',').map((s) => s.trim()).filter(Boolean);
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
    .replace(/\([^)]*\)\s*$/, '') // remove trailing (color)
    .replace(/\(\d+\s*(?:SS|AW|FW|PF)?\)/gi, '') // article codes
    .replace(/\b(?:SS|AW|FW|PF)\b/gi, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function matchKey(type: string, color: string): string {
  return `${type}|${color}`;
}

function displayName(articleName: string, color: string): string {
  const base = articleName.replace(/\s*\(\d+\s*(?:SS|AW|FW|PF)?\)\s*/i, ' ').trim();
  const colorPart = color ? ` (${color})` : '';
  return `FUB - ${base}${colorPart}`;
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

function buildFromCsv(
  csvProducts: FubCsvProduct[],
  orderProducts: FubOrderLine[] | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('fub');
  const products: ParsedProduct[] = [];

  const pdfByTypeColor = new Map<string, FubOrderLine>();
  const pdfByColor = new Map<string, FubOrderLine>();
  const pdfUsed = new Set<FubOrderLine>();
  if (orderProducts) {
    for (const pp of orderProducts) {
      const pdfType = normalizeProductType(pp.articleName);
      const pdfColor = pp.color.toLowerCase();
      pdfByTypeColor.set(matchKey(pdfType, pdfColor), pp);
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

    let pdfMatch = pdfByTypeColor.get(matchKey(csvType, color));
    if (!pdfMatch && color) {
      const colorMatch = pdfByColor.get(color);
      if (colorMatch && !pdfUsed.has(colorMatch)) {
        pdfMatch = colorMatch;
      }
    }
    if (pdfMatch) pdfUsed.add(pdfMatch);

    const variants = sizes.map((s) => {
      let ean = '';
      let qty = 1;
      if (pdfMatch) {
        const eanEntry = pdfMatch.eanBySize.find((e) => e.euSize === s.euSize);
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

function buildFromOrderAndInvoice(
  orderProducts: FubOrderLine[],
  invoiceProducts: FubInvoiceLine[] | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('fub');
  const invoiceByKey = new Map<string, FubInvoiceLine>();
  if (invoiceProducts) {
    for (const inv of invoiceProducts) {
      invoiceByKey.set(matchArticleColor(inv.articleCode, inv.color), inv);
    }
  }

  const products: ParsedProduct[] = [];

  for (const order of orderProducts) {
    if (!order.eanBySize.length) continue;

    const inv = invoiceByKey.get(matchArticleColor(order.articleCode, order.color));
    const material = inv?.composition || '';
    const unitPrice = order.unitPrice || inv?.unitPrice || 0;
    const rrp = inv?.rrp || 0;
    const name = displayName(order.articleName, order.color);
    const reference = generateReference(name);

    const variants = order.eanBySize.map((e) => ({
      size: convertSize(e.euSize),
      ean: e.ean,
      sku: `${reference}-${e.euSize}`,
      quantity: e.qty,
      price: unitPrice,
      rrp,
    }));

    const product: ParsedProduct = {
      reference,
      name,
      originalName: order.articleName,
      material,
      color: order.color,
      ecommerceDescription: material || undefined,
      variants,
      suggestedBrand: suggestedBrand?.name || 'FUB',
      selectedBrand: suggestedBrand,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
      rrpSource: inv?.rrp ? 'pdf' : undefined,
    };

    product.sizeAttribute = determineSizeAttribute(product.variants);
    products.push(product);
  }

  return products;
}

function readCachedProducts<T>(raw: unknown): T[] | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { products?: T[] };
    if (parsed && Array.isArray(parsed.products)) {
      return parsed.products;
    }
  } catch {
    // ignore
  }
  return null;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const csvText = files['main_csv'] as string | undefined;

  // Prefer live caches when processPdfResults already ran this session
  const orderProducts =
    orderCache || readCachedProducts<FubOrderLine>(files['pdf_order']);
  const invoiceProducts =
    invoiceCache || readCachedProducts<FubInvoiceLine>(files['pdf_invoice']);

  if (csvText) {
    const csvProducts = parseFubCSV(csvText);
    if (csvProducts.length > 0) {
      return buildFromCsv(csvProducts, orderProducts, context);
    }
  }

  if (orderProducts && orderProducts.length > 0) {
    return buildFromOrderAndInvoice(orderProducts, invoiceProducts, context);
  }

  return [];
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const kind = (pdfData.kind as string) || 'order';
  const productsPayload = (pdfData.products || []) as Array<Record<string, unknown>>;

  if (productsPayload.length === 0) {
    return {
      products: existingProducts,
      message: 'Geen producten gevonden in de FUB PDF.',
    };
  }

  if (kind === 'invoice') {
    invoiceCache = productsPayload as unknown as FubInvoiceLine[];
  } else {
    orderCache = productsPayload as unknown as FubOrderLine[];
  }

  // Rebuild from caches (order required for PDF-only; invoice enriches)
  if (orderCache && orderCache.length > 0) {
    const built = buildFromOrderAndInvoice(orderCache, invoiceCache, context);
    const eanCount = built.reduce((sum, p) => sum + p.variants.filter((v) => v.ean).length, 0);
    const rrpCount = built.filter((p) => p.variants.some((v) => v.rrp > 0)).length;
    const parts = [`${built.length} producten`, `${eanCount} EANs`];
    if (invoiceCache?.length) parts.push(`RRP op ${rrpCount}`);
    return {
      products: built,
      message: `${parts.join(', ')} uit FUB PDF.`,
    };
  }

  if (kind === 'invoice') {
    return {
      products: existingProducts,
      message: `${invoiceCache?.length || 0} factuurregels geladen. Upload ook de Order Confirmation voor EANs.`,
    };
  }

  return {
    products: existingProducts,
    message: `${orderCache?.length || 0} orderregels geladen. Upload de FUB CSV of Invoice voor RRP.`,
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
    {
      id: 'main_csv',
      label: 'FUB Product CSV (optioneel)',
      accept: '.csv',
      required: false,
      type: 'csv',
    },
    {
      id: 'pdf_order',
      label: 'FUB Order Confirmation PDF',
      accept: '.pdf',
      required: false,
      type: 'pdf',
    },
    {
      id: 'pdf_invoice',
      label: 'FUB Invoice PDF (optioneel - RRP + materiaal)',
      accept: '.pdf',
      required: false,
      type: 'pdf',
    },
  ],
  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) => isFubCSV(text),
    },
    {
      fileInputId: 'pdf_order',
      detect: (_text, filename) => {
        const l = (filename || '').toLowerCase();
        return l.includes('fub') && (l.includes('order') || l.includes('confirmation'));
      },
    },
    {
      fileInputId: 'pdf_invoice',
      detect: (_text, filename) => {
        const l = (filename || '').toLowerCase();
        return l.includes('fub') && (l.includes('invoice') || l.includes('factuur'));
      },
    },
  ],
  serverSideFileInputs: ['pdf_order', 'pdf_invoice'],
  pdfParseEndpoint: '/api/parse-fub-pdf',
  parse,
  processPdfResults,
};

export default fubPlugin;

/** Test helpers */
export const __test__ = {
  buildFromOrderAndInvoice,
  buildFromCsv,
  resetCaches: () => {
    orderCache = null;
    invoiceCache = null;
  },
  setCaches: (order: FubOrderLine[] | null, invoice: FubInvoiceLine[] | null) => {
    orderCache = order;
    invoiceCache = invoice;
  },
};
