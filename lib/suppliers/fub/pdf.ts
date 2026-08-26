/**
 * Shared FUB order/invoice PDF text extraction.
 * Order confirmation has EAN triplets; invoice has composition + unit/RRP.
 */

export interface FubOrderLine {
  articleName: string;
  articleCode: string;
  color: string;
  totalQty: number;
  /** Line amount (total for all sizes) when present on the product line. */
  lineAmount: number;
  unitPrice: number;
  eanBySize: Array<{ euSize: string; qty: number; ean: string }>;
}

export interface FubInvoiceLine {
  articleName: string;
  articleCode: string;
  color: string;
  totalQty: number;
  composition: string;
  unitPrice: number;
  rrp: number;
  sizes: Array<{ euSize: string; qty: number }>;
}

const PRODUCT_LINE_RE = /^(?:\d+\s+)?(.+?)\s+(\d+)\s+Pcs\s+([\d.,]+)$/i;
/** "(4726 SS)", "(4826 AW)", "(9999)" */
const ARTICLE_CODE_RE = /^(.+?)\((\d+)(?:\s+([A-Za-z]{2}))?\)\s*(.*)$/;

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function splitArticleColor(full: string): {
  articleName: string;
  articleCode: string;
  color: string;
} {
  const m = full.trim().match(ARTICLE_CODE_RE);
  if (!m) {
    return { articleName: full.trim(), articleCode: '', color: '' };
  }
  const base = m[1].trim();
  const codeNum = m[2];
  const season = (m[3] || '').trim();
  const color = (m[4] || '').trim().toLowerCase();
  const articleCode = season ? `${codeNum} ${season.toUpperCase()}` : codeNum;
  // Keep "Name (4826 AW)" style for display
  const articleName = `${base} (${articleCode})`;
  return { articleName, articleCode, color };
}

function isFreight(articleName: string, articleCode: string): boolean {
  if (articleCode === '9999' || articleCode.startsWith('9999')) return true;
  const lower = articleName.toLowerCase();
  return (
    lower.includes('freight') ||
    lower.includes('shipping') ||
    lower.includes('handling')
  );
}

export function extractFubOrderProducts(pdfText: string): FubOrderLine[] {
  const lines = pdfText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const products: FubOrderLine[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const productMatch = line.match(PRODUCT_LINE_RE);
    if (!productMatch) {
      i++;
      continue;
    }

    const fullArticle = productMatch[1].trim();
    const totalQty = parseInt(productMatch[2], 10) || 0;
    const lineAmount = parseMoney(productMatch[3]);
    const { articleName, articleCode, color } = splitArticleColor(fullArticle);

    i++;
    while (
      i < lines.length &&
      (lines[i].startsWith('Certificate:') || lines[i] === 'EAN codes')
    ) {
      i++;
    }

    const eanBySize: Array<{ euSize: string; qty: number; ean: string }> = [];
    while (i < lines.length) {
      const sizeLine = lines[i];
      if (!/^\d{2,3}$/.test(sizeLine)) break;
      const euSize = sizeLine;
      const qty = parseInt(lines[i + 1], 10) || 1;
      const ean = lines[i + 2] || '';
      if (/^\d{10,13}$/.test(ean)) {
        eanBySize.push({ euSize, qty, ean });
        i += 3;
      } else {
        break;
      }
    }

    let unitPrice = 0;
    if (i < lines.length && /^[\d.,]+$/.test(lines[i])) {
      unitPrice = parseMoney(lines[i]);
      i++;
    }
    if (!unitPrice && totalQty > 0 && lineAmount > 0) {
      unitPrice = Math.round((lineAmount / totalQty) * 100) / 100;
    }

    if (isFreight(articleName, articleCode)) {
      continue;
    }

    products.push({
      articleName,
      articleCode,
      color,
      totalQty,
      lineAmount,
      unitPrice,
      eanBySize,
    });
  }

  return products;
}

/**
 * Invoice lines: "Size N" then qty / size pairs, ending with "qty unit/rrp".
 *
 *   Size 130
 *   1 28,00/70,00
 *
 *   Size 56
 *   1
 *   62
 *   1
 *   ...
 *   86
 *   1 22,00/55,00
 */
export function extractFubInvoiceProducts(pdfText: string): FubInvoiceLine[] {
  const lines = pdfText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const products: FubInvoiceLine[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const productMatch = line.match(PRODUCT_LINE_RE);
    if (!productMatch) {
      i++;
      continue;
    }

    const fullArticle = productMatch[1].trim();
    const totalQty = parseInt(productMatch[2], 10) || 0;
    const { articleName, articleCode, color } = splitArticleColor(fullArticle);

    i++;
    let composition = '';
    if (i < lines.length && lines[i].toLowerCase().startsWith('composition:')) {
      composition = lines[i].replace(/^composition:\s*/i, '').trim();
      i++;
    }

    const sizes: Array<{ euSize: string; qty: number }> = [];
    let unitPrice = 0;
    let rrp = 0;

    const sizeHeader = i < lines.length ? lines[i].match(/^Size\s+(\d{2,3})$/i) : null;
    if (sizeHeader) {
      sizes.push({ euSize: sizeHeader[1], qty: 0 });
      i++;

      while (i < lines.length) {
        const cur = lines[i];

        const combo = cur.match(/^(\d+)\s+([\d.,]+)\/([\d.,]+)$/);
        if (combo) {
          const last = sizes[sizes.length - 1];
          if (last) last.qty = parseInt(combo[1], 10) || 1;
          unitPrice = parseMoney(combo[2]);
          rrp = parseMoney(combo[3]);
          i++;
          break;
        }

        const pricesOnly = cur.match(/^([\d.,]+)\/([\d.,]+)$/);
        if (pricesOnly) {
          unitPrice = parseMoney(pricesOnly[1]);
          rrp = parseMoney(pricesOnly[2]);
          i++;
          break;
        }

        if (/^\d+$/.test(cur) && !/^\d{10,13}$/.test(cur) && cur.length <= 3) {
          // Could be qty for previous size, or a new EU size
          const asNum = parseInt(cur, 10);
          const last = sizes[sizes.length - 1];
          if (last && last.qty === 0 && asNum < 50) {
            // qty (typically 1–few)
            last.qty = asNum;
            i++;
            continue;
          }
          if (/^\d{2,3}$/.test(cur)) {
            sizes.push({ euSize: cur, qty: 0 });
            i++;
            continue;
          }
        }

        break;
      }
    }

    for (const s of sizes) {
      if (!s.qty) s.qty = 1;
    }

    if (isFreight(articleName, articleCode)) {
      continue;
    }

    products.push({
      articleName,
      articleCode,
      color,
      totalQty,
      composition,
      unitPrice,
      rrp,
      sizes,
    });
  }

  return products;
}

export function detectFubPdfKind(
  pdfText: string,
  fileName = '',
): 'order' | 'invoice' | 'unknown' {
  const fn = fileName.toLowerCase();
  if (fn.includes('invoice') || fn.includes('factuur')) return 'invoice';
  if (fn.includes('order') || fn.includes('confirmation')) return 'order';

  const head = pdfText.slice(0, 400).toUpperCase();
  if (head.includes('INVOICE')) return 'invoice';
  if (head.includes('ORDER CONFIRMATION') || head.includes('ORDER NUMBER')) {
    return 'order';
  }
  if (pdfText.includes('EAN codes')) return 'order';
  if (/composition:/i.test(pdfText) && /\d+[.,]\d+\s*\/\s*\d+[.,]\d+/.test(pdfText)) {
    return 'invoice';
  }
  return 'unknown';
}

export function matchArticleColor(articleCode: string, color: string): string {
  return `${articleCode.trim().toUpperCase()}|${color.trim().toLowerCase()}`;
}
