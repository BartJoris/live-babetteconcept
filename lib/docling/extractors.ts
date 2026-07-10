import type {
  DoclingDocument,
  DoclingTable,
  DoclingTableCell,
} from './types';
import type { ParsedProduct, ProductVariant } from '@/lib/suppliers/types';

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
  pageNo: number;
}

export interface ExtractedImage {
  base64?: string;
  uri?: string;
  classification?: string;
  description?: string;
  pageNo: number;
}

export function extractTablesFromDocument(doc: DoclingDocument): ExtractedTable[] {
  return doc.tables.map((table: DoclingTable) => {
    const { num_rows, num_cols, table_cells } = table.data;

    const grid: string[][] = Array.from({ length: num_rows }, () =>
      Array.from({ length: num_cols }, () => '')
    );

    for (const cell of table_cells) {
      for (let r = cell.start_row_offset_idx; r < cell.end_row_offset_idx; r++) {
        for (let c = cell.start_col_offset_idx; c < cell.end_col_offset_idx; c++) {
          grid[r][c] = cell.text;
        }
      }
    }

    const headerCells = table_cells.filter(
      (c: DoclingTableCell) => c.column_header
    );
    let headerRowCount = 0;
    if (headerCells.length > 0) {
      headerRowCount = Math.max(
        ...headerCells.map((c: DoclingTableCell) => c.end_row_offset_idx)
      );
    }

    const headers =
      headerRowCount > 0
        ? grid[headerRowCount - 1]
        : grid[0] ?? [];

    const dataStartRow = headerRowCount > 0 ? headerRowCount : 1;
    const rows = grid.slice(dataStartRow);

    const pageNo =
      table.prov.length > 0 ? table.prov[0].page_no : 0;

    return { headers, rows, pageNo };
  });
}

export function extractImagesFromDocument(doc: DoclingDocument): ExtractedImage[] {
  return doc.pictures.map((pic) => {
    const pageNo = pic.prov.length > 0 ? pic.prov[0].page_no : 0;

    return {
      base64: pic.data.image?.base64,
      uri: pic.data.image?.uri,
      classification: pic.data.classification,
      description: pic.data.description,
      pageNo,
    };
  });
}

export function tableToProducts(
  table: ExtractedTable,
  columnMapping: Record<string, string>
): ParsedProduct[] {
  const { headers, rows } = table;

  const colIndex = (field: string): number => {
    const headerName = columnMapping[field];
    if (!headerName) return -1;
    return headers.findIndex(
      (h) => h.toLowerCase().trim() === headerName.toLowerCase().trim()
    );
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

export function suggestColumnMapping(
  headers: string[]
): Record<string, string | null> {
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
