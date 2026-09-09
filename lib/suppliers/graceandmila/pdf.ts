/**
 * Grace & Mila invoice PDF text parser.
 *
 * Invoice lines follow this pattern:
 *   {season} - {model} - {category} - {wholesale}/{rrp} ({size}, {color})
 *   {season} - {model} - {category} - {wholesale}/{rrp} ({color})     ← one-size items
 *
 * Examples:
 *   1 - LIBERTY - BAS - 24,5/69 (XS, ECRU)
 *   1 - AUDEN - ACCESS - 7,5/15 (NOIR)
 *
 * After the description, tab-separated columns: AANTAL, EENHEIDSPRIJS, BTW, BEDRAG
 */

export interface GraceAndMilaInvoiceLine {
  model: string;
  category: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  rrp: number;
}

/**
 * Parse a euro price string: "24,5" → 24.5, "7,5" → 7.5, "69" → 69
 */
function parsePrice(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

/**
 * Parse a single invoice line description.
 * Returns null for non-product lines (DELIVERY, totals, etc.)
 */
function parseInvoiceLineDescription(desc: string): Omit<GraceAndMilaInvoiceLine, 'quantity'> | null {
  // Pattern: {num} - {MODEL} - {CATEGORY} - {price}/{rrp} ({size}, {color})
  //      or: {num} - {MODEL} - {CATEGORY} - {price}/{rrp} ({color})
  const match = desc.match(
    /^\d+\s*-\s*(.+?)\s*-\s*(.+?)\s*-\s*([\d,]+)\/([\d,]+)\s*\(([^)]+)\)\s*$/
  );
  if (!match) return null;

  const model = match[1].trim();
  const category = match[2].trim();
  const price = parsePrice(match[3]);
  const rrp = parsePrice(match[4]);
  const parenContent = match[5].trim();

  // "(XS, ECRU)" → size=XS, color=ECRU
  // "(NOIR)" → size='' (one-size), color=NOIR
  const commaSplit = parenContent.split(',').map(s => s.trim());
  let size: string;
  let color: string;

  if (commaSplit.length >= 2) {
    size = commaSplit[0];
    color = commaSplit.slice(1).join(', ');
  } else {
    size = '';
    color = commaSplit[0];
  }

  return { model, category, color, size, price, rrp };
}

/**
 * Extract product lines from Grace & Mila invoice PDF text.
 */
export function extractGraceAndMilaProducts(pdfText: string): GraceAndMilaInvoiceLine[] {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(Boolean);
  const products: GraceAndMilaInvoiceLine[] = [];

  for (const line of lines) {
    // Split on tab to separate description from quantity columns
    const parts = line.split('\t').map(p => p.trim());
    if (parts.length < 2) continue;

    const desc = parts[0];
    if (!desc || desc === 'OMSCHRIJVING' || desc === 'DELIVERY') continue;

    const parsed = parseInvoiceLineDescription(desc);
    if (!parsed) continue;

    // Quantity is in the second column: "1,00" → 1, "3,00" → 3
    const qtyStr = parts[1] || '0';
    const quantity = Math.round(parseFloat(qtyStr.replace(',', '.')) || 0);
    if (quantity <= 0) continue;

    products.push({ ...parsed, quantity });
  }

  return products;
}

/**
 * Detect if text is a Grace & Mila / Fabrik Agency invoice.
 */
export function isGraceAndMilaInvoice(text: string): boolean {
  const upper = text.toUpperCase();
  return (upper.includes('FABRIK AGENCY') || upper.includes('FABRIKAGENCY'))
    && upper.includes('EENHEIDSPRIJS');
}
