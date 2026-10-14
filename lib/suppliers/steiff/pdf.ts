/**
 * Steiff (Margarete Steiff GmbH) invoice PDF parser.
 *
 * Line layout (extracted text):
 *   {item} {material} {sizeCm} {qty} PC {unitPrice} EUR {lineValue}
 *   {description}
 *   Promotion Discount 1 10,00- % -{discount}
 *   Net value {netUnit} EUR {netLine}
 *
 * Material "014253" maps to price-list Artikelcode "66.014253".
 */

import { parseEuroPrice } from '@/lib/import/shared/price-utils';

export interface SteiffInvoiceLine {
  item: string;
  material: string;
  /** Article code as in the price list, e.g. 66.014253 */
  articleCode: string;
  sizeCm: string;
  description: string;
  quantity: number;
  /** List/unit price before promotion discount */
  unitPrice: number;
  /** Net unit price after promotion discount (what was paid) */
  netUnitPrice: number;
}

const LINE_RE =
  /^(\d{6})\s+(\d{5,6})\s+(\d+)\s+(\d+)\s+PC\s+([\d.,]+)\s+EUR\s+([\d.,]+)$/i;

export function materialToArticleCode(material: string): string {
  const digits = material.replace(/\D/g, '');
  if (!digits) return '';
  return `66.${digits.padStart(6, '0')}`;
}

export function isSteiffInvoice(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('margarete steiff') ||
    (lower.includes('steiff') && lower.includes('invoice') && lower.includes('material'))
  );
}

/**
 * Extract product lines from Steiff invoice PDF text.
 */
export function extractSteiffProducts(pdfText: string): SteiffInvoiceLine[] {
  const lines = pdfText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const products: SteiffInvoiceLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LINE_RE);
    if (!match) continue;

    const item = match[1];
    const material = match[2];
    const sizeCm = match[3];
    const quantity = parseInt(match[4], 10) || 0;
    const unitPrice = parseEuroPrice(match[5]);

    let description = '';
    if (i + 1 < lines.length && !LINE_RE.test(lines[i + 1]) && !/^Promotion\b/i.test(lines[i + 1])) {
      description = lines[i + 1];
      i++;
    }

    let netUnitPrice = unitPrice;
    // Scan a few following lines for "Net value {price} EUR"
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (LINE_RE.test(lines[j])) break;
      const netMatch = lines[j].match(/^Net value\s+([\d.,]+)\s+EUR/i);
      if (netMatch) {
        netUnitPrice = parseEuroPrice(netMatch[1]);
        break;
      }
    }

    if (quantity <= 0) continue;

    products.push({
      item,
      material,
      articleCode: materialToArticleCode(material),
      sizeCm,
      description,
      quantity,
      unitPrice,
      netUnitPrice,
    });
  }

  return products;
}
