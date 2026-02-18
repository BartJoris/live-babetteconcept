import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface FlossColor {
  color: string;
  sizes: Array<{ size: string; qty: number }>;
}

interface FlossProduct {
  styleNo: string;
  styleName: string;
  quality: string;
  price: number;
  rrp: number;
  total: number;
  totalQty: number;
  colors: FlossColor[];
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
    
    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`🌸 Parsing Flöss PDF: ${pdfFile.originalFilename}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);
    
    let pdfText = '';
    
    try {
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

    // Parse the Flöss Sales Order Confirmation PDF
    // Structure per product:
    //   Style no: F10854 Price: 16,40 EUR
    //   Style name: Fresa Onesie Total: 49,20 EUR
    //   Quality: 100% Cotton
    //   RRP: 41,00 EUR
    //   Assortments [sizes...] Qty Assort. Total Acc.
    //   Color: Blue Violet
    //   [Minimum qty|Free|Qty total]
    //   total [quantities...] [qty] [assort] [total] [acc]

    const products: FlossProduct[] = [];

    // Split by "Style no:" to get product sections
    const sections = pdfText.split(/Style no:\s*/i);
    
    console.log(`🌸 Found ${sections.length - 1} product sections`);

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const lines = section.split('\n').map(l => l.trim()).filter(l => l);

      // Line 0: "F10854 Price: 16,40 EUR" (Flöss) or "260208-50021 Price: 34,00 EUR" (Brunobruno)
      const styleNoMatch = lines[0]?.match(/^(F\d+|\d{6}-\d+)\s+Price:\s*([\d,.]+)\s*EUR/i);
      if (!styleNoMatch) {
        console.log(`  Section ${i}: No style no match in: ${lines[0]?.substring(0, 60)}`);
        continue;
      }
      const styleNo = styleNoMatch[1];
      const price = parseFloat(styleNoMatch[2].replace('.', '').replace(',', '.'));

      // Line 1: "Style name: Fresa Onesie Total: 49,20 EUR"
      const nameMatch = lines[1]?.match(/Style name:\s*(.+?)\s+Total:\s*([\d,.]+)\s*EUR/i);
      const styleName = nameMatch?.[1] || '';
      const total = nameMatch ? parseFloat(nameMatch[2].replace('.', '').replace(',', '.')) : 0;

      // Line 2: "Quality: 100% Cotton"
      const qualityMatch = lines[2]?.match(/Quality:\s*(.+)/i);
      const quality = qualityMatch?.[1]?.trim() || '';

      // Line 3: "RRP: 41,00 EUR"
      const rrpMatch = lines[3]?.match(/RRP:\s*([\d,.]+)\s*EUR/i);
      const rrp = rrpMatch ? parseFloat(rrpMatch[1].replace('.', '').replace(',', '.')) : 0;

      // Parse assortment sizes and color sections
      let sizeHeaders: string[] = [];
      const colors: FlossColor[] = [];
      let currentColor = '';

      for (let j = 4; j < lines.length; j++) {
        const line = lines[j];
        
        // Stop if we hit the next product or page footer
        if (/^Style no:/i.test(line) || /^(Flöss|brunobruno\s*nation)\s*ApS/i.test(line) || /^Page \d+ of \d+/i.test(line)) break;
        // Stop at totals/summary lines
        if (/^Total\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(line)) break;
        if (/^Brand QTY:/i.test(line)) break;
        if (/^Confirmation$/i.test(line)) break;

        // Parse Assortments line to get size headers
        if (/^Assortments?\s+/i.test(line)) {
          const sizePart = line.replace(/^Assortments?\s+/i, '').replace(/\s+Qty\s+Assort\.\s*Total\s*Acc\.?\s*$/i, '');
          sizeHeaders = sizePart.split(/\s+/).filter(s => s && s !== 'Qty' && s !== 'Assort.' && s !== 'Total' && s !== 'Acc.');
          continue;
        }

        // Parse Color line
        const colorMatch = line.match(/^Color:\s*(.+)/i);
        if (colorMatch) {
          currentColor = colorMatch[1].trim();
          continue;
        }

        // Parse quantity lines (starts with "Minimum qty", "Free", "Qty total", or "total" with numbers)
        if (/^(Minimum qty|Free|Qty total)$/i.test(line)) continue;

        // The "total" line or lines starting with numbers after "Free"/"Minimum qty total"
        // Brunobruno uses a size range prefix like "98-158/164" before quantities
        if (currentColor && sizeHeaders.length > 0) {
          const qtyLine = line.replace(/^total\s*/i, '').replace(/^\d{2,3}-\d{2,3}\/\d{2,3}\s+/, '');
          const numbers = qtyLine.split(/\s+/).map(n => parseInt(n)).filter(n => !isNaN(n));
          
          if (numbers.length >= 3) {
            // Last 3-4 numbers are: Qty, Assort, Total, Acc (or just Qty, Assort, Total)
            // The size quantities come before those summary columns
            const sizes: Array<{ size: string; qty: number }> = [];
            const sizeQtyCount = Math.min(numbers.length - 3, sizeHeaders.length);
            
            for (let k = 0; k < sizeQtyCount; k++) {
              if (numbers[k] > 0) {
                sizes.push({ size: sizeHeaders[k], qty: numbers[k] });
              }
            }

            if (sizes.length > 0) {
              colors.push({ color: currentColor, sizes });
            }
            currentColor = '';
          }
        }
      }

      const totalQty = colors.reduce((sum, c) => sum + c.sizes.reduce((s, sz) => s + sz.qty, 0), 0);

      if (styleNo && styleName) {
        products.push({
          styleNo,
          styleName,
          quality,
          price,
          rrp,
          total,
          totalQty,
          colors,
        });
        console.log(`  🌸 ${styleNo}: ${styleName} - €${price.toFixed(2)} (RRP €${rrp.toFixed(2)}) - ${colors.length} color(s), ${totalQty} total qty`);
      }
    }

    console.log(`✅ Extracted ${products.length} products from Flöss PDF`);

    fs.unlinkSync(pdfFile.filepath);

    return res.status(200).json({
      success: true,
      products,
      count: products.length,
      debugText: pdfText.substring(0, 3000),
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
