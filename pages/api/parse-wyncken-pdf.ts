import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface WynckenProduct {
  style: string;
  fabric: string;
  colour: string;
  materialContent: string;
  quantity: number;
  unitPrice: number;
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

    console.log(`📋 Parsing Wyncken PDF: ${pdfFile.originalFilename}`);

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

    const products: WynckenProduct[] = [];
    const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log(`📝 Total lines in PDF: ${lines.length}`);
    console.log(`📝 First 150 lines for debugging:`);
    lines.slice(0, 150).forEach((line, idx) => {
      if (line.trim().length > 0) {
        console.log(`  ${idx}: "${line.substring(0, 120)}"`);
      }
    });

    // Wyncken PDF structure (multi-line format):
    // Style:
    // WK20W170 PULL ON PATCH
    // JEAN LIGHT WEIGHT
    // Fabric: COTTON
    // Colour: MID WASH DENIM
    // Description:
    // COO: IN D
    // 100% COTTON
    // Material Content: HTS: MID: Type:
    // Qty
    // 5
    // Unit Price
    // € 26.50 € 132.50  (unit price and total on same line)
    // Total
    // 5

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Look for "Style:" line
      if (line === 'Style:' || line.match(/^Style:\s*$/i)) {
        // Style name might be on next lines, collect until we hit "Fabric:"
        let styleParts: string[] = [];
        let fabric = '';
        let colour = '';
        let materialContent = '';
        let quantity = 0;
        let unitPrice = 0;
        let total = 0;
        
        // Look ahead for Style name (until Fabric:), Fabric, Colour, Material Content, and Qty/Price
        let j = i + 1;
        let foundQty = false;
        let foundUnitPrice = false;
        let foundFabric = false; // Track when we've found Fabric: to stop collecting style parts
        let foundColourLabel = false; // Track when we've found Colour: label to capture next line if needed
        
        while (j < lines.length && j < i + 30) {
          const nextLine = lines[j].trim();
          
          if (nextLine.startsWith('Fabric:') || nextLine.match(/^Fabric:\s+/i)) {
            foundFabric = true; // Stop collecting style parts
            const fabricMatch = nextLine.match(/Fabric:\s*(.+)/i);
            if (fabricMatch) {
              fabric = fabricMatch[1].trim();
            }
          } else if (nextLine.startsWith('Colour:') || nextLine.match(/^Colour:\s+/i)) {
            foundColourLabel = true;
            const colourMatch = nextLine.match(/Colour:\s*(.+)/i);
            if (colourMatch && colourMatch[1].trim()) {
              // Colour is on the same line
              colour = colourMatch[1].trim();
              console.log(`🎨 Found colour on same line: "${colour}"`);
              foundColourLabel = false; // Reset since we found it
            } else {
              console.log(`🎨 Found Colour: label, checking next line for colour value`);
            }
            // If no colour on same line, we'll check next line below
          } else if (foundColourLabel && !colour && nextLine.length > 0 && 
                     !nextLine.match(/^(Fabric:|Colour:|Description:|COO:|Material Content:|Qty|Unit Price|Total|Style:)$/i)) {
            // Colour label was found but colour value is on next line
            colour = nextLine.trim();
            console.log(`🎨 Found colour on next line: "${colour}"`);
            foundColourLabel = false; // Reset
          } else if (nextLine.startsWith('Material Content:') || nextLine.match(/^Material Content:\s+/i)) {
            // Material Content line might have extra info, look for actual content on previous lines
            // The actual material content is usually on the line before "Material Content:"
            // Look backwards for a line with percentage and material type
            for (let k = j - 1; k >= i && k >= j - 5; k--) {
              const prevLine = lines[k]?.trim();
              if (prevLine && prevLine.includes('%') && 
                  (prevLine.includes('COTTON') || prevLine.includes('NYLON') || 
                   prevLine.includes('POLY') || prevLine.includes('POLYESTER') ||
                   prevLine.includes('VISCOSE'))) {
                materialContent = prevLine;
                break;
              }
            }
          } else if (!materialContent && nextLine.includes('%') && 
                     (nextLine.includes('COTTON') || nextLine.includes('NYLON') || 
                      nextLine.includes('POLY') || nextLine.includes('POLYESTER') ||
                      nextLine.includes('VISCOSE'))) {
            // Material content might appear before the "Material Content:" label
            materialContent = nextLine;
          } else if (nextLine === 'Qty' || nextLine.match(/^Qty\s*$/i)) {
            foundQty = true;
          } else if (foundQty && !foundUnitPrice && /^\d+$/.test(nextLine)) {
            // After "Qty" label, the next number is the quantity
            quantity = parseInt(nextLine);
          } else if (nextLine === 'Unit Price' || nextLine.match(/^Unit Price\s*$/i)) {
            foundUnitPrice = true;
          } else if (foundUnitPrice && nextLine.match(/€\s*\d+[,.]\d{2}/)) {
            // Unit Price line contains: "€ 26.50 € 132.50" (unit price and total)
            const priceMatch = nextLine.match(/€\s*(\d+[,.]\d{2})\s*€\s*(\d+[,.]\d{2})/);
            if (priceMatch) {
              unitPrice = parseFloat(priceMatch[1].replace(',', '.'));
              total = parseFloat(priceMatch[2].replace(',', '.'));
              break; // Found all price info, stop looking
            }
          } else if (nextLine.startsWith('Style:') || nextLine.match(/^Style:\s+/i)) {
            // Next product found, stop
            break;
          } else if (!foundFabric && nextLine.length > 0) {
            // Collect style name parts (everything before Fabric:)
            // Skip labels and numbers/currency
            if (!nextLine.match(/^(Fabric:|Colour:|Description:|COO:|Material Content:|Qty|Unit Price|Total|Style:)$/i) &&
                !nextLine.match(/^\d+$/) && 
                !nextLine.match(/^€/) &&
                !nextLine.match(/^(IN|D|PRT|CHN)$/)) {
              styleParts.push(nextLine);
            }
          }
          
          j++;
        }
        
        const style = styleParts.join(' ').trim();
        
        // Also check for material content in lines before "Material Content:" label
        if (!materialContent && j > 0) {
          for (let k = j - 1; k >= i && k >= j - 10; k--) {
            const checkLine = lines[k]?.trim();
            if (checkLine && checkLine.includes('%') && (checkLine.includes('COTTON') || checkLine.includes('NYLON') || checkLine.includes('POLY'))) {
              materialContent = checkLine;
              break;
            }
          }
        }
        
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
          
          console.log(`✅ Found product: ${style} - ${colour} (Qty: ${quantity}, Price: €${unitPrice})`);
        } else {
          console.log(`⚠️ Skipped incomplete product: style="${style}", qty=${quantity}, price=${unitPrice}`);
        }
      }
      
      i++;
    }

    console.log(`🎉 Parsed ${products.length} products from Wyncken PDF`);

    return res.status(200).json({
      success: true,
      products,
    });

  } catch (error) {
    console.error('❌ Error parsing Wyncken PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + (error as Error).message,
    });
  }
}
