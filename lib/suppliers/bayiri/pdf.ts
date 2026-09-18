export interface BayiriPdfProduct {
  styleRef: string;
  description: string;
  color: string;
  section: string;
  sizes: Array<{ size: string; quantity: number }>;
  totalPieces: number;
  wholesalePrice: number;
  totalWholesale: number;
  suggestedPvp: number;
}

export interface BayiriLayoutItem {
  str: string;
  x: number;
  y: number;
}

export const STYLE_REF_RE = /([a-z]+(?:\.[a-z]+)*\.\d{2}\.\d{2})/i;

const SIZE_LABELS = [
  'ONE SIZE',
  '0-6M',
  '6-12M',
  '1-3Y',
  '3-6Y',
  '3M',
  '6M',
  '12M',
  '18M',
  '2Y',
  '3Y',
  '4Y',
  '6Y',
];

const SIZE_TOKEN_RE = new RegExp(
  `\\b(${SIZE_LABELS.map((s) => s.replace(/[-()/]/g, '\\$&')).join('|')})\\b`,
  'gi',
);

const SIZE_RANGE_RE =
  /\b\d+\s*M\s*(?:-|–|to)\s*\d+\s*[MY]\b|\b\d+\s*-\s*\d+\s*[MY]\b|\bU\s*\([^)]+\)|\bONE\s*SIZE\b/gi;

const ROW_Y_TOLERANCE = 6;
const HEADER_Y_TOLERANCE = 8;
const SIZE_COL_MAX_DX = 12;
const TOTAL_COLUMN_X = 450;

function isHeaderLine(line: string): boolean {
  return /^(IMG\.?|STYLE\s*REF)/i.test(line) || /WHOLESALE\s*PRICE/i.test(line);
}

function isOneSizeBlock(text: string): boolean {
  return /\bU\s*\(/i.test(text) || /\bONE\s*SIZE\b/i.test(text) || /90\s*[x×]\s*90/i.test(text);
}

function parseEuroAmounts(text: string): number[] {
  const amounts: number[] = [];
  const euroRe = /€\s*([\d]+[.,]\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = euroRe.exec(text)) !== null) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (val > 0 && val < 100000) amounts.push(val);
  }
  return amounts;
}

function clusterRows(items: BayiriLayoutItem[]): BayiriLayoutItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: BayiriLayoutItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - item.y) <= ROW_Y_TOLERANCE);
    if (row) row.push(item);
    else rows.push([item]);
  }
  rows.forEach((row) => row.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => a[0].y - b[0].y);
  return rows;
}

function rowText(row: BayiriLayoutItem[]): string {
  return row.map((i) => i.str).join(' ');
}

function normalizeSizeLabel(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  if (s === 'ONE' || s === 'SIZE' || s === 'ONE SIZE') return 'ONE SIZE';
  return SIZE_LABELS.find((label) => label === s) || null;
}

function sizeColumnsFromHeader(row: BayiriLayoutItem[]): Array<{ size: string; x: number }> {
  const sorted = [...row].sort((a, b) => a.x - b.x || a.y - b.y);
  const cols: Array<{ size: string; x: number }> = [];
  let hasOneSize = false;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (/^ONE$/i.test(cur.str) && next && /^SIZE$/i.test(next.str) && Math.abs(next.x - cur.x) < 8) {
      cols.push({ size: 'ONE SIZE', x: (cur.x + next.x) / 2 });
      hasOneSize = true;
      i++;
      continue;
    }
    if (/^(ONE|SIZE)$/i.test(cur.str)) {
      if (!hasOneSize) {
        cols.push({ size: 'ONE SIZE', x: cur.x });
        hasOneSize = true;
      }
      continue;
    }
    const label = normalizeSizeLabel(cur.str);
    if (label && label !== 'ONE SIZE') cols.push({ size: label, x: cur.x });
  }
  return cols;
}

function sizeHeadersFromItems(items: BayiriLayoutItem[]): Array<{ y: number; columns: Array<{ size: string; x: number }> }> {
  const headers: Array<{ y: number; columns: Array<{ size: string; x: number }> }> = [];
  for (const item of items) {
    if (!/STYLE\s*REF/i.test(item.str)) continue;
    const nearby = items.filter((other) => Math.abs(other.y - item.y) <= HEADER_Y_TOLERANCE);
    const columns = sizeColumnsFromHeader(nearby);
    if (columns.length >= 3) headers.push({ y: item.y, columns });
  }
  return headers.sort((a, b) => a.y - b.y);
}

function sizeColumnsForRow(
  rowY: number,
  headers: Array<{ y: number; columns: Array<{ size: string; x: number }> }>,
): Array<{ size: string; x: number }> {
  let best = headers[0];
  for (const header of headers) {
    if (header.y <= rowY + HEADER_Y_TOLERANCE) best = header;
  }
  return best?.columns || [];
}

function nearestSizeColumn(
  x: number,
  columns: Array<{ size: string; x: number }>,
): { size: string; x: number } | null {
  let best: { size: string; x: number } | null = null;
  let bestDx = SIZE_COL_MAX_DX;
  for (const col of columns) {
    const dx = Math.abs(col.x - x);
    if (dx <= bestDx) {
      best = col;
      bestDx = dx;
    }
  }
  return best;
}

type MetaHeader = {
  y: number;
  descriptionX: number;
  colorX: number;
  sizeRangeX: number;
};

function metaHeadersFromItems(items: BayiriLayoutItem[]): MetaHeader[] {
  const headers: MetaHeader[] = [];
  for (const item of items) {
    if (!/STYLE\s*REF/i.test(item.str)) continue;
    const nearby = items.filter((other) => Math.abs(other.y - item.y) <= HEADER_Y_TOLERANCE);
    const description = nearby.find((cell) => /^DESCRIPTION$/i.test(cell.str));
    const color = nearby.find((cell) => /^COLOR$/i.test(cell.str));
    const sizeRange = nearby.find((cell) => /^SIZE\s*RANGE$/i.test(cell.str));
    if (!description || !color || !sizeRange) continue;
    headers.push({
      y: item.y,
      descriptionX: description.x,
      colorX: color.x,
      sizeRangeX: sizeRange.x,
    });
  }
  return headers.sort((a, b) => a.y - b.y);
}

function metaForRow(rowY: number, headers: MetaHeader[]): MetaHeader | undefined {
  let best = headers[0];
  for (const header of headers) {
    if (header.y <= rowY + HEADER_Y_TOLERANCE) best = header;
  }
  return best;
}

function joinCellsInBand(row: BayiriLayoutItem[], minX: number, maxX: number): string {
  const parts: string[] = [];
  const sorted = [...row].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const cell of sorted) {
    if (cell.x < minX || cell.x >= maxX) continue;
    if (STYLE_REF_RE.test(cell.str)) continue;
    if (/^\d{1,2}$/.test(cell.str)) continue;
    if (/^€/.test(cell.str) || /^\d+[.,]\d{2}$/.test(cell.str)) continue;
    if (parts[parts.length - 1] === cell.str) continue;
    parts.push(cell.str);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function isPlausibleBayiriColor(value: string): boolean {
  const color = value.trim();
  if (!color || color.length > 48) return false;
  if (/€/.test(color)) return false;
  if (STYLE_REF_RE.test(color)) return false;
  if (/\d+\s*(?:-|–|to)\s*\d+\s*[MY]/i.test(color)) return false;
  if (/\b\d+\s+\d+\b/.test(color)) return false;
  return true;
}

/**
 * Map Bayiri order-form cells by x-position so 3M=1 and 6M=1 become two variants.
 */
export function extractBayiriProductsFromLayout(items: BayiriLayoutItem[]): BayiriPdfProduct[] {
  const visible = items.filter((i) => i.str);
  const rows = clusterRows(visible);
  const headers = sizeHeadersFromItems(visible);
  const metaHeaders = metaHeadersFromItems(visible);
  const products: BayiriPdfProduct[] = [];
  let currentSection = 'BABY';

  for (const row of rows) {
    const text = rowText(row);
    if (/KIDS?\s*:/i.test(text)) currentSection = 'KIDS';
    if (/BABY\s*:/i.test(text)) currentSection = 'BABY';

    const refItem = row.find((i) => STYLE_REF_RE.test(i.str));
    if (!refItem) continue;
    const styleRef = (refItem.str.match(STYLE_REF_RE)?.[1] || '').toLowerCase();
    if (!styleRef) continue;

    const euroPrices = parseEuroAmounts(text);
    const wholesalePrice = euroPrices[0] || 0;
    const totalWholesale = euroPrices.length >= 2 ? euroPrices[1] : 0;
    const sizeColumns = sizeColumnsForRow(refItem.y, headers);
    const meta = metaForRow(refItem.y, metaHeaders);

    const sizes: Array<{ size: string; quantity: number }> = [];
    let totalPieces = 0;

    for (const cell of row) {
      if (!/^\d{1,2}$/.test(cell.str)) continue;
      const qty = parseInt(cell.str, 10);
      if (qty <= 0) continue;
      if (cell.x < refItem.x + 20) continue;
      if (cell.x >= TOTAL_COLUMN_X) {
        if (totalPieces === 0) totalPieces = qty;
        continue;
      }
      const col = nearestSizeColumn(cell.x, sizeColumns);
      if (!col) continue;
      const existing = sizes.find((s) => s.size === col.size);
      if (existing) existing.quantity += qty;
      else sizes.push({ size: col.size === 'ONE SIZE' ? 'U' : col.size, quantity: qty });
    }

    if (sizes.length === 0 && /\bU\s*\(|\bONE\s*SIZE\b|90\s*[x×]\s*90/i.test(text)) {
      const qtyCells = row.filter(
        (cell) => /^\d{1,2}$/.test(cell.str) && cell.x >= refItem.x + 20 && cell.x < TOTAL_COLUMN_X,
      );
      const unitQty = qtyCells.reduce((sum, cell) => sum + parseInt(cell.str, 10), 0);
      if (unitQty > 0) sizes.push({ size: 'U', quantity: unitQty });
    }

    if (totalPieces === 0) {
      totalPieces = sizes.reduce((sum, s) => sum + s.quantity, 0);
    }
    if (totalPieces === 0 && totalWholesale > 0 && wholesalePrice > 0) {
      totalPieces = Math.round(totalWholesale / wholesalePrice);
    }

    const nameParts = styleRef
      .split('.')
      .filter((part) => !/^\d+$/.test(part) && part !== 'baby' && part !== 'kid');
    const metaCells = visible.filter((item) => Math.abs(item.y - refItem.y) <= HEADER_Y_TOLERANCE);
    const layoutDescription = meta
      ? joinCellsInBand(metaCells, meta.descriptionX - 12, meta.colorX - 6)
      : '';
    const layoutColor = meta
      ? joinCellsInBand(metaCells, meta.colorX - 8, meta.sizeRangeX - 6)
      : '';

    products.push({
      styleRef,
      description: layoutDescription || nameParts.join(' ').toUpperCase(),
      color: isPlausibleBayiriColor(layoutColor) ? layoutColor : '',
      section: currentSection,
      sizes,
      totalPieces,
      wholesalePrice,
      totalWholesale,
      suggestedPvp: 0,
    });
  }

  return products;
}

/**
 * Fallback when layout extraction is unavailable: flattened PDF text.
 * Cannot recover which size columns were filled.
 */
export function extractBayiriProducts(pdfText: string): BayiriPdfProduct[] {
  const lines = pdfText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const products: BayiriPdfProduct[] = [];
  let currentSection = 'BABY';

  const styleRefPositions: Array<{ index: number; ref: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (/KIDS?\s*:/i.test(lines[i])) {
      styleRefPositions.push({ index: i, ref: '__KIDS_SECTION__' });
    }
    if (isHeaderLine(lines[i])) continue;
    const m = lines[i].match(STYLE_REF_RE);
    if (m && /\.\d{2}\.\d{2}$/.test(m[1].toLowerCase())) {
      styleRefPositions.push({ index: i, ref: m[1].toLowerCase() });
    }
  }

  for (let p = 0; p < styleRefPositions.length; p++) {
    const pos = styleRefPositions[p];
    if (pos.ref.startsWith('__')) {
      if (pos.ref === '__KIDS_SECTION__') currentSection = 'KIDS';
      continue;
    }

    const styleRef = pos.ref;
    const lineIdx = pos.index;
    const nextPos = styleRefPositions.find((x, xi) => xi > p && !x.ref.startsWith('__'));
    const blockEnd = nextPos ? nextPos.index : Math.min(lines.length, lineIdx + 12);
    const blockLines = lines.slice(lineIdx, blockEnd).filter((l) => !isHeaderLine(l));
    const blockText = blockLines.join(' ');

    const euroPrices = parseEuroAmounts(blockText);
    const wholesalePrice = euroPrices[0] || 0;
    const totalWholesale = euroPrices.length >= 2 ? euroPrices[1] : 0;

    let totalPieces = 0;
    const totalMatch = blockText.match(/\b(\d{1,2})\s*€/);
    if (totalMatch) totalPieces = parseInt(totalMatch[1], 10);
    if (totalPieces === 0 && totalWholesale > 0 && wholesalePrice > 0) {
      totalPieces = Math.round(totalWholesale / wholesalePrice);
    }

    const withoutRef = blockText.replace(STYLE_REF_RE, ' ');
    const withoutRange = withoutRef.replace(SIZE_RANGE_RE, ' ');
    const foundSizes: string[] = [];
    let sizeMatch: RegExpExecArray | null;
    SIZE_TOKEN_RE.lastIndex = 0;
    while ((sizeMatch = SIZE_TOKEN_RE.exec(withoutRange)) !== null) {
      const sizeToken = sizeMatch[1].toUpperCase();
      if (!foundSizes.includes(sizeToken)) foundSizes.push(sizeToken);
    }
    SIZE_TOKEN_RE.lastIndex = 0;

    const sizeQuantities: Array<{ size: string; quantity: number }> = [];
    if (isOneSizeBlock(blockText) && totalPieces > 0) {
      sizeQuantities.push({ size: 'U', quantity: totalPieces });
    } else if (foundSizes.length > 0 && totalPieces > 0) {
      const useSizes = foundSizes.slice(0, totalPieces);
      const each = Math.max(1, Math.round(totalPieces / useSizes.length));
      let remaining = totalPieces;
      for (let i = 0; i < useSizes.length; i++) {
        const qty = i === useSizes.length - 1 ? remaining : Math.min(each, remaining);
        sizeQuantities.push({ size: useSizes[i], quantity: qty });
        remaining -= qty;
      }
    }

    const nameParts = styleRef
      .split('.')
      .filter((part) => !/^\d+$/.test(part) && part !== 'baby' && part !== 'kid');

    products.push({
      styleRef,
      description: nameParts.join(' ').toUpperCase(),
      color: '',
      section: currentSection,
      sizes: sizeQuantities,
      totalPieces,
      wholesalePrice,
      totalWholesale,
      suggestedPvp: 0,
    });
  }

  return products;
}
