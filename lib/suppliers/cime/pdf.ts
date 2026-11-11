/**
 * CÎME opstart / bestelformulier PDF parser.
 *
 * Columns (NL/FR bilingual header):
 *   Code | Product | Richt VKP incl BTW | Marge % | Inkoopprijs excl BTW | Order | Totaal
 *
 * Extracted line examples:
 *   10 Nutri-boost dag- & nachtcrème 35.00 39.50% 17.50 6 105
 *   Gua Sha Rozenkwarts Gua Sha Steen in doosje 20.00 39.50% 10.00 0
 */

import { parseEuroPrice } from '@/lib/import/shared/price-utils';

export interface CimePdfProduct {
  reference: string;
  name: string;
  /** Purchase price excl. VAT */
  price: number;
  /** Suggested retail incl. VAT */
  rrp: number;
  quantity: number;
  marginPercent?: number;
}

/** Numeric code + name + rrp + margin% + purchase + qty [+ total] */
const NUMBERED_LINE_RE =
  /^(\d+)\s+(.+?)\s+(\d+[.,]\d{2})\s+([\d.,]+)\s*%\s+(\d+[.,]\d{2})\s+(\d+)(?:\s+([\d.,]+))?$/;

/** Non-numeric first column (e.g. Gua Sha accessory) */
const NAMED_LINE_RE =
  /^(.+?)\s+(\d+[.,]\d{2})\s+([\d.,]+)\s*%\s+(\d+[.,]\d{2})\s+(\d+)(?:\s+([\d.,]+))?$/;

export function isCimeOrderPdf(text: string, fileName = ''): boolean {
  const blob = `${fileName} ${text}`.toLowerCase();
  if (blob.includes('cîme') || blob.includes('cime')) {
    if (
      blob.includes('richt vkp') ||
      blob.includes('inkoopprijs') ||
      blob.includes("prix d'achat") ||
      blob.includes('order/ordre')
    ) {
      return true;
    }
  }
  return (
    blob.includes('richt vkp') &&
    blob.includes('inkoopprijs') &&
    blob.includes('nutri-boost')
  );
}

function slugReference(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 40);
}

/**
 * Parse product lines from CÎME order/opstart PDF text.
 * Includes lines with quantity 0 (catalog rows on the form).
 */
export function extractCimeProducts(pdfText: string): CimePdfProduct[] {
  const lines = pdfText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const products: CimePdfProduct[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (/^totaal\b/i.test(line) || /^code\b/i.test(line)) continue;
    if (/richt vkp|inkoopprijs|order\/ordre|marge/i.test(line)) continue;

    let reference = '';
    let name = '';
    let rrp = 0;
    let price = 0;
    let quantity = 0;
    let marginPercent: number | undefined;

    const numbered = line.match(NUMBERED_LINE_RE);
    if (numbered) {
      reference = numbered[1];
      name = numbered[2].trim();
      rrp = parseEuroPrice(numbered[3]);
      marginPercent = parseFloat(numbered[4].replace(',', '.')) || undefined;
      price = parseEuroPrice(numbered[5]);
      quantity = parseInt(numbered[6], 10) || 0;
    } else {
      const named = line.match(NAMED_LINE_RE);
      if (!named) continue;
      // "Gua Sha Rozenkwarts Gua Sha Steen in doosje" → code-ish + product
      const raw = named[1].trim();
      const parts = raw.split(/\s{2,}|\s+-\s+/);
      if (parts.length >= 2) {
        reference = slugReference(parts[0]);
        name = parts.slice(1).join(' ').trim();
      } else {
        // Split on first occurrence of repeated brand words if present
        const gua = raw.match(/^(Gua Sha Rozenkwarts)\s+(.+)$/i);
        if (gua) {
          reference = slugReference(gua[1]);
          name = gua[2].trim();
        } else {
          name = raw;
          reference = slugReference(raw);
        }
      }
      rrp = parseEuroPrice(named[2]);
      marginPercent = parseFloat(named[3].replace(',', '.')) || undefined;
      price = parseEuroPrice(named[4]);
      quantity = parseInt(named[5], 10) || 0;
    }

    if (!reference || !name || rrp <= 0 || price <= 0) continue;
    if (seen.has(reference)) continue;
    seen.add(reference);

    products.push({
      reference,
      name,
      price,
      rrp,
      quantity,
      marginPercent,
    });
  }

  return products;
}
