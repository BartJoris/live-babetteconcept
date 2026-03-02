import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface ClaudeCoInvoiceItem {
  skuCode: string;
  itemName: string;
  size: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/**
 * Claude & Co Invoice PDF structure:
 *   Code  Item                                  Quantity  Unit Price  VAT Rate  Amount EUR
 *   23349 Adult Bowie Coco Stripe Tee Size: S   1         €20.40     0%        €20.40
 */
function extractInvoiceItems(pdfText: string): ClaudeCoInvoiceItem[] {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items: ClaudeCoInvoiceItem[] = [];

  console.log(`📝 Claude & Co PDF: ${lines.length} non-empty lines`);

  // Pattern: SKU code (5 digits), followed by item name with "Size: XX", then numbers
  const lineRe = /^(\d{5})\s+(.+?)\s+Size:\s*(\S+)\s+(\d+)\s+€([\d.]+)\s+\d+%\s+€([\d.]+)/;
  // Fallback: code + item + qty + price (no Size: in text)
  const lineReFallback = /^(\d{5})\s+(.+?)\s+(\d+)\s+€([\d.]+)\s+\d+%\s+€([\d.]+)/;

  for (const line of lines) {
    // Skip shipping and summary lines
    if (/DHL|Sub-Total|VAT|Total EUR|Amount Paid|Remainder|SHIPPING/i.test(line)) continue;

    const match = line.match(lineRe);
    if (match) {
      items.push({
        skuCode: match[1],
        itemName: match[2].trim(),
        size: match[3],
        quantity: parseInt(match[4]),
        unitPrice: parseFloat(match[5]),
        amount: parseFloat(match[6]),
      });
      continue;
    }

    const fallback = line.match(lineReFallback);
    if (fallback) {
      items.push({
        skuCode: fallback[1],
        itemName: fallback[2].trim(),
        size: '',
        quantity: parseInt(fallback[3]),
        unitPrice: parseFloat(fallback[4]),
        amount: parseFloat(fallback[5]),
      });
    }
  }

  console.log(`✅ Extracted ${items.length} invoice items`);
  return items;
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

    const items = extractInvoiceItems(pdfText);

    if (items.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No items found in Claude & Co invoice.',
        debugText: pdfText.substring(0, 5000),
        debugLines: pdfText.split('\n').filter(l => l.trim().length > 0).slice(0, 200),
      });
    }

    return res.status(200).json({
      success: true,
      products: items,
      productCount: items.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}
