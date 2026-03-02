import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface PlayUpInvoiceItem {
  article: string;
  colourCode: string;
  description: string;
  sizes: Array<{ size: string; qty: number }>;
  totalQty: number;
  unitPrice: number;
}

/**
 * Play UP Factura - extract article+colour pairs from PDF text.
 * Article codes: 0AS11001, 1AS10900, 2AS10910, 5AS11350 etc.
 * Colour codes: P0087, M065, R366P, E768N, D001 etc.
 *
 * Strategy: scan each line for article codes. When found, look for
 * colour code and numbers on the same or adjacent lines.
 */
function extractInvoiceItems(pdfText: string): PlayUpInvoiceItem[] {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items: PlayUpInvoiceItem[] = [];
  const seen = new Set<string>();

  console.log(`📝 Play UP PDF: ${lines.length} non-empty lines`);
  lines.slice(0, 50).forEach((line, idx) => {
    console.log(`  ${idx}: "${line.substring(0, 180)}"`);
  });

  // Article pattern: digit + AS + 4-5 digits
  const articleRe = /\b(\d[A-Z]{2}\d{4,5})\b/g;
  // Colour code pattern: capital letter + 3-4 digits + optional capital letter
  const colourRe = /\b([A-Z]\d{3,4}[A-Z]?)\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer lines
    if (/^(Artigo|Article|Cor|Colour|Descri|Pagina|Page|ETFOR|CFTW|Expedi|Pagamento|Lista|Transportado|Continua|NIF|Impresso|Local de|JOVE|PYLY|BELGICA|8670|Bank|IBAN|SWIFT|Country|Isento|Quantidade|Desconto|Valor|Encargos|Descontos|Total|Cartões|V\/Nº)/i.test(line)) continue;

    // Find all article codes on this line
    articleRe.lastIndex = 0;
    let articleMatch;
    while ((articleMatch = articleRe.exec(line)) !== null) {
      const article = articleMatch[1];

      // Find colour code on the same line (after the article)
      const afterArticle = line.substring(articleMatch.index + article.length);
      colourRe.lastIndex = 0;
      const colourMatch = afterArticle.match(/\b([A-Z]\d{3,4}[A-Z]?)\b/);

      if (!colourMatch) continue;

      const colourCode = colourMatch[1];
      const key = `${article}_${colourCode}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // Extract description: uppercase text after colour code
      const afterColour = afterArticle.substring(afterArticle.indexOf(colourCode) + colourCode.length).trim();
      let description = '';
      const descMatch = afterColour.match(/^([A-Z][A-Z\s/%.0-9'-]+?)(?:\s{2,}|\s+\d|$)/);
      if (descMatch) {
        description = descMatch[1].trim();
        // Remove trailing HS codes
        description = description.replace(/\s*\d{4}\s*\d{2}\s*\d{2}.*$/, '').trim();
      }

      // Extract numbers from the rest of the line for qty and price
      const numbersInLine: number[] = [];
      const numRe = /\b(\d+(?:\.\d+)?)\b/g;
      let nm;
      // Only look at the part after description
      const numSearchArea = afterColour.substring(descMatch ? (descMatch.index || 0) + descMatch[0].length : 0);
      while ((nm = numRe.exec(numSearchArea)) !== null) {
        const val = parseFloat(nm[1]);
        // Skip HS code numbers (4+2+2 digit patterns)
        if (val > 0 && !(/^\d{4}$/.test(nm[1]) && numSearchArea.substring(nm.index + nm[1].length).match(/^\s+\d{2}\s+\d{2}/))) {
          numbersInLine.push(val);
        }
      }

      // Try to identify total qty and unit price
      // Typical: quantities (1s), then total, then price, then value
      let totalQty = 0;
      let unitPrice = 0;

      if (numbersInLine.length >= 2) {
        // Last number is usually the total value, second to last is price
        // Third from end is total qty
        const last = numbersInLine[numbersInLine.length - 1];
        const secondLast = numbersInLine[numbersInLine.length - 2];

        if (numbersInLine.length >= 3) {
          const thirdLast = numbersInLine[numbersInLine.length - 3];
          // Validate: thirdLast * secondLast ≈ last
          if (Math.abs(thirdLast * secondLast - last) < 1) {
            totalQty = thirdLast;
            unitPrice = secondLast;
          } else {
            totalQty = secondLast;
            unitPrice = last;
          }
        } else {
          totalQty = secondLast;
          unitPrice = last;
        }
      }

      // Build size list from the 1s in the line
      const sizes: Array<{ size: string; qty: number }> = [];
      // Look for size header on current or nearby lines to determine size columns
      // For now, just record the total

      if (totalQty <= 0 && numbersInLine.length > 0) {
        // Count the 1s as individual size quantities
        totalQty = numbersInLine.filter(n => n === 1).length;
        if (totalQty === 0) totalQty = numbersInLine[0] || 0;
      }

      if (article && colourCode && (totalQty > 0 || unitPrice > 0)) {
        items.push({
          article,
          colourCode,
          description,
          sizes,
          totalQty: totalQty || 1,
          unitPrice,
        });
        console.log(`   ✅ ${article} ${colourCode} "${description}" qty=${totalQty} price=${unitPrice}`);
      }
    }
  }

  console.log(`✅ Total: ${items.length} unique article+colour pairs found`);
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

      console.log(`✅ Play UP PDF: extracted ${pdfText.length} chars`);
    } catch (pdfError) {
      return res.status(500).json({ success: false, error: 'Failed to parse PDF: ' + (pdfError as Error).message });
    }

    const items = extractInvoiceItems(pdfText);
    const debugLines = pdfText.split('\n').filter(l => l.trim().length > 0).slice(0, 300);

    if (items.length === 0) {
      const sample = debugLines.slice(0, 30).map(l => l.substring(0, 120)).join('\n');
      return res.status(200).json({
        success: false,
        error: `Geen items gevonden in Play UP factuur.\n\nPDF tekst (eerste 30 regels):\n${sample}`,
        debugText: pdfText.substring(0, 10000),
        debugLines,
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
