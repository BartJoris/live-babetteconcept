/**
 * Generic spreadsheet-like file parsing (.xlsx, .xls, .numbers, .ods).
 *
 * Uses SheetJS (the `xlsx` package) purely for reading, since it's the only
 * library that can natively parse Apple Numbers files (Numbers 3.0+ / iWork
 * 2013+, i.e. the modern IWA-based format) in plain JavaScript — no Python,
 * no external service, works in the browser and in a Vercel Function alike.
 *
 * Note: this is installed from the SheetJS CDN tarball, not the npm registry
 * — see the `xlsx` entry in package.json for why (the registry copy is a
 * stale, vulnerable 0.18.5 that was previously removed for exactly that
 * reason; this module only ever calls the read APIs).
 */
import type { ParsedProduct, ProductVariant } from '@/lib/suppliers/types';

export interface ExtractedTable {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

/** Parse any SheetJS-readable spreadsheet buffer into one table per sheet. */
export async function parseSpreadsheetFile(data: ArrayBuffer): Promise<ExtractedTable[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type: 'array' });

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    const [headerRow, ...dataRows] = grid;
    const headers = (headerRow ?? []).map((h) => String(h ?? '').trim());
    while (headers.length > 0 && headers[headers.length - 1] === '') {
      headers.pop();
    }
    const rows = dataRows.map((row) => headers.map((_, i) => String(row[i] ?? '').trim()));

    return { sheetName, headers, rows };
  }).filter((table) => table.headers.length > 0);
}

/**
 * Serialize a parsed table back to delimited text, so binary spreadsheet
 * formats (.xlsx, .numbers, .ods) can be routed through the same text-based
 * `SupplierPlugin.parse()` / `parseCSV()` pipeline used for real CSV files.
 */
export function tableToDelimitedText(
  table: Pick<ExtractedTable, 'headers' | 'rows'>,
  delimiter = ';',
): string {
  const escapeCell = (value: string): string => {
    const needsQuoting = value.includes(delimiter) || value.includes('"') || value.includes('\n');
    return needsQuoting ? `"${value.replace(/"/g, '""')}"` : value;
  };

  return [table.headers, ...table.rows]
    .map((row) => row.map(escapeCell).join(delimiter))
    .join('\n');
}

const PRODUCT_FIELD_PATTERNS: Record<string, RegExp> = {
  reference: /\b(ref|art\.?\s*n[ro]|sku|code|artikel|product.?code|style)\b/i,
  name: /\b(name|desc|description|product|artikel|omschrijving|bezeichnung)\b/i,
  price: /\b(price|cost|prijs|prix|preis|inkoop|wholesale)\b/i,
  rrp: /\b(rrp|retail|advies|vk|verkoop|msrp|uvp|pvp)\b/i,
  ean: /\b(ean|barcode|gtin|upc)\b/i,
  size: /\b(size|maat|taille|gr[öo][ßs]e|sz)\b/i,
  color: /\b(colo[u]?r|kleur|couleur|farbe)\b/i,
  material: /\b(material|composition|samenstelling|stof|fabric)\b/i,
  quantity: /\b(qty|quantity|aantal|quantit[ée]|menge|stock)\b/i,
};

export function suggestColumnMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};

  for (const [field, pattern] of Object.entries(PRODUCT_FIELD_PATTERNS)) {
    const match = headers.find((h) => pattern.test(h));
    mapping[field] = match ?? null;
  }

  return mapping;
}

function parsePrice(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value
    .replace(/[€$£\s]/g, '')
    .replace(/\.(\d{3})/g, '$1')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function tableToProducts(
  table: Pick<ExtractedTable, 'headers' | 'rows'>,
  columnMapping: Record<string, string>,
): ParsedProduct[] {
  const { headers, rows } = table;

  const colIndex = (field: string): number => {
    const headerName = columnMapping[field];
    if (!headerName) return -1;
    return headers.findIndex((h) => h.toLowerCase().trim() === headerName.toLowerCase().trim());
  };

  const refIdx = colIndex('reference');
  const nameIdx = colIndex('name');
  const colorIdx = colIndex('color');
  const materialIdx = colIndex('material');
  const sizeIdx = colIndex('size');
  const priceIdx = colIndex('price');
  const rrpIdx = colIndex('rrp');
  const eanIdx = colIndex('ean');
  const quantityIdx = colIndex('quantity');

  const productMap = new Map<string, ParsedProduct>();

  for (const row of rows) {
    const ref = refIdx >= 0 ? row[refIdx]?.trim() : '';
    if (!ref) continue;

    const size = sizeIdx >= 0 ? row[sizeIdx]?.trim() ?? '' : '';
    const price = priceIdx >= 0 ? parsePrice(row[priceIdx]) : 0;
    const rrp = rrpIdx >= 0 ? parsePrice(row[rrpIdx]) : price;
    const ean = eanIdx >= 0 ? row[eanIdx]?.trim() ?? '' : '';
    const quantity = quantityIdx >= 0 ? parseInt(row[quantityIdx], 10) || 1 : 1;

    const variant: ProductVariant = { size, quantity, ean, price, rrp };

    const existing = productMap.get(ref);
    if (existing) {
      existing.variants.push(variant);
    } else {
      productMap.set(ref, {
        reference: ref,
        name: nameIdx >= 0 ? row[nameIdx]?.trim() ?? ref : ref,
        material: materialIdx >= 0 ? row[materialIdx]?.trim() ?? '' : '',
        color: colorIdx >= 0 ? row[colorIdx]?.trim() ?? '' : '',
        variants: [variant],
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: false,
      });
    }
  }

  return Array.from(productMap.values());
}
