import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface BabeAndTessPdfProduct {
  reference: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  rrp: number;
  ean?: string;
  sku?: string;
}

const RRP_MULTIPLIER = 2.7;

async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = new Uint8Array(pdfBuffer);
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
    if (textResult.text) return textResult.text;
    if (textResult.pages && Array.isArray(textResult.pages)) {
      return textResult.pages.map((p: { text?: string }) => p.text || '').join('\n');
    }
    if (Array.isArray(textResult)) {
      return textResult.map((p: { text?: string } | string) => (typeof p === 'string' ? p : (p.text || ''))).join('\n');
    }
  }
  return String(textResult || '');
}

function parseEuroPrice(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[€\s\t]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/** Babe & Tess maat naar Odoo-syntax: 3A → 3 jaar, 24M → 24 maand. */
function babeAndTessSizeToOdoo(size: string): string {
  const aMatch = size.match(/^(\d+)A$/);
  if (aMatch) return `${aMatch[1]} jaar`;
  const mMatch = size.match(/^(\d+)M$/);
  if (mMatch) return `${mMatch[1]} maand`;
  return size;
}

/**
 * Babe & Tess order PDF (MINI B): product name, code (XX.XXXXXX), unit price (prezzo un.), sizes, color, quantities.
 * Pattern per product block:
 *   Line 1: "Product name\t01.618017\t1\t33,00\t33,00\t..."
 *   Line 2: "24M" or "3A 4A 5A 6A 8A" or "3M 6M 9M 12M"
 *   Line 3: "065-LightRose\t1" or "065-LightRose\t1\t1\t1\t1\t1"
 * Verkoopprijs (RRP) = unit price × 2.7.
 */
function parseOrderPdf(pdfText: string): BabeAndTessPdfProduct[] {
  const products: BabeAndTessPdfProduct[] = [];
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Product line: name, code (XX.XXXXXX), number, unit price, total, dates...
  const productLineRe = /^(.+?)\s+(\d{2}\.\d{6})\s+\d+\s+(\d+[,.]\d{2})\s+(\d+[,.]\d{2})/;
  // Skip transport / generic lines
  const skipRe = /^(TRANSPORT|GEN\d+|Numero|Order|data\/date|MINI B|BABETTE|Codice|C\.F\.|Cap\.Soc\.|PAG\.|Con l'accettazione|Trascorsi|--\s*\d+\s*of)/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (skipRe.test(line) || /^\d+\s+EUR\s+[\d.,]+$/.test(line)) {
      i++;
      continue;
    }

    const match = line.match(productLineRe);
    if (!match) {
      i++;
      continue;
    }

    const productName = match[1].trim();
    const reference = match[2].trim();
    const unitPrice = parseEuroPrice(match[3]);
    if (unitPrice <= 0) {
      i++;
      continue;
    }

    /** Verkoopprijs: aankoopprijs × 2.7, afgerond op hele euro's (89,1 → 89, 97,7 → 98). */
    const rrp = Math.round(unitPrice * RRP_MULTIPLIER);

    // Next line: sizes
    i++;
    const sizeLine = lines[i] || '';
    const sizeTokens = sizeLine.split(/\s+/).filter(Boolean);
    if (sizeTokens.length === 0) {
      i++;
      continue;
    }

    // Filter out size tokens that look like dates (01/01/2026) or other numbers
    const sizes = sizeTokens.filter(t => !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t) && !/^\d{5,}$/.test(t));
    if (sizes.length === 0) {
      i++;
      continue;
    }

    i++;
    const colorLine = lines[i] || '';
    // Color: "065-LightRose" or "001-Bianco", then tab/spaces and quantities
    const colorParts = colorLine.split(/\s+/).filter(Boolean);
    if (colorParts.length === 0) {
      i++;
      continue;
    }

    const color = colorParts[0];
    const quantities = colorParts.slice(1).map(q => parseInt(q, 10) || 0);

    // If we have one size and one quantity, or sizes length matches quantities
    const qtyList = quantities.length >= sizes.length ? quantities.slice(0, sizes.length) : quantities.length === 1 ? sizes.map(() => quantities[0]) : quantities;
    for (let s = 0; s < sizes.length; s++) {
      const qty = qtyList[s] ?? 1;
      if (qty <= 0) continue;
      products.push({
        reference,
        name: productName,
        color,
        size: babeAndTessSizeToOdoo(sizes[s]),
        quantity: qty,
        price: unitPrice,
        rrp,
        ean: '',
        sku: '',
      });
    }
    i++;
  }

  return products;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [, files] = await form.parse(req);

    const pdfFile = files.pdf?.[0] || files.pdf_invoice?.[0] || files.packing?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'Geen PDF geüpload. Upload het order-PDF (z_ordine-xxx.pdf).' });
    }

    const toClean = [pdfFile.filepath];
    try {
      const pdfText = await extractTextFromPdf(pdfFile.filepath);
      if (pdfText.length < 100) {
        return res.status(200).json({
          success: false,
          error: 'Kon geen tekst uit PDF halen.',
          debugText: pdfText.substring(0, 2000),
        });
      }

      const products = parseOrderPdf(pdfText);
      if (products.length === 0) {
        return res.status(200).json({
          success: false,
          error: 'Geen producten gevonden in PDF. Controleer het formaat (Babe & Tess order).',
          debugText: pdfText.substring(0, 3000),
          debugLines: pdfText.split('\n').slice(0, 60),
        });
      }

      for (const p of toClean) {
        try {
          fs.unlinkSync(p);
        } catch (_) {}
      }

      return res.status(200).json({
        success: true,
        products,
        productCount: products.length,
      });
    } catch (err) {
      for (const p of toClean) {
        try {
          fs.unlinkSync(p);
        } catch (_) {}
      }
      throw err;
    }
  } catch (error) {
    console.error('Babe & Tess PDF parse error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to parse PDF',
    });
  }
}
