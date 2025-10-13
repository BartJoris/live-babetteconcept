import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the form data to get the PDF file
    const form = formidable({});
    const [, files] = await form.parse(req);
    
    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`📋 Parsing PDF: ${pdfFile.originalFilename}`);

    // Read PDF file and convert to Uint8Array
    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Use pdf-parse to extract text
    let pdfText = '';
    
    try {
      console.log('📦 Loading pdf-parse dynamically...');
      const pdfModule = await import('pdf-parse');
      const { PDFParse } = pdfModule;
      console.log('📦 PDFParse loaded, creating parser...');
      
      const parser = new PDFParse(pdfData);
      console.log('📦 Extracting text from PDF...');
      const textResult = await parser.getText();
      console.log('📦 getText result type:', typeof textResult, 'value:', textResult);
      
      // getText returns pages array, we need to join them
      if (Array.isArray(textResult)) {
        pdfText = textResult.map(page => page.text || page).join('\n');
      } else if (textResult && typeof textResult === 'object' && textResult.text) {
        pdfText = textResult.text;
      } else {
        pdfText = String(textResult || '');
      }
      
      console.log(`✅ Extracted ${pdfText.length} characters from PDF`);
      if (pdfText.length > 0) {
        console.log('📝 PDF Text (first 1500 chars):\n', pdfText.substring(0, 1500));
      }
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to parse PDF: ' + (pdfError as Error).message
      });
    }

    // Parse the text to extract SKU and prices
    // Format: SKU on one line, then "1,00 \t65,40" on next line (Qty \t Unit price)
    const prices: Record<string, number> = {};
    const lines = pdfText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for SKU pattern at start of line (AW25-XXXXX-YY)
      const skuMatch = line.match(/^(AW25-[A-Z0-9]+-[A-Z0-9]+)/);
      if (skuMatch) {
        const sku = skuMatch[1];
        
        // Look ahead to find the line with "1,00 \t price" pattern
        // Usually 1-2 lines after the SKU line
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j];
          // Match pattern: "1,00 \t 65,40" (quantity tab price)
          const priceMatch = nextLine.match(/1,00\s+(\d+[,.]\d{2})/);
          if (priceMatch) {
            const unitPriceStr = priceMatch[1];
            const price = parseFloat(unitPriceStr.replace(',', '.'));
            
            if (!isNaN(price) && price > 0) {
              prices[sku] = price;
              console.log(`  ${sku}: €${price.toFixed(2)}`);
              break; // Found price for this SKU, move to next SKU
            }
          }
        }
      }
    }

    console.log(`✅ Extracted ${Object.keys(prices).length} prices from PDF`);

    // Clean up temp file
    fs.unlinkSync(pdfFile.filepath);

    return res.status(200).json({
      success: true,
      prices,
      count: Object.keys(prices).length,
    });

  } catch (error) {
    console.error('PDF parsing error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to parse PDF',
    });
  }
}

