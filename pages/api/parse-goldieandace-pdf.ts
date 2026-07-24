import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface GoldieAndAceInvoiceProduct {
  description: string; // Full product name with size, e.g., "COLOUR BLOCK OXFORD BURTON OVERALLS 2Y"
  quantity: number;
  unitPrice: number;
  amount: number;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
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

    console.log(`🌻 Parsing Goldie and Ace PDF: ${pdfFile.originalFilename}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);
    
    let pdfText = '';
    
    try {
      console.log('📦 Loading pdf-parse...');
      
      if (typeof DOMMatrix === 'undefined') {
        (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function() {
          return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        };
      }
      
      const pdfModule = await import('pdf-parse');
      const { PDFParse } = pdfModule;
      
      const parser = new PDFParse(pdfData);
      const textResult = await parser.getText();
      
      if (textResult && typeof textResult === 'object') {
        if (textResult.text) {
          pdfText = textResult.text;
        } else if (textResult.pages && Array.isArray(textResult.pages)) {
          pdfText = textResult.pages.map((page: { text?: string }) => page.text || '').join('\n');
        } else if (Array.isArray(textResult)) {
          pdfText = textResult.map((page: { text?: string } | string) => 
            typeof page === 'string' ? page : (page.text || '')
          ).join('\n');
        }
      } else {
        pdfText = String(textResult || '');
      }
      
      console.log(`✅ Extracted ${pdfText.length} characters from PDF`);
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to parse PDF: ' + (pdfError as Error).message
      });
    }

    const products: GoldieAndAceInvoiceProduct[] = [];
    const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log(`📝 Total lines in PDF: ${lines.length}`);
    console.log(`📝 First 100 lines for debugging:`);
    lines.slice(0, 100).forEach((line, idx) => {
      console.log(`  ${idx}: "${line.substring(0, 150)}"`);
    });

    // Goldie and Ace invoice format:
    // Single line: "PRODUCT NAME SIZE qty price GST Free amount"
    // Multi-line: product name + colour/size may span 2-3 lines before the numbers line
    
    let pendingProductName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip header/footer/non-product lines
      if (line.match(/^(Description|Quantity|Unit Price|GST|Amount EUR|TAX INVOICE)$/i) ||
          line.match(/^Description\s+Quantity/i) ||
          line.match(/^(Goldie|Jove|Invoice|Reference|Order|ABN|Registered|Due Date|BANK|VISA|VAT|Minus|Freight|Subtotal|TOTAL)/i) ||
          line.match(/^\|/) ||
          line.match(/^---/) ||
          line.match(/^--\s*\d+\s+of\s+\d+\s*--/) ||
          line.match(/^View and pay/) ||
          line.match(/^Port Melbourne/i) ||
          line.match(/^Brussels/i) ||
          line.match(/^Woodhaven/i) ||
          line.match(/^Pylyserlaan/i) ||
          line.match(/^KOKSIJDE/) ||
          line.match(/^BELGIUM/) ||
          line.match(/^VICTORIA/) ||
          line.match(/^\d{4}$/) ||
          line.match(/^hello@/) ||
          line.match(/^www\./) ||
          line.match(/^Account/i) ||
          line.match(/^BSB:/i) ||
          line.match(/^BIC/i) ||
          line.match(/^IBAN/i) ||
          line.match(/^Routing/i) ||
          line.match(/^Bank name/i) ||
          line.match(/^Swift/i) ||
          line.match(/^Rue\s/i) ||
          line.match(/^Community Federal/i) ||
          line.match(/^\d{1,2}\s+\w{3,}\s+\d{4}$/) ||
          line.match(/^SS\d+/)) {
        pendingProductName = '';
        continue;
      }
      
      // Try to match full product line (description + numbers on same line)
      const match = line.match(/^(.+?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+GST\s+Free\s+(\d+\.\d{2})$/i);
      if (match) {
        let [, description, qtyStr, unitPriceStr, amountStr] = match;
        
        if (pendingProductName) {
          description = pendingProductName + ' ' + description;
          pendingProductName = '';
        }
        
        if (description.match(/\d+Y|\d+-\d+Y|\d+-\d+M|\d+M|\dY$/i)) {
          products.push({
            description: description.trim(),
            quantity: parseFloat(qtyStr),
            unitPrice: parseFloat(unitPriceStr),
            amount: parseFloat(amountStr),
          });
          console.log(`✅ Found product: "${description.trim()}" x${parseFloat(qtyStr)} @ €${parseFloat(unitPriceStr)}`);
        } else {
          pendingProductName = description.trim();
        }
        continue;
      }
      
      // Check if this is a numbers-only line (for multi-line split products)
      const numbersMatch = line.match(/^(\d+\.\d{2})\s+(\d+\.\d{2})\s+GST\s+Free\s+(\d+\.\d{2})$/);
      if (numbersMatch && pendingProductName) {
        if (pendingProductName.match(/\d+Y|\d+-\d+Y|\d+-\d+M|\d+M|\dY$/i)) {
          products.push({
            description: pendingProductName.trim(),
            quantity: parseFloat(numbersMatch[1]),
            unitPrice: parseFloat(numbersMatch[2]),
            amount: parseFloat(numbersMatch[3]),
          });
          console.log(`✅ Found product (multi-line): "${pendingProductName.trim()}" x${parseFloat(numbersMatch[1])} @ €${parseFloat(numbersMatch[2])}`);
        }
        pendingProductName = '';
        continue;
      }
      
      // Accumulate text lines as potential product name/continuation
      if (pendingProductName) {
        pendingProductName = pendingProductName + ' ' + line;
      } else {
        pendingProductName = line;
      }
    }

    console.log(`✅ Successfully parsed ${products.length} products from invoice`);

    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No products found in PDF. The PDF format may not be recognized.',
        debugText: pdfText.substring(0, 5000),
        debugLines: lines.slice(0, 150),
      });
    }

    return res.status(200).json({
      success: true,
      products,
      productCount: products.length,
    });
  } catch (error) {
    console.error('❌ Error parsing Goldie and Ace PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}

export default withAuth(handler);
