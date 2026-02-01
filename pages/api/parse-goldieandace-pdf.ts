import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

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

export default async function handler(
  req: NextApiRequest,
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

    // Goldie and Ace invoice structure:
    // Table format: Description | Quantity | Unit Price | GST | Amount EUR
    // Example: "COLOUR BLOCK OXFORD BURTON OVERALLS 2Y | 1.00 | 27.60 | GST Free | 27.60"
    
    // Pattern to match product lines: Product name with size, quantity, price, GST, amount
    // Skip header lines and footer lines
    const productLinePattern = /^([A-Z][A-Z\s\/\-\(\)]+(?:\d+Y|\d+-\d+Y|\d+-\d+M|\d+M|\dY))\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+GST\s+Free\s+(\d+\.\d{2})$/i;
    
    // Also handle lines where product name might be split
    let pendingProductName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip header/footer lines
      if (line.match(/^(Description|Quantity|Unit Price|GST|Amount EUR|TAX INVOICE|Goldie|Jove|Invoice Date|Invoice Number|Reference|Order|ABN|Registered|Due Date|BANK|VISA|VAT reverse|Minus|Freight|Subtotal|TOTAL EUR)$/i) ||
          line.match(/^\|/) ||
          line.match(/^---/) ||
          line.match(/^View and pay/) ||
          line.match(/^Port Melbourne/) ||
          line.match(/^Brussels/) ||
          line.match(/^Woodhaven/) ||
          line.match(/^Pylyserlaan/) ||
          line.match(/^KOKSIJDE/) ||
          line.match(/^BELGIUM/) ||
          line.match(/^\d{4}$/) ||
          line.match(/^hello@/) ||
          line.match(/^www\./)) {
        continue;
      }
      
      // Try to match full product line
      const match = line.match(/^(.+?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+GST\s+Free\s+(\d+\.\d{2})$/i);
      if (match) {
        const [, description, qtyStr, unitPriceStr, amountStr] = match;
        
        // Check if description contains a size (ends with Y, M, or age range)
        if (description.match(/\d+Y|\d+-\d+Y|\d+-\d+M|\d+M|\dY$/i)) {
          const quantity = parseFloat(qtyStr);
          const unitPrice = parseFloat(unitPriceStr);
          const amount = parseFloat(amountStr);
          
          products.push({
            description: description.trim(),
            quantity,
            unitPrice,
            amount,
          });
          console.log(`✅ Found product: "${description.trim()}" x${quantity} @ €${unitPrice}`);
          pendingProductName = '';
        } else {
          // Might be a product name without size, save for next line
          pendingProductName = description.trim();
        }
        continue;
      }
      
      // Handle product names that might be on separate lines
      if (pendingProductName && line.match(/^\d+\.\d{2}\s+\d+\.\d{2}\s+GST\s+Free\s+\d+\.\d{2}$/)) {
        const parts = line.match(/^(\d+\.\d{2})\s+(\d+\.\d{2})\s+GST\s+Free\s+(\d+\.\d{2})$/);
        if (parts) {
          const quantity = parseFloat(parts[1]);
          const unitPrice = parseFloat(parts[2]);
          const amount = parseFloat(parts[3]);
          
          products.push({
            description: pendingProductName,
            quantity,
            unitPrice,
            amount,
          });
          console.log(`✅ Found product (split): "${pendingProductName}" x${quantity} @ €${unitPrice}`);
          pendingProductName = '';
        }
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
