import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface SistersInvoiceItem {
  reference: string;
  description: string;
  totalQty: number;
  unitPrice: number;
  netValue: number;
  sizeBreakdown: Array<{ size: string; qty: number }>;
}

/**
 * Sisters Department Invoice PDF structure:
 *   Item Ref.     Description                                    Qty.  Unit  Price   Tax     Net Value
 *   SS26.TSH2604A Short sleeve t-shirt | Bordeaux w/ leopard...  4     Uni.  22,70€  Exempt  90,80€
 *                 XS (1x) | S (1x) | M (1x) | L (1x) | HS Code: ...
 */
function extractInvoiceItems(pdfText: string): SistersInvoiceItem[] {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items: SistersInvoiceItem[] = [];

  console.log(`📝 Sisters Department PDF: ${lines.length} non-empty lines`);
  lines.forEach((line, idx) => {
    console.log(`  ${idx}: "${line.substring(0, 150)}"`);
  });

  const refPattern = /^(SS\d{2}\.[A-Z]{2,4}\d{3,4}[A-Z]?)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const refMatch = line.match(refPattern);
    if (!refMatch) continue;

    const reference = refMatch[1].toUpperCase();

    // Skip SHIPPING line
    if (/SHIPPING/i.test(line)) continue;

    console.log(`🔍 Found reference at line ${i}: ${reference}`);

    let description = '';
    let totalQty = 0;
    let unitPrice = 0;
    let netValue = 0;
    const sizeBreakdown: Array<{ size: string; qty: number }> = [];

    // Extract description: text after reference, before numbers
    const afterRef = line.substring(refMatch[0].length).trim();
    const descMatch = afterRef.match(/^(.+?)(?:\d+\s+Uni)/i);
    if (descMatch) {
      description = descMatch[1].trim();
    } else {
      description = afterRef;
    }

    // Extract qty, price, net value from the line
    // Pattern: N Uni. PP,PP€ Exempt NNN,NN€
    const qtyMatch = line.match(/(\d+)\s+Uni\./i);
    if (qtyMatch) totalQty = parseInt(qtyMatch[1]);

    // Find all euro amounts on the line
    const euroAmounts: number[] = [];
    const euroRe = /([\d]+[.,]\d{2})€/g;
    let em;
    while ((em = euroRe.exec(line)) !== null) {
      euroAmounts.push(parseFloat(em[1].replace(',', '.')));
    }

    if (euroAmounts.length >= 2) {
      unitPrice = euroAmounts[0];
      netValue = euroAmounts[euroAmounts.length - 1];
    } else if (euroAmounts.length === 1) {
      unitPrice = euroAmounts[0];
      netValue = euroAmounts[0];
    }

    // Look at the next line(s) for size breakdown
    // Pattern: "XS (1x) | S (1x) | M (1x) | L (1x) | HS Code: ..."
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
      const nextLine = lines[j];

      // Stop if we hit another reference
      if (nextLine.match(refPattern)) break;
      if (/SHIPPING/i.test(nextLine)) break;

      // Check for size breakdown pattern: "XS (1x) | S (1x) | ..."
      const sizePattern = /\b(XXS|XS|S|M|L|XL|XXL)\s*\((\d+)x?\)/gi;
      let sizeMatch;
      while ((sizeMatch = sizePattern.exec(nextLine)) !== null) {
        sizeBreakdown.push({
          size: sizeMatch[1].toUpperCase(),
          qty: parseInt(sizeMatch[2]),
        });
      }
    }

    // If no size breakdown found but we have qty, infer from standard sizes
    if (sizeBreakdown.length === 0 && totalQty > 0) {
      const defaultSizes = totalQty === 4
        ? ['XS', 'S', 'M', 'L']
        : totalQty === 3
          ? ['S', 'M', 'L']
          : ['XS', 'S', 'M', 'L'].slice(0, totalQty);
      for (const s of defaultSizes) {
        sizeBreakdown.push({ size: s, qty: 1 });
      }
    }

    console.log(`   Desc: "${description}", Qty: ${totalQty}, Price: ${unitPrice}, Net: ${netValue}`);
    console.log(`   Sizes: ${sizeBreakdown.map(s => `${s.size}(${s.qty})`).join(', ')}`);

    items.push({
      reference,
      description,
      totalQty,
      unitPrice,
      netValue,
      sizeBreakdown,
    });
  }

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

    console.log(`📋 Parsing Sisters Department PDF: ${pdfFile.originalFilename}`);

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
        error: 'No items found in Sisters Department invoice.',
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
