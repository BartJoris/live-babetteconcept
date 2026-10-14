/**
 * Steiff supplier plugin.
 *
 * Import method:
 * 1. Invoice PDF (Margarete Steiff GmbH) — material, size cm, qty, net price
 * 2. Price list CSV (Artikelcode;EAN-code;Artikel omschrijving;Inkoopprijs;Adviesprijs)
 *
 * Material "014253" matches Artikelcode "66.014253". Soft toys use size "U".
 */

import { parseCSV, rowToObject } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { determineSizeAttribute } from '@/lib/import/shared/size-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  SupplierFiles,
  ParseContext,
  EnrichmentResult,
} from '@/lib/suppliers/types';
import type { SteiffInvoiceLine } from './pdf';
import { materialToArticleCode } from './pdf';

interface SteiffPriceRow {
  articleCode: string;
  ean: string;
  name: string;
  purchasePrice: number;
  rrp: number;
}

/** Cached price list so processPdfResults can enrich after PDF parse */
let cachedPrices = new Map<string, SteiffPriceRow>();

const RRP_FALLBACK_MULTIPLIER = 2.2;

function extractColorFromName(name: string): string {
  const withoutBrand = name.replace(/^Steiff\s*-\s*/i, '').trim();
  const comma = withoutBrand.lastIndexOf(',');
  if (comma === -1) return '';
  return withoutBrand.slice(comma + 1).trim();
}

function formatDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Steiff';
  if (/^Steiff\s*-/i.test(trimmed)) return trimmed;
  return `Steiff - ${trimmed}`;
}

function parsePricesCSV(text: string): Map<string, SteiffPriceRow> {
  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  if (headers.length === 0 || rows.length === 0) return new Map();

  const prices = new Map<string, SteiffPriceRow>();

  for (const values of rows) {
    const row = rowToObject(headers, values);
    const articleCode = (row['Artikelcode'] || '').trim();
    if (!articleCode) continue;

    const name = (row['Artikel omschrijving'] || '').trim();
    const ean = (row['EAN-code'] || row['EAN'] || '').trim();
    const purchasePrice = parseEuroPrice(row['Inkoopprijs'] || '');
    const rrp = parseEuroPrice(row['Adviesprijs'] || '');

    prices.set(articleCode, {
      articleCode,
      ean,
      name: formatDisplayName(name || articleCode),
      purchasePrice,
      rrp,
    });

    // Also index by bare material digits for robust lookup
    const digits = articleCode.replace(/^66\./, '');
    if (digits && digits !== articleCode) {
      prices.set(digits, prices.get(articleCode)!);
      prices.set(materialToArticleCode(digits), prices.get(articleCode)!);
    }
  }

  return prices;
}

function isSteiffPricesCSV(text: string): boolean {
  const header = text.split(/\r?\n/)[0]?.toLowerCase() || '';
  return (
    header.includes('artikelcode') &&
    header.includes('ean') &&
    (header.includes('adviesprijs') || header.includes('inkoopprijs')) &&
    (text.toLowerCase().includes('steiff') || header.includes('artikel omschrijving'))
  );
}

function lookupPrice(
  articleCode: string,
  material: string,
  prices: Map<string, SteiffPriceRow>,
): SteiffPriceRow | undefined {
  return (
    prices.get(articleCode) ||
    prices.get(materialToArticleCode(material)) ||
    prices.get(material) ||
    prices.get(material.padStart(6, '0'))
  );
}

function extractPdfLines(pdfDataRaw: string): SteiffInvoiceLine[] {
  try {
    const parsed = JSON.parse(pdfDataRaw);
    return (parsed.products || parsed || []) as SteiffInvoiceLine[];
  } catch {
    return [];
  }
}

function combineData(
  invoiceLines: SteiffInvoiceLine[],
  prices: Map<string, SteiffPriceRow>,
  context: ParseContext,
): ParsedProduct[] {
  const brand = context.findBrand('steiff');
  const products: ParsedProduct[] = [];

  for (const line of invoiceLines) {
    if (line.quantity <= 0) continue;

    const priceRow = lookupPrice(line.articleCode, line.material, prices);
    const reference = priceRow?.articleCode || line.articleCode || materialToArticleCode(line.material);
    const name = priceRow?.name || formatDisplayName(line.description || reference);
    const color = extractColorFromName(name) || extractColorFromName(line.description);
    const ean = priceRow?.ean || '';
    const price =
      line.netUnitPrice > 0
        ? line.netUnitPrice
        : priceRow?.purchasePrice || line.unitPrice || 0;
    const rrp =
      priceRow?.rrp ||
      (price > 0 ? Math.round(price * RRP_FALLBACK_MULTIPLIER * 100) / 100 : 0);

    const variants = [
      {
        size: 'U',
        quantity: line.quantity,
        ean,
        sku: reference,
        price,
        rrp,
      },
    ];

    products.push({
      reference,
      name,
      originalName: line.description || name.replace(/^Steiff\s*-\s*/i, ''),
      color,
      material: '',
      ecommerceDescription: name,
      variants,
      suggestedBrand: brand?.name || 'Steiff',
      selectedBrand: brand,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
      sizeAttribute: determineSizeAttribute(variants),
      rrpSource: priceRow?.rrp ? 'pdf' : 'fallback',
    });
  }

  return products;
}

function loadPriceCache(files: SupplierFiles): void {
  const pricesText = files['prices_csv'] as string | undefined;
  if (pricesText) {
    cachedPrices = parsePricesCSV(pricesText);
  } else if ('prices_csv' in files) {
    cachedPrices = new Map();
  }
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  loadPriceCache(files);

  const pdfDataRaw = files['pdf_invoice'] as string | undefined;
  if (!pdfDataRaw) return [];

  const invoiceLines = extractPdfLines(pdfDataRaw);
  if (!Array.isArray(invoiceLines) || invoiceLines.length === 0) return [];

  return combineData(invoiceLines, cachedPrices, context);
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const invoiceLines = (pdfData.products || []) as SteiffInvoiceLine[];
  if (!invoiceLines.length) {
    return { products: [], message: 'Geen producten gevonden in de Steiff factuur.' };
  }

  const products = combineData(invoiceLines, cachedPrices, context);
  const withEan = products.filter((p) => p.variants.some((v) => v.ean)).length;
  const withRrp = products.filter((p) => p.variants.some((v) => v.rrp > 0)).length;

  const hint =
    cachedPrices.size === 0
      ? ' Upload ook de prijslijst CSV voor EAN en adviesprijs.'
      : '';

  return {
    products,
    message: `${products.length} producten uit Steiff factuur (${withEan} met EAN, ${withRrp} met RRP).${hint}`,
  };
}

const steiffPlugin: SupplierPlugin = {
  id: 'steiff',
  displayName: 'Steiff',
  brandName: 'Steiff',
  fileInputs: [
    {
      id: 'pdf_invoice',
      label: 'Factuur PDF (Margarete Steiff)',
      accept: '.pdf',
      required: true,
      type: 'pdf',
    },
    {
      id: 'prices_csv',
      label: 'Prijslijst (CSV / Numbers / Excel — Artikelcode / EAN / Advies)',
      accept: '.csv,.numbers,.xlsx,.xls',
      required: false,
      type: 'xlsx',
    },
  ],
  fileDetection: [
    {
      fileInputId: 'prices_csv',
      detect: (text) => isSteiffPricesCSV(text),
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-steiff-pdf',
  processPdfResults,
  parse,
};

export default steiffPlugin;
export { isSteiffPricesCSV, parsePricesCSV };
