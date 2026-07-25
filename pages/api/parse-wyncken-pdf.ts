import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import {
  isWynckenSalesOrderText,
  parseWynckenSalesOrderText,
  type WynckenPdfProduct,
} from '@/lib/suppliers/wyncken/sales-order';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function extractPdfText(pdfData: Uint8Array): Promise<string> {
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
      return textResult.pages.map((page: { text?: string }) => page.text || '').join('\n');
    }
    if (Array.isArray(textResult)) {
      return textResult
        .map((page: { text?: string } | string) =>
          typeof page === 'string' ? page : page.text || '',
        )
        .join('\n');
    }
  }

  return String(textResult || '');
}

/** Legacy proforma layout: Style: / Fabric: / Colour: / Qty / Unit Price */
function parseProformaText(pdfText: string): WynckenPdfProduct[] {
  const products: WynckenPdfProduct[] = [];
  const lines = pdfText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === 'Style:' || line.match(/^Style:\s*$/i)) {
      const styleParts: string[] = [];
      let fabric = '';
      let colour = '';
      let materialContent = '';
      let quantity = 0;
      let unitPrice = 0;
      let total = 0;

      let j = i + 1;
      let foundQty = false;
      let foundUnitPrice = false;
      let foundFabric = false;
      let foundColourLabel = false;

      while (j < lines.length && j < i + 30) {
        const nextLine = lines[j].trim();

        if (nextLine.startsWith('Fabric:') || nextLine.match(/^Fabric:\s+/i)) {
          foundFabric = true;
          const fabricMatch = nextLine.match(/Fabric:\s*(.+)/i);
          if (fabricMatch) fabric = fabricMatch[1].trim();
        } else if (nextLine.startsWith('Colour:') || nextLine.match(/^Colour:\s+/i)) {
          foundColourLabel = true;
          const colourMatch = nextLine.match(/Colour:\s*(.+)/i);
          if (colourMatch && colourMatch[1].trim()) {
            colour = colourMatch[1].trim();
            foundColourLabel = false;
          }
        } else if (
          foundColourLabel &&
          !colour &&
          nextLine.length > 0 &&
          !nextLine.match(
            /^(Fabric:|Colour:|Description:|COO:|Material Content:|Qty|Unit Price|Total|Style:)$/i,
          )
        ) {
          colour = nextLine.trim();
          foundColourLabel = false;
        } else if (nextLine === 'Qty' || nextLine.match(/^Qty\s*$/i)) {
          foundQty = true;
        } else if (foundQty && !foundUnitPrice && /^\d+$/.test(nextLine)) {
          quantity = parseInt(nextLine, 10);
        } else if (nextLine === 'Unit Price' || nextLine.match(/^Unit Price\s*$/i)) {
          foundUnitPrice = true;
        } else if (foundUnitPrice && nextLine.match(/€\s*\d+[,.]\d{2}/)) {
          const priceMatch = nextLine.match(/€\s*(\d+[,.]\d{2})\s*€\s*(\d+[,.]\d{2})/);
          if (priceMatch) {
            unitPrice = parseFloat(priceMatch[1].replace(',', '.'));
            total = parseFloat(priceMatch[2].replace(',', '.'));
            break;
          }
        } else if (nextLine.startsWith('Style:') || nextLine.match(/^Style:\s+/i)) {
          break;
        } else if (!foundFabric && nextLine.length > 0) {
          if (
            !nextLine.match(
              /^(Fabric:|Colour:|Description:|COO:|Material Content:|Qty|Unit Price|Total|Style:)$/i,
            ) &&
            !nextLine.match(/^\d+$/) &&
            !nextLine.match(/^€/) &&
            !nextLine.match(/^(IN|D|PRT|CHN)$/)
          ) {
            styleParts.push(nextLine);
          }
        }

        if (
          !materialContent &&
          nextLine.includes('%') &&
          (nextLine.includes('COTTON') ||
            nextLine.includes('NYLON') ||
            nextLine.includes('POLY'))
        ) {
          materialContent = nextLine;
        }

        j += 1;
      }

      const style = styleParts.join(' ').trim();
      if (style && quantity > 0 && unitPrice > 0) {
        products.push({
          style,
          fabric,
          colour,
          materialContent,
          quantity,
          unitPrice,
          total,
        });
      }
    }

    i += 1;
  }

  return products;
}

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
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

    console.log(`📋 Parsing Wyncken PDF: ${pdfFile.originalFilename}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    let pdfText = '';
    try {
      pdfText = await extractPdfText(new Uint8Array(pdfBuffer));
      console.log(`✅ Extracted ${pdfText.length} characters from Wyncken PDF`);
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({
        success: false,
        error: 'Failed to parse PDF: ' + (pdfError as Error).message,
      });
    }

    let products: WynckenPdfProduct[] = [];
    let source: 'sales_order' | 'proforma' = 'proforma';

    if (isWynckenSalesOrderText(pdfText)) {
      products = parseWynckenSalesOrderText(pdfText);
      source = 'sales_order';
      console.log(`📦 Detected sales order — ${products.length} lines with size grids`);
    } else {
      products = parseProformaText(pdfText);
      source = 'proforma';
      console.log(`📦 Detected proforma — ${products.length} lines`);
    }

    try {
      fs.unlinkSync(pdfFile.filepath);
    } catch {
      /* ignore */
    }

    console.log(`🎉 Parsed ${products.length} products from Wyncken PDF (${source})`);

    return res.status(200).json({
      success: true,
      products,
      source,
      count: products.length,
    });
  } catch (error) {
    console.error('❌ Error parsing Wyncken PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + (error as Error).message,
    });
  }
}

export default withAuth(handler);
