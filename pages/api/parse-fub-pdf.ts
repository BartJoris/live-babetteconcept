import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface FubPdfProduct {
  articleName: string;
  color: string;
  totalQty: number;
  unitPrice: number;
  eanBySize: Array<{ euSize: string; qty: number; ean: string }>;
}

/**
 * FUB Order Confirmation PDF structure (clean text):
 *   Baby SS Body (4726 SS) butter 5 Pcs 90,00
 *   Certificate: 19981 (GOTS organic)
 *   EAN codes
 *   62\n1\n5712199417761\n68\n1\n5712199417778\n...
 *   18,00
 */
function extractProducts(pdfText: string): FubPdfProduct[] {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const products: FubPdfProduct[] = [];

  const productLineRe = /^(.+?)\s+(\d+)\s+Pcs\s+([\d.,]+)$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const productMatch = line.match(productLineRe);

    if (!productMatch) {
      i++;
      continue;
    }

    const fullArticle = productMatch[1].trim();
    const totalQty = parseInt(productMatch[2]);

    // Extract color: last word(s) after the article code pattern "(XXXX SS)"
    let articleName = fullArticle;
    let color = '';
    const codeMatch = fullArticle.match(/^(.+?\(\d+\s*SS\))\s+(.+)$/i);
    if (codeMatch) {
      articleName = codeMatch[1].trim();
      color = codeMatch[2].trim().toLowerCase();
    }

    console.log(`🔍 Product: "${articleName}" color="${color}" qty=${totalQty}`);

    // Skip certificate and "EAN codes" lines
    i++;
    while (i < lines.length && (lines[i].startsWith('Certificate:') || lines[i] === 'EAN codes')) {
      i++;
    }

    // Parse EAN triplets: euSize, qty, ean
    const eanBySize: Array<{ euSize: string; qty: number; ean: string }> = [];
    while (i < lines.length) {
      const sizeLine = lines[i];
      // EU sizes are 2-3 digit numbers
      if (!/^\d{2,3}$/.test(sizeLine)) break;

      const euSize = sizeLine;
      const qty = parseInt(lines[i + 1]) || 1;
      const ean = lines[i + 2] || '';

      if (/^\d{10,13}$/.test(ean)) {
        eanBySize.push({ euSize, qty, ean });
        i += 3;
      } else {
        break;
      }
    }

    // Unit price: next decimal number
    let unitPrice = 0;
    if (i < lines.length) {
      const priceMatch = lines[i].match(/^([\d.,]+)$/);
      if (priceMatch) {
        unitPrice = parseFloat(priceMatch[1].replace(',', '.'));
        i++;
      }
    }

    console.log(`   EAN codes: ${eanBySize.length}, unitPrice: ${unitPrice}`);

    products.push({
      articleName,
      color,
      totalQty,
      unitPrice,
      eanBySize,
    });
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

    const pdfFile = files.pdf?.[0] || files.file?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`📋 Parsing FUB PDF: ${pdfFile.originalFilename}`);

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

    const products = extractProducts(pdfText);

    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No products found in FUB PDF.',
        debugText: pdfText.substring(0, 5000),
      });
    }

    return res.status(200).json({
      success: true,
      products,
      productCount: products.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}
