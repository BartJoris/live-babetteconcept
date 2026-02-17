import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface BobochosesPrice {
  reference: string;
  wholesale: number;
  rrp: number;
  productName?: string;
}

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

    console.log(`🎪 Parsing Bobo Choses PDF: ${pdfFile.originalFilename}`);

    // Read PDF file and convert to Uint8Array
    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Use pdf-parse to extract text
    let pdfText = '';
    
    try {
      console.log('📦 Loading pdf-parse dynamically...');
      
      // Mock DOMMatrix to prevent errors in serverless environment
      if (typeof DOMMatrix === 'undefined') {
        console.log('📦 Creating DOMMatrix polyfill for serverless environment...');
        (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function() {
          return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        };
      }
      
      const pdfModule = await import('pdf-parse');
      const { PDFParse } = pdfModule;
      console.log('📦 PDFParse loaded, creating parser...');
      
      const parser = new PDFParse(pdfData);
      console.log('📦 Extracting text from PDF...');
      
      const textResult = await parser.getText();
      console.log('📦 getText result type:', typeof textResult);
      
      // getText returns object with pages array and text property
      if (textResult && typeof textResult === 'object') {
        if (textResult.text) {
          pdfText = textResult.text;
          console.log('📦 Using result.text');
        } else if (textResult.pages && Array.isArray(textResult.pages)) {
          pdfText = textResult.pages.map((page: { text?: string }) => page.text || '').join('\n');
          console.log('📦 Using result.pages');
        } else if (Array.isArray(textResult)) {
          pdfText = textResult.map((page: { text?: string } | string) => 
            typeof page === 'string' ? page : (page.text || '')
          ).join('\n');
          console.log('📦 Using array result');
        }
      } else {
        pdfText = String(textResult || '');
        console.log('📦 Using string conversion');
      }
      
      console.log(`✅ Extracted ${pdfText.length} characters from PDF`);
      if (pdfText.length > 0) {
        console.log('📝 First 500 chars:', pdfText.substring(0, 500));
      }
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to parse PDF: ' + (pdfError as Error).message
      });
    }

    // Parse the text to extract REF, Wholesale price, and European RRP
    // Format from screenshot:
    // Product Name
    // REF: B126AD088
    // Wholesale price
    // 52.83 eur
    // European RRP
    // 140 eur
    
    const prices: BobochosesPrice[] = [];
    const priceMap: Record<string, { wholesale: number; rrp: number }> = {};
    
    // Split by "REF:" to get individual product sections
    const sections = pdfText.split(/REF:\s*/i);
    
    console.log(`🎪 Found ${sections.length - 1} product sections`);
    
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      
      // Extract reference (B126XX### pattern - B + 3 digits + 2 letters + 3 digits)
      const refMatch = section.match(/^(B\d{3}[A-Z]{2}\d{3})/i);
      if (!refMatch) {
        console.log(`  Section ${i}: No reference match in first 50 chars: ${section.substring(0, 50)}`);
        continue;
      }
      
      const reference = refMatch[1].toUpperCase();
      
      // Extract wholesale price - look for "Wholesale price" followed by number
      // May have variations like "Wholesale price\n52.83 eur" or "Wholesale price 52,83 eur"
      const wholesaleMatch = section.match(/Wholesale\s*price[\s\n]*(\d+(?:[.,]\d+)?)\s*eur/i);
      const wholesale = wholesaleMatch ? parseFloat(wholesaleMatch[1].replace(',', '.')) : 0;
      
      // Extract European RRP - look for "European RRP" or just "RRP" followed by number
      const rrpMatch = section.match(/(?:European\s*)?RRP[\s\n]*(\d+(?:[.,]\d+)?)\s*eur/i);
      const rrp = rrpMatch ? parseFloat(rrpMatch[1].replace(',', '.')) : 0;
      
      if (wholesale > 0 || rrp > 0) {
        prices.push({ reference, wholesale, rrp });
        priceMap[reference] = { wholesale, rrp };
        console.log(`  🎪 ${reference}: Wholesale €${wholesale.toFixed(2)}, RRP €${rrp.toFixed(2)}`);
      } else {
        console.log(`  Section ${i}: Reference ${reference} found but no prices`);
      }
    }

    console.log(`✅ Extracted ${prices.length} prices from Bobo Choses PDF`);

    // Clean up temp file
    fs.unlinkSync(pdfFile.filepath);

    return res.status(200).json({
      success: true,
      prices,
      priceMap,
      count: prices.length,
      debugText: pdfText.substring(0, 2000), // First 2000 chars for debugging
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
