/**
 * Helpers for exporting Odoo sale quotations (offertes) to Excel.
 */

export type QuotationRef =
  | { kind: 'id'; id: number }
  | { kind: 'name'; name: string };

/**
 * Parse a quotation id, name (e.g. S03167), or Odoo sales URL.
 */
export function parseQuotationRef(raw: string): QuotationRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/(?:odoo\/)?sales\/(\d+)\b/i)
    ?? trimmed.match(/\/sale\.order\/(\d+)\b/i)
    ?? trimmed.match(/[?&]id=(\d+)\b/i);
  if (urlMatch) {
    const id = Number(urlMatch[1]);
    return Number.isFinite(id) && id > 0 ? { kind: 'id', id } : null;
  }

  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return id > 0 ? { kind: 'id', id } : null;
  }

  // Quotation / SO names like S03167, SO03167
  if (/^[A-Za-z]{1,4}\d+$/.test(trimmed)) {
    return { kind: 'name', name: trimmed.toUpperCase() };
  }

  return { kind: 'name', name: trimmed };
}

/**
 * Brand prefix from display names like "Ao76 - Samuel rain jacket (4 jaar)".
 */
export function extractBrandFromProductName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const sep = trimmed.indexOf(' - ');
  if (sep <= 0) return '';
  return trimmed.slice(0, sep).trim();
}

/** Product name without leading "Brand - " for secondary sort. */
export function productNameWithoutBrand(name: string, brand: string): string {
  const trimmed = (name || '').trim();
  if (!brand) return trimmed;
  const prefix = `${brand} - `;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

export type SortableQuotationLine = {
  brand: string;
  productName: string;
};

/**
 * Sort by brand (case-insensitive), then product name without brand prefix.
 */
export function compareQuotationLines(
  a: SortableQuotationLine,
  b: SortableQuotationLine,
): number {
  const brandCmp = a.brand.localeCompare(b.brand, 'nl', { sensitivity: 'base' });
  if (brandCmp !== 0) return brandCmp;
  const nameA = productNameWithoutBrand(a.productName, a.brand);
  const nameB = productNameWithoutBrand(b.productName, b.brand);
  return nameA.localeCompare(nameB, 'nl', { sensitivity: 'base' });
}

export function sortQuotationLines<T extends SortableQuotationLine>(lines: T[]): T[] {
  return [...lines].sort(compareQuotationLines);
}
