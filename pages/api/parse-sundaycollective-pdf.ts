import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface SundayCollectiveProduct {
  sku: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  msrp: number;
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

    console.log(`☀️ Parsing Sunday Collective PDF: ${pdfFile.originalFilename}`);

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

    const products: SundayCollectiveProduct[] = [];
    const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log(`📝 Total lines in PDF: ${lines.length}`);
    console.log(`📝 First 100 lines for debugging:`);
    lines.slice(0, 100).forEach((line, idx) => {
      console.log(`  ${idx}: "${line.substring(0, 150)}"`);
    });

    // Sunday Collective PDF structure:
    // Product header: "Avenue Shorts In Cucumber Stripe" (product name with color)
    // Size rows: "Size: 2Y-3Y      S26W2161-GR-2 1 €64,00 €28,00    €28,00"
    // Everything is on ONE line: Size, SKU, QTY, MSRP, PRICE, TOTAL
    
    // SKU pattern: S[0-9]{2}[A-Z][0-9]{4}-[A-Z]{2}?-\d{1,2} (may have spaces like "S26W2155- OR-2")
    const skuPattern = /(S\d{2}[A-Z]\d{4}-\s*[A-Z]{1,2}-\d{1,2})/;
    
    // Convert Sunday Collective size format (2Y-3Y) to Dutch format (2 jaar)
    const convertSizeToDutch = (size: string): string => {
      const sizeMap: { [key: string]: string } = {
        '2Y-3Y': '2 jaar',
        '4Y-5Y': '4 jaar',
        '6Y-7Y': '6 jaar',
        '8Y-9Y': '8 jaar',
        '10Y-11Y': '10 jaar',
      };
      return sizeMap[size] || size;
    };
    
    // Size pattern: "Size: XY-ZY" format
    const sizePattern = /Size:\s*(\d+Y-\d+Y)/i;
    
    // Full line pattern: Size: X-Y SKU QTY €MSRP €PRICE €TOTAL
    // Example: "Size: 2Y-3Y      S26W2161-GR-2 1 €64,00 €28,00    €28,00"
    const fullLinePattern = /Size:\s*(\d+Y-\d+Y)\s+(S\d{2}[A-Z]\d{4}-\s*[A-Z]{1,2}-\d{1,2})\s+(\d{1,2})\s+€(\d+[,.]\d{2})\s+€(\d+[,.]\d{2})/i;
    
    let currentProductName = '';
    let currentColor = '';
    
    // Handle product names that might be split across lines (e.g., "Organic Weekend Sweatshirt In" + "Cucumber")
    let pendingProductName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip header lines and page numbers
      if (line.match(/^(ITEM|SKU|QTY|MSRP|PRICE|TOTAL|V E N D O R|C U STO M E R|-- \d+ of \d+ --)$/i) ||
          line.match(/^Total Items/) ||
          line.match(/^Invoice (Total|Balance)/) ||
          line.match(/^Pay Invoice/) ||
          line.match(/^ORDER #/) ||
          line.match(/^SHIPMENT/) ||
          line.match(/^INVOICE/) ||
          line.match(/^Bill To/) ||
          line.match(/^Due Date/) ||
          line.match(/^Subtotal/) ||
          line.match(/^Payments/) ||
          line.match(/^Balance/) ||
          line.match(/^JD Link/) ||
          line.match(/^Jove bv/) ||
          line.match(/^Albert I/) ||
          line.match(/^Oostduinkerke/) ||
          line.match(/^\d{4}$/) ||
          line.match(/^margot@/) ||
          line.match(/^\+\d+/) ||
          line.match(/^43 AVENUE/)) {
        continue;
      }
      
      // Check if this is a product header (product name with "In" separator)
      // Pattern: "Product Name In Color Name" or split across lines
      const inMatch = line.match(/^(.+?)\s+In\s+(.+)$/i);
      if (inMatch) {
        currentProductName = inMatch[1].trim();
        currentColor = inMatch[2].trim();
        pendingProductName = '';
        console.log(`📦 Found product: "${currentProductName}" in "${currentColor}"`);
        continue;
      }
      
      // Handle split product names (e.g., "Organic Weekend Sweatshirt In" on one line, "Cucumber" on next)
      if (line.match(/In\s*$/i) && currentProductName === '') {
        pendingProductName = line.replace(/In\s*$/i, '').trim();
        continue;
      }
      
      if (pendingProductName && line.match(/^[A-Z][a-z]+(\s+[A-Za-z]+)*$/)) {
        currentProductName = pendingProductName;
        currentColor = line.trim();
        pendingProductName = '';
        console.log(`📦 Found split product: "${currentProductName}" in "${currentColor}"`);
        continue;
      }
      
      // Try to parse a full size line with all info
      const fullMatch = line.match(fullLinePattern);
      if (fullMatch && currentProductName) {
        const [, sizeRaw, skuRaw, qtyStr, msrpStr, priceStr] = fullMatch;
        const sku = skuRaw.replace(/\s+/g, ''); // Remove spaces from SKU
        const quantity = parseInt(qtyStr);
        const msrp = parseFloat(msrpStr.replace(',', '.'));
        const price = parseFloat(priceStr.replace(',', '.'));
        const size = convertSizeToDutch(sizeRaw); // Convert 2Y-3Y to 2 jaar
        
        products.push({
          sku,
          name: currentProductName,
          color: currentColor,
          size,
          quantity,
          price,
          msrp,
          total: price * quantity,
        });
        console.log(`✅ Added: ${sku} - ${currentProductName} (${currentColor}, ${size}) x${quantity} @ €${price}`);
        continue;
      }
      
      // Fallback: Try to find size and SKU separately on the same line
      const sizeMatch = line.match(sizePattern);
      if (sizeMatch && currentProductName) {
        const sizeRaw = sizeMatch[1];
        const size = convertSizeToDutch(sizeRaw); // Convert 2Y-3Y to 2 jaar
        const skuMatch = line.match(skuPattern);
        
        if (skuMatch) {
          const sku = skuMatch[1].replace(/\s+/g, '');
          
          // Extract quantity and prices from the same line
          const qtyMatch = line.match(/\s+(\d{1,2})\s+€/);
          const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
          
          const prices = line.match(/€(\d+[,.]\d{2})/g);
          let msrp = 0;
          let price = 0;
          if (prices && prices.length >= 2) {
            msrp = parseFloat(prices[0].replace('€', '').replace(',', '.'));
            price = parseFloat(prices[1].replace('€', '').replace(',', '.'));
          }
          
          products.push({
            sku,
            name: currentProductName,
            color: currentColor,
            size,
            quantity,
            price,
            msrp,
            total: price * quantity,
          });
          console.log(`✅ Added (fallback): ${sku} - ${currentProductName} (${currentColor}, ${size}) x${quantity} @ €${price}`);
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
    const csvHeader = 'SKU,Product Name,Color,Size,Quantity,Price (EUR),MSRP (EUR),Total (EUR)';
    const csvRows = products.map(p => 
      `${p.sku},"${p.name}","${p.color}","${p.size}",${p.quantity},${p.price.toFixed(2)},${p.msrp.toFixed(2)},${p.total.toFixed(2)}`
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
    console.error('❌ Error parsing Sunday Collective PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}
