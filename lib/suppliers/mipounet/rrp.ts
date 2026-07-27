import type { ParsedProduct } from '@/lib/suppliers/types';

const FALLBACK_MULTIPLIER = 2.5;

/**
 * Extract Ref → SRP (€) from Mipounet order confirmation PDF text.
 * Format: "Ref. 271.23" ... "SRP: 59 €" (comma decimals allowed).
 * First SRP for a given ref wins.
 */
export function parseMipounetSrpFromText(text: string): Map<string, number> {
  const priceMap = new Map<string, number>();
  if (!text) return priceMap;

  const refRegex = /Ref\.\s*(\d+\.\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(text)) !== null) {
    const ref = match[1];
    if (priceMap.has(ref)) continue;

    const after = text.slice(match.index + match[0].length);
    const srpMatch = after.match(/SRP:\s*([\d.,]+)\s*€/i);
    if (!srpMatch) continue;

    const rrp = parseFloat(srpMatch[1].replace(',', '.'));
    if (rrp > 0) {
      priceMap.set(ref, rrp);
    }
  }

  return priceMap;
}

export interface ApplyMipounetRrpResult {
  products: ParsedProduct[];
  matched: number;
  fallback: number;
  message: string;
}

/**
 * Apply SRP map to products. Matched → rrpSource 'pdf';
 * others → ×2.5 and rrpSource 'fallback'.
 */
export function applyMipounetRrp(
  products: ParsedProduct[],
  priceMap: Map<string, number> | Record<string, number>,
): ApplyMipounetRrpResult {
  const map =
    priceMap instanceof Map
      ? priceMap
      : new Map(Object.entries(priceMap));

  if (map.size === 0) {
    const withFallback = products.map((p) => ({
      ...p,
      rrpSource: 'fallback' as const,
      variants: p.variants.map((v) => ({
        ...v,
        rrp: v.rrp > 0 ? v.rrp : Math.round(v.price * FALLBACK_MULTIPLIER * 100) / 100,
      })),
    }));
    return {
      products: withFallback,
      matched: 0,
      fallback: withFallback.length,
      message:
        withFallback.length === 0
          ? 'Geen SRP in PDF. Upload eerst de order CSV.'
          : `Geen SRP in PDF gevonden. Alle ${withFallback.length} producten gebruiken RRP = inkoop × ${FALLBACK_MULTIPLIER}.`,
    };
  }

  if (products.length === 0) {
    return {
      products,
      matched: 0,
      fallback: 0,
      message: `${map.size} SRP prijzen uit PDF. Upload de order CSV om producten te maken.`,
    };
  }

  let matched = 0;
  let fallback = 0;

  const updated = products.map((product) => {
    const srp = map.get(product.reference.trim());
    if (srp != null && srp > 0) {
      matched += 1;
      return {
        ...product,
        rrpSource: 'pdf' as const,
        variants: product.variants.map((v) => ({ ...v, rrp: srp })),
      };
    }
    fallback += 1;
    return {
      ...product,
      rrpSource: 'fallback' as const,
      variants: product.variants.map((v) => ({
        ...v,
        rrp: v.rrp > 0 ? v.rrp : Math.round(v.price * FALLBACK_MULTIPLIER * 100) / 100,
      })),
    };
  });

  return {
    products: updated,
    matched,
    fallback,
    message: `${map.size} SRP prijzen uit PDF. ${matched}/${updated.length} producten gematcht.${
      fallback > 0 ? ` ${fallback}× fallback ×${FALLBACK_MULTIPLIER}.` : ''
    }`,
  };
}

export { FALLBACK_MULTIPLIER };
