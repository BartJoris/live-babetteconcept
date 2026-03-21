import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export interface DrBloomItem {
  code: string;
  itemName: string;
  description: string;
  units: number;
  unitPrice: number;
  total: number;
}

const SKIP_LINE_RE = /^(SHIPPING|SUBTOTAL|TAX\b|TOTAL|CODE\s+ITEM|ITEM\s+NAME|UNIT$|^PRICE$|PROFORMA|Date\s+\d|DR BLOOM|CALLE\s|BARCELONA|^B\d{8}$|^\d{9,10}$|^Bill\s+to|^BV\s|^Pylyserlaan|^8670|^BE\d{10}|^324\d{8}|^Exenta|Terms\s+and|Pay\s+by|^ES\d{2}|^SWIFT|^Bank\s|PAYMENT|FREIGHT|extension|Customers|^previously|^of\s+transportation)/i;
const PAGE_BREAK_RE = /^--\s*\d+\s+of\s+\d+\s*--$/;
const BARCODE_RE = /^(\d{13})\s*$/;
const PRICE_LINE_RE = /^(\d+)\s+([\d.,]+)\s*€\s+([\d.,]+)\s*€\s*$/;

/**
 * Dr Bloom Proforma PDF text structure (per product, across ~6 lines):
 *   8434187062643           ← 13-digit EAN barcode
 *   Jersey Chiringuito      ← item name line 1
 *   Azul ML                 ← item name line 2 (color + size suffix)
 *   50% CO 50% PC 61102099  ← description line 1 (composition + HS code)
 *   COO Italy               ← description line 2 (country of origin)
 *   2 51,00€ 102,00€        ← quantity + unit price + total
 */
function extractItems(pdfText: string): DrBloomItem[] {
  const rawLines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const lines = rawLines.filter(l => !SKIP_LINE_RE.test(l) && !PAGE_BREAK_RE.test(l));

  const items: DrBloomItem[] = [];
  let i = 0;

  while (i < lines.length) {
    const barcodeMatch = lines[i].match(BARCODE_RE);
    if (!barcodeMatch) {
      i++;
      continue;
    }

    const code = barcodeMatch[1];

    // Collect all lines until the next barcode or price line
    const blockLines: string[] = [];
    i++;
    let priceUnits = 0;
    let priceUnit = 0;
    let priceTotal = 0;
    let foundPrice = false;

    while (i < lines.length) {
      // Stop if we hit the next barcode
      if (BARCODE_RE.test(lines[i])) break;

      // Check if this is the price line
      const pm = lines[i].match(PRICE_LINE_RE);
      if (pm) {
        priceUnits = parseInt(pm[1]);
        priceUnit = parseEuro(pm[2]);
        priceTotal = parseEuro(pm[3]);
        foundPrice = true;
        i++;
        break;
      }

      blockLines.push(lines[i]);
      i++;
    }

    if (!foundPrice || blockLines.length === 0) continue;

    // Split block into item name lines and description lines.
    // Description starts at the first line containing a composition percentage,
    // "COO", "Upper", or an 8+ digit HS code.
    const descStartIdx = blockLines.findIndex(l =>
      /\d+%/.test(l) || /\bCOO\b/i.test(l) || /\bUpper\b/i.test(l) || /^\d{8,10}\b/.test(l)
    );

    let itemName: string;
    let description: string;

    if (descStartIdx > 0) {
      itemName = blockLines.slice(0, descStartIdx).join(' ');
      description = blockLines.slice(descStartIdx).join(' ');
    } else if (descStartIdx === 0) {
      itemName = '';
      description = blockLines.join(' ');
    } else {
      itemName = blockLines.join(' ');
      description = '';
    }

    if (!itemName) continue;

    items.push({
      code,
      itemName: itemName.trim(),
      description: description.trim(),
      units: priceUnits,
      unitPrice: priceUnit,
      total: priceTotal,
    });
  }

  return items;
}

function parseEuro(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [, files] = await form.parse(req);

    const pdfFile = files.pdf?.[0] || files.file?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);
    let pdfText = '';

    try {
      if (typeof DOMMatrix === 'undefined') {
        (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function () {
          return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        };
      }
      const pdfModule = await import('pdf-parse');
      const { PDFParse } = pdfModule;
      const parser = new PDFParse(pdfData);
      const textResult = await parser.getText();

      if (textResult && typeof textResult === 'object') {
        if (textResult.text) pdfText = textResult.text;
        else if (textResult.pages && Array.isArray(textResult.pages))
          pdfText = textResult.pages.map((p: { text?: string }) => p.text || '').join('\n');
        else if (Array.isArray(textResult))
          pdfText = textResult.map((p: { text?: string } | string) => typeof p === 'string' ? p : (p.text || '')).join('\n');
      } else {
        pdfText = String(textResult || '');
      }
    } catch (pdfError) {
      return res.status(500).json({ success: false, error: 'Failed to parse PDF: ' + (pdfError as Error).message });
    }

    const items = extractItems(pdfText);

    if (items.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Geen producten gevonden in de Dr Bloom PDF.',
        debugText: pdfText.substring(0, 8000),
        debugLines: pdfText.split('\n').filter(l => l.trim().length > 0).slice(0, 300),
      });
    }

    const totalQuantity = items.reduce((sum, i) => sum + i.units, 0);
    const totalValue = items.reduce((sum, i) => sum + i.total, 0);

    return res.status(200).json({
      success: true,
      products: items,
      productCount: items.length,
      totalQuantity,
      totalValue,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}
