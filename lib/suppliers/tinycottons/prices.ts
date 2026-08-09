import { parseEuroPrice } from '@/lib/import/shared';

/**
 * Normalize REFERENCE|VARIANT key for RRP lookup. "Variant" here is the
 * internal style code that appears both as the RRP export's VARIANT column
 * and as the "Color name" column on the order CSV (e.g. "FRILLS LONG COAT
 * L15") - it is not a real color, see extractColor() in ./index.ts.
 */
export function tinycottonsRrpKey(reference: string, variant: string): string {
  return `${reference.trim().toUpperCase()}|${variant.trim().toUpperCase().replace(/\s+/g, ' ')}`;
}

/**
 * Tiny Big sister / Tinycottons "RRP" export (Numbers export -> CSV): a
 * print-style order-confirmation sheet, not a flat table.
 * Header row: STYLE;REFERENCE;VARIANT;SRP;SIZES;...
 * Product rows: ;;AW26-602;FRILLS LONG COAT L15;299,00;;1;1;1;1;;;;;;;4;110,70;442,80
 */
export function isTinycottonsRrpCsv(text: string): boolean {
  const sample = (text || '').slice(0, 20_000).toUpperCase();
  return (
    sample.includes('REFERENCE') &&
    sample.includes('VARIANT') &&
    sample.includes('SRP') &&
    (sample.includes('TINYCOTTONS') || sample.includes('TINY BIG SISTER'))
  );
}

export function buildTinycottonsRrpMap(text: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  if (!text?.trim()) return priceMap;

  const lines = text.split(/\r?\n/);
  let refIdx = -1;
  let variantIdx = -1;
  let srpIdx = -1;

  for (const line of lines) {
    const cells = line.split(';').map(c => c.trim().toUpperCase());
    const r = cells.indexOf('REFERENCE');
    const v = cells.indexOf('VARIANT');
    const s = cells.indexOf('SRP');
    if (r !== -1 && v !== -1 && s !== -1) {
      refIdx = r;
      variantIdx = v;
      srpIdx = s;
      break;
    }
  }

  if (refIdx === -1) return priceMap;

  for (const line of lines) {
    const cells = line.split(';');
    const reference = (cells[refIdx] || '').trim();
    const variant = (cells[variantIdx] || '').trim();
    const srpStr = (cells[srpIdx] || '').trim();

    if (!reference || !variant || !srpStr) continue;
    // Product refs look like "AW26-602" - skip STYLE/material/origin rows.
    if (!/^[A-Z]{2}\d{2}-\d+$/i.test(reference)) continue;

    const rrp = parseEuroPrice(srpStr);
    if (rrp > 0) priceMap.set(tinycottonsRrpKey(reference, variant), rrp);
  }

  return priceMap;
}

/** Fallback markup when there's no RRP file and no inline RRP column. */
export const TINYCOTTONS_RRP_FALLBACK_MULTIPLIER = 1.2;

export function lookupTinycottonsRrp(
  rrpMap: Map<string, number>,
  reference: string,
  variant: string,
  fallbackWholesale: number,
): number {
  const fromMap = rrpMap.get(tinycottonsRrpKey(reference, variant));
  if (fromMap && fromMap > 0) return fromMap;
  return Math.round(fallbackWholesale * TINYCOTTONS_RRP_FALLBACK_MULTIPLIER * 100) / 100;
}
