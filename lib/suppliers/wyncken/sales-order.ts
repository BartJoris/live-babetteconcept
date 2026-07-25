export interface WynckenSizeQty {
  size: string;
  quantity: number;
}

export interface WynckenPdfProduct {
  style: string;
  fabric: string;
  colour: string;
  materialContent?: string;
  unitPrice: number;
  quantity: number;
  total: number;
  /** Per-size quantities from sales order grid; absent on proforma */
  sizeQuantities?: WynckenSizeQty[];
}

const STYLE_CODE_LINE = /^([A-Z]{2}\d+[A-Z0-9]*)\s+(.+)$/i;

/**
 * Parse Wyncken sales-order (SO) PDF text with size grids:
 *   2 / 1, 3 / 1, …, 10 / -  → only positive qtys kept
 */
export function parseWynckenSalesOrderText(text: string): WynckenPdfProduct[] {
  if (!text?.trim()) return [];

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const products: WynckenPdfProduct[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!/^Qty\s+Unit\s+Price\s+Total$/i.test(line)) {
      i += 1;
      continue;
    }

    // Next non-empty should be: "5 € 46.00 € 230.00	CHN"
    let j = i + 1;
    while (j < lines.length && !lines[j]) j += 1;
    if (j >= lines.length) break;

    const totalsLine = lines[j];
    const totalsMatch = totalsLine.match(
      /^(\d+)\s*€\s*([\d.,]+)\s*€\s*([\d.,]+)/i,
    );
    if (!totalsMatch) {
      i += 1;
      continue;
    }

    const quantity = parseInt(totalsMatch[1], 10);
    const unitPrice = parseFloat(totalsMatch[2].replace(',', '.'));
    const total = parseFloat(totalsMatch[3].replace(',', '.'));

    // Find style code line (WK21…)
    let style = '';
    let fabric = '';
    let materialContent = '';
    let colour = '';
    let k = j + 1;
    const blockEnd = Math.min(lines.length, j + 60);

    while (k < blockEnd) {
      const l = lines[k];
      if (/^Qty\s+Unit\s+Price\s+Total$/i.test(l) && k > j + 2) break;

      const styleMatch = l.match(STYLE_CODE_LINE);
      if (styleMatch && !style) {
        style = l.replace(/\s+/g, ' ').trim();
        const fabricGuess = styleMatch[2].trim().split(/\s+/).slice(-3).join(' ');
        if (/(COTTON|POLYESTER|NYLON|WOOL|ACRYLIC)/i.test(fabricGuess)) {
          fabric = fabricGuess.toUpperCase();
        }
      } else if (
        !materialContent &&
        l.includes('%') &&
        /(COTTON|POLY|NYLON|WOOL|VISCOSE|ACRYLIC|ELASTANE)/i.test(l)
      ) {
        materialContent = l;
      } else if (/^Style:$/i.test(l) && k + 1 < lines.length) {
        // Next line is colour
        const next = lines[k + 1];
        if (next && !/^(HTS:|Qty|Fabric:|COO:)/i.test(next)) {
          colour = next.trim();
        }
      }
      k += 1;
    }

    // Size grid: after HTS: (or after colour), pairs of size / qty|-
    const sizeQuantities = parseSizeGrid(lines, j, blockEnd);

    if (style && unitPrice > 0 && (quantity > 0 || sizeQuantities.some((s) => s.quantity > 0))) {
      const positiveSizes = sizeQuantities.filter((s) => s.quantity > 0);
      const qtyFromSizes = positiveSizes.reduce((sum, s) => sum + s.quantity, 0);
      products.push({
        style,
        fabric,
        colour,
        materialContent,
        unitPrice,
        quantity: qtyFromSizes > 0 ? qtyFromSizes : quantity,
        total,
        sizeQuantities: positiveSizes.length > 0 ? positiveSizes : undefined,
      });
    }

    i = j + 1;
  }

  return products;
}

function parseSizeGrid(
  lines: string[],
  start: number,
  end: number,
): WynckenSizeQty[] {
  const result: WynckenSizeQty[] = [];
  let htsIdx = -1;
  for (let i = start; i < end; i++) {
    if (/^HTS:\s*$/i.test(lines[i]) || /^HTS:/i.test(lines[i])) {
      htsIdx = i;
      break;
    }
  }
  if (htsIdx === -1) return result;

  let i = htsIdx + 1;
  while (i < end - 1) {
    const sizeLine = lines[i];
    const qtyLine = lines[i + 1];

    if (/^Qty\s+Unit\s+Price\s+Total$/i.test(sizeLine)) break;
    if (/^WYNKEN LIMITED/i.test(sizeLine)) break;
    if (/^--\s*\d+\s+of/i.test(sizeLine)) break;

    // Size tokens: 2, 3, 10, 2Y-6Y, OS, ONE SIZE
    const isSize =
      /^\d+$/.test(sizeLine) ||
      /^\d+Y(-\d+Y)?$/i.test(sizeLine) ||
      /^\d+M$/i.test(sizeLine) ||
      /^(OS|ONE SIZE)$/i.test(sizeLine);

    if (!isSize) {
      i += 1;
      continue;
    }

    if (qtyLine === '-' || qtyLine === '') {
      i += 2;
      continue;
    }

    if (/^\d+$/.test(qtyLine)) {
      const quantity = parseInt(qtyLine, 10);
      if (quantity > 0) {
        result.push({ size: sizeLine, quantity });
      }
      i += 2;
      continue;
    }

    i += 1;
  }

  return result;
}

export function isWynckenSalesOrderText(text: string): boolean {
  const head = text.slice(0, 1500).toUpperCase();
  return (
    head.includes('PROVISIONAL ORDER') ||
    (/SO-\d+/i.test(head) && head.includes('QTY UNIT PRICE TOTAL'))
  );
}
