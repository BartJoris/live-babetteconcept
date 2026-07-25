export interface WynckenBarcode {
  productId: string;
  style: string;
  fabric: string;
  colour: string;
  size: string;
  barcode: string;
}

function detectDelimiter(headerLine: string): ';' | ',' {
  const semi = headerLine.split(';').length;
  const comma = headerLine.split(',').length;
  return semi >= comma ? ';' : ',';
}

/** Prefer a clean 12–13 digit EAN; Excel often dumps barcodes as 1.11111E+12. */
export function extractWynckenBarcode(barcodeCell: string, imagePath: string): string {
  const cell = (barcodeCell || '').trim();
  if (/^\d{12,13}$/.test(cell)) return cell;

  const fromUrl = imagePath.match(/\/(\d{12,13})\.(?:jpg|jpeg|png)(?:\?|$)/i);
  if (fromUrl) return fromUrl[1];

  // Last resort: digits-only from cell if long enough
  const digits = cell.replace(/\D/g, '');
  if (digits.length >= 12 && digits.length <= 13) return digits;

  return '';
}

export function parseWynckenBarcodesCSV(text: string): Map<string, WynckenBarcode> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return new Map();

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map((h) => h.trim());

  const productIdIdx = headers.findIndex((h) => h.toLowerCase() === 'product id');
  const styleIdx = headers.findIndex((h) => h.toLowerCase() === 'style');
  const fabricIdx = headers.findIndex((h) => h.toLowerCase() === 'fabric');
  const colourIdx = headers.findIndex((h) => h.toLowerCase() === 'colour');
  const sizeIdx = headers.findIndex((h) => h.toLowerCase() === 'size');
  const barcodeIdx = headers.findIndex((h) => h.toLowerCase() === 'barcode');
  const pathIdx = headers.findIndex((h) => h.toLowerCase() === 'barcode image path');

  if (productIdIdx === -1 || styleIdx === -1 || sizeIdx === -1 || barcodeIdx === -1) {
    return new Map();
  }

  const barcodes = new Map<string, WynckenBarcode>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(delimiter).map((v) => v.trim());
    const productId = values[productIdIdx] || '';
    const style = values[styleIdx] || '';
    const size = values[sizeIdx] || '';
    const barcode = extractWynckenBarcode(
      values[barcodeIdx] || '',
      pathIdx !== -1 ? values[pathIdx] || '' : '',
    );

    if (!productId || !style || !size || !barcode) continue;

    const key = `${productId}-${size}`;
    barcodes.set(key, {
      productId,
      style,
      fabric: fabricIdx !== -1 ? values[fabricIdx] || '' : '',
      colour: colourIdx !== -1 ? values[colourIdx] || '' : '',
      size,
      barcode,
    });
  }

  return barcodes;
}

export function isWynckenBarcodesCSV(text: string): boolean {
  const first = text.split(/\r?\n/)[0]?.toLowerCase() || '';
  return first.includes('barcode') && first.includes('size') && first.includes('product id');
}

export function isWynckenMasterDataCSV(text: string): boolean {
  const first = text.split(/\r?\n/)[0]?.toLowerCase() || '';
  return (
    first.includes('product id') &&
    first.includes('textile content') &&
    (first.includes('rrp') || first.includes('wsp') || first.includes('description'))
  );
}
