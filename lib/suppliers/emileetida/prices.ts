import { parseCSV, findHeader, parseEuroPrice } from '@/lib/import/shared';

/** Normalize REF|COLOR key for SRP lookup. */
export function emileetidaPriceKey(ref: string, color: string): string {
  return `${ref.trim().toUpperCase()}|${color.trim().toUpperCase().replace(/\s+/g, ' ')}`;
}

/**
 * Classic TARIF CSV: Gencod + RRP EUR → keyed by EAN.
 */
export function buildTarifEanPriceMap(text: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  const { headers, rows } = parseCSV(text, { delimiter: ';' });

  const gencodIdx = findHeader(headers, 'gencod');
  const rrpIdx = findHeader(headers, 'rrp eur');
  if (gencodIdx === -1 || rrpIdx === -1) return priceMap;

  for (const values of rows) {
    const gencod = values[gencodIdx]?.trim() || '';
    const rrpStr = values[rrpIdx]?.trim() || '0';
    if (!gencod) continue;

    const rrp = parseEuroPrice(rrpStr);
    if (rrp > 0) priceMap.set(gencod, rrp);
  }

  return priceMap;
}

/**
 * DRNMODE / Emile & Ida order confirmation CSV with SRP column.
 * Header row: STYLE;REFERENCE;VARIANT;SRP;SIZES;...
 * Product rows: empty;IDA-ELEA;CHATAIGNE;119,00;...
 */
export function buildOrderConfirmationSrpMap(text: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  let refIdx = -1;
  let variantIdx = -1;
  let srpIdx = -1;
  let headerLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(';').map((c) => c.trim().toUpperCase());
    const r = cells.indexOf('REFERENCE');
    const v = cells.indexOf('VARIANT');
    const s = cells.indexOf('SRP');
    if (r !== -1 && v !== -1 && s !== -1) {
      refIdx = r;
      variantIdx = v;
      srpIdx = s;
      headerLine = i;
      break;
    }
  }

  if (headerLine === -1) return priceMap;

  for (let i = headerLine + 1; i < lines.length; i++) {
    const cells = lines[i].split(';');
    const ref = (cells[refIdx] || '').trim();
    const variant = (cells[variantIdx] || '').trim();
    const srpStr = (cells[srpIdx] || '').trim();

    if (!ref || !variant || !srpStr) continue;
    if (/^origin:/i.test(ref)) continue;

    // Product refs: IDA-ELEA, AD207B, AEBANANA1, …
    if (!/^(IDA-[A-Z0-9]+|AD[A-Z0-9]+|AE[A-Z0-9]+)$/i.test(ref)) continue;

    const rrp = parseEuroPrice(srpStr);
    if (rrp <= 0) continue;

    priceMap.set(emileetidaPriceKey(ref, variant), rrp);
  }

  return priceMap;
}

export function isEmileetidaTarifCsv(text: string): boolean {
  const sample = text.slice(0, 12_000).toLowerCase();
  return sample.includes('rrp eur') && sample.includes('gencod');
}

export function isEmileetidaOrderConfirmationCsv(text: string): boolean {
  const sample = text.slice(0, 12_000).toUpperCase();
  const hasSrpHeader =
    sample.includes(';SRP;') ||
    sample.includes('\nSRP;') ||
    /(?:^|;)STYLE;REFERENCE;VARIANT;SRP(?:;|$)/m.test(sample);
  const hasVariant = sample.includes(';VARIANT;') || sample.includes('VARIANT;');
  const hasReference =
    sample.includes(';REFERENCE;') || sample.includes('REFERENCE;');
  return hasSrpHeader && hasVariant && hasReference;
}

export type EmileetidaPriceLookup = {
  byEan: Map<string, number>;
  byRefColor: Map<string, number>;
};

export function buildEmileetidaPriceLookup(text: string): EmileetidaPriceLookup {
  if (!text?.trim()) {
    return { byEan: new Map(), byRefColor: new Map() };
  }

  return {
    byEan: buildTarifEanPriceMap(text),
    byRefColor: buildOrderConfirmationSrpMap(text),
  };
}

export function lookupEmileetidaRrp(
  lookup: EmileetidaPriceLookup,
  ean: string,
  ref: string,
  color: string,
  fallbackWholesale: number,
): number {
  const byEan = ean ? lookup.byEan.get(ean) : undefined;
  if (byEan && byEan > 0) return byEan;

  const byRef = lookup.byRefColor.get(emileetidaPriceKey(ref, color));
  if (byRef && byRef > 0) return byRef;

  // Fallback markup (kids ~2.5) when no SRP file is available
  return Math.round(fallbackWholesale * 2.5 * 100) / 100;
}
