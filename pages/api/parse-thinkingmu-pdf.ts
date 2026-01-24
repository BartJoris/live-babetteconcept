import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface ThinkingMuProduct {
  barcode: string;
  name: string;
  styleCode: string;
  size: string;
  quantity: number;
  price: number;
  total: number;
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

    console.log(`📋 Parsing Thinking Mu PDF: ${pdfFile.originalFilename}`);

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

    const products: ThinkingMuProduct[] = [];
    const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log(`📝 Total lines in PDF: ${lines.length}`);
    console.log(`📝 First 100 lines for debugging:`);
    lines.slice(0, 100).forEach((line, idx) => {
      console.log(`  ${idx}: "${line.substring(0, 150)}"`);
    });

    // Thinking Mu PDF structure (extracted line by line):
    // 1. Barcode line: "8435512929389" (13 digits starting with 8435512)
    // 2. Product name line(s): "OMNIA SOL ECRU TESSA" + "KNITTED SWEATER" (can be 1-3 lines)
    // 3. Style code line: "WKN00256,S" (pattern: 3 letters + 5 digits + comma + size)
    // 4. Price line: "60,00€ 1 60,00€ 0% 60,00€" (price, qty, subtotal, IVA, total)
    
    // Style code pattern: 3 uppercase letters + 5 digits, comma, size (XS/S/M/L/XL/XXL/U or 2-digit number)
    const styleCodePattern = /^([A-Z]{3}\d{5}),([A-Z]{1,3}|U|\d{2})$/i;
    
    // Price line pattern: XX,XX€ followed by quantity and more prices
    const priceLinePattern = /^(\d+[,.]\d{2})€\s+(\d+)\s+/;
    
    // Barcode pattern: Thinking Mu uses 8435512XXXXXX
    const barcodePattern = /^(8435512\d{6})$/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for barcode lines
      const barcodeMatch = line.match(barcodePattern);
      
      if (barcodeMatch) {
        const barcode = barcodeMatch[1];
        console.log(`🔍 Found barcode at line ${i}: ${barcode}`);
        
        // Collect lines until we find the style code
        const productNameParts: string[] = [];
        let styleCode = '';
        let size = '';
        let price = 0;
        let quantity = 1;
        let total = 0;
        
        // Look at the following lines to build the product
        for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
          const checkLine = lines[j];
          
          // Check if this is a style code line
          const styleMatch = checkLine.match(styleCodePattern);
          if (styleMatch) {
            styleCode = styleMatch[1].toUpperCase();
            size = styleMatch[2].toUpperCase();
            console.log(`   Found style code: ${styleCode}, size: ${size}`);
            
            // The next line should be the price line
            if (j + 1 < lines.length) {
              const priceLineMatch = lines[j + 1].match(priceLinePattern);
              if (priceLineMatch) {
                price = parseFloat(priceLineMatch[1].replace(',', '.'));
                quantity = parseInt(priceLineMatch[2]);
                total = price * quantity;
                console.log(`   Found price: €${price}, qty: ${quantity}`);
              }
            }
            break;
          }
          
          // Check if this is the next barcode (we've gone too far)
          if (checkLine.match(barcodePattern)) {
            console.log(`   Hit next barcode at line ${j}, stopping`);
            break;
          }
          
          // Check if this is a price line (we've gone past the style code somehow)
          if (checkLine.match(priceLinePattern)) {
            console.log(`   Hit price line without style code at line ${j}`);
            break;
          }
          
          // Skip header lines and page numbers
          if (checkLine.match(/^(CODE|CONCEPT|PRICE|UNITS|SUBTOTAL|IVA|TOTAL|\d\/\d)$/i)) {
            continue;
          }
          
          // Skip footer/header content
          if (checkLine.match(/^(Registered|SWIFT|BANK|PAYMENT|IBAN|THINKING MU|INVOICE)/i)) {
            continue;
          }
          
          // This must be part of the product name
          productNameParts.push(checkLine);
          console.log(`   Adding name part: "${checkLine}"`);
        }
        
        // Combine product name parts
        const productName = productNameParts.join(' ').trim();
        
        if (barcode && productName && styleCode) {
          products.push({
            barcode,
            name: productName,
            styleCode,
            size,
            quantity,
            price,
            total,
          });
          console.log(`✅ Added product: ${barcode} - "${productName}" (${styleCode}, ${size}) x${quantity} @ €${price}`);
        } else {
          console.log(`⚠️ Incomplete product: barcode=${barcode}, name="${productName}", style=${styleCode}`);
        }
      }
    }

    console.log(`✅ Successfully parsed ${products.length} products`);

    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No products found in PDF. The PDF format may not be recognized.',
        debugText: pdfText.substring(0, 5000),
        debugLines: lines.slice(0, 150),
      });
    }

    // Generate CSV
    const csvHeader = 'Barcode,Product Name,Style Code,Size,Quantity,Price (EUR),Total (EUR)';
    const csvRows = products.map(p => 
      `${p.barcode},"${p.name}","${p.styleCode}","${p.size}",${p.quantity},${p.price.toFixed(2)},${p.total.toFixed(2)}`
    );
    const csv = [csvHeader, ...csvRows].join('\n');

    // Calculate totals
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
    const totalValue = products.reduce((sum, p) => sum + p.total, 0);

    return res.status(200).json({
      success: true,
      products,
      csv,
      productCount: products.length,
      totalQuantity,
      totalValue,
    });
  } catch (error) {
    console.error('❌ Error parsing Thinking Mu PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}
