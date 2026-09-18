import { extractTextItems } from 'unpdf';
import type { BayiriLayoutItem } from './pdf';

function copyPdfBytes(data: Uint8Array | Buffer): Uint8Array {
  return new Uint8Array(Buffer.from(data));
}

function ensurePdfjsPolyfills(): void {
  const math = Math as Math & { sumPrecise?: (values: Iterable<number>) => number };
  if (typeof math.sumPrecise !== 'function') {
    math.sumPrecise = (values) => {
      let total = 0;
      for (const value of values) total += value;
      return total;
    };
  }
  if (typeof DOMMatrix === 'undefined') {
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function () {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    };
  }
}

/**
 * Server-only: reads positioned PDF text. Do not import from client supplier plugins.
 * Uses unpdf (inlined worker) so Next.js does not hit pdfjs-dist DataCloneError.
 */
export async function extractBayiriLayoutItems(data: Uint8Array | Buffer): Promise<BayiriLayoutItem[]> {
  ensurePdfjsPolyfills();
  const { items: pages } = await extractTextItems(copyPdfBytes(data));
  const items: BayiriLayoutItem[] = [];

  for (const pageItems of pages) {
    if (pageItems.length === 0) continue;
    const maxY = Math.max(...pageItems.map((item) => item.y));
    for (const item of pageItems) {
      const str = (item.str || '').trim();
      if (!str) continue;
      items.push({ str, x: item.x, y: maxY - item.y });
    }
  }

  return items;
}
