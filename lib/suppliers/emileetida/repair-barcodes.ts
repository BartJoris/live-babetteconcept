import { parseCSV, findHeader, parseEuroPrice, mapSizeToOdooFormat } from '@/lib/import/shared';
import { convertEmileetidaSize } from '@/lib/suppliers/emileetida/sizes';

export type EmileetidaBarcodeRepairRow = {
  productRef: string;
  colorName: string;
  productName: string;
  sizeRaw: string;
  sizeOdoo: string;
  ean: string;
  quantity: number;
  price: number;
  rrp: number;
};

/**
 * Parse Emile order CSV rows used to backfill missing Odoo barcodes.
 */
export function parseEmileetidaRepairRows(text: string): EmileetidaBarcodeRepairRow[] {
  const { headers, rows } = parseCSV(text, { delimiter: ';' });
  const productNameIdx = findHeader(headers, 'product name');
  const productRefIdx = findHeader(headers, 'product reference');
  const colorNameIdx = findHeader(headers, 'color name');
  const sizeNameIdx = findHeader(headers, 'size name');
  const ean13Idx = findHeader(headers, 'ean13');
  const quantityIdx = findHeader(headers, 'quantity');
  const unitPriceIdx = findHeader(headers, 'unit price');

  if (productRefIdx === -1 || ean13Idx === -1 || sizeNameIdx === -1) {
    return [];
  }

  const out: EmileetidaBarcodeRepairRow[] = [];
  for (const values of rows) {
    const productRef = values[productRefIdx]?.trim() || '';
    const ean = values[ean13Idx]?.trim() || '';
    const sizeRaw = values[sizeNameIdx]?.trim() || '';
    if (!productRef || !ean || !sizeRaw) continue;

    const colorName = colorNameIdx !== -1 ? values[colorNameIdx]?.trim() || '' : '';
    const productName =
      productNameIdx !== -1 ? values[productNameIdx]?.trim() || '' : '';
    const displaySize = convertEmileetidaSize(sizeRaw);
    const sizeOdoo = mapSizeToOdooFormat(displaySize);
    const quantity =
      quantityIdx !== -1 ? parseInt(values[quantityIdx]?.trim() || '0', 10) || 0 : 0;
    const price =
      unitPriceIdx !== -1
        ? parseEuroPrice(values[unitPriceIdx]?.trim() || '0')
        : 0;

    out.push({
      productRef,
      colorName,
      productName,
      sizeRaw,
      sizeOdoo,
      ean,
      quantity,
      price,
      rrp: 0,
    });
  }
  return out;
}

/** Normalize for loose name matching in Odoo display names. */
export function normalizeMatchToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function variantMatchesRepairRow(
  variantName: string,
  row: EmileetidaBarcodeRepairRow,
): boolean {
  const nameNorm = normalizeMatchToken(variantName);
  const refNorm = normalizeMatchToken(row.productRef);
  const colorNorm = normalizeMatchToken(row.colorName);
  const productNorm = normalizeMatchToken(row.productName);
  const sizeNorm = normalizeMatchToken(row.sizeOdoo);
  const sizeRawNorm = normalizeMatchToken(row.sizeRaw);

  // Names often omit IDA-… refs: match product title and/or color.
  const hasIdentity =
    (!!refNorm && nameNorm.includes(refNorm)) ||
    (!!productNorm && nameNorm.includes(productNorm)) ||
    (!!colorNorm && nameNorm.includes(colorNorm));
  if (!hasIdentity) return false;
  if (colorNorm && !nameNorm.includes(colorNorm)) return false;

  // One-size / TU accessories usually have no size suffix in the display name.
  if (sizeRawNorm === 'tu' || sizeRawNorm === 'u') {
    return true;
  }

  // Prefer full Odoo label (e.g. s36). Never match bare letter sizeRaw ("s")
  // — that false-positives on XS / words like "velours".
  if (sizeNorm && nameNorm.includes(sizeNorm)) return true;

  // Kids sizes: "6 jaar" / "6jaar" — allow raw converted form when distinct
  if (
    sizeRawNorm.length > 1 &&
    sizeRawNorm !== sizeNorm &&
    nameNorm.includes(sizeRawNorm)
  ) {
    return true;
  }

  return false;
}
