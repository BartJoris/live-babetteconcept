import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface ArmedAngelsProduct {
  itemNumber: string;
  description: string;
  color: string;
  size: string;
  sku: string;
  quantity: number;
  price: number;
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
    
    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`📋 Parsing Armed Angels PDF: ${pdfFile.originalFilename}`);

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

    // Parse Armed Angels PDF format
    // Structure:
    // Pos. | Item-no. | Color/Washing | Quantity | Net price | Net value
    //      | Description
    //      | Certification
    //      | Size breakdown (XS: 1, S: 2, M: 2, L: 1, etc.)
    
    const products: ArmedAngelsProduct[] = [];
    const lines = pdfText.split('\n');

    console.log(`📝 Total lines in PDF: ${lines.length}`);
    console.log(`📝 First 150 lines for debugging:`);
    lines.slice(0, 150).forEach((line, idx) => {
      if (line.trim().length > 0) {
        console.log(`  ${idx}: "${line.substring(0, 120)}"`);
      }
    });

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Look for position lines that start with a digit followed by a 7-8 digit item number
      // Pattern: "1    30005160" or "1 30005160" or "1     30005160"
      const posMatch = line.match(/^\d+\s+(\d{7,8})\s+/);
      
      if (posMatch) {
        console.log(`🔍 Found product at line ${i}: ${line.substring(0, 100)}`);
        
        const itemNumber = posMatch[1];
        let description = '';
        let color = '';
        let quantity = 1;
        let price = 0;
        const sizes: { size: string; qty: number }[] = [];
        
        // Extract quantity and price from the same line
        // Pattern: "X Pcs." and "XX,XX EUR"
        const qtyMatch = line.match(/(\d+)\s*Pcs\./i);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1]);
        }
        
        const priceMatch = line.match(/(\d+[.,]\d{2})\s*EUR/i);
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(',', '.'));
        }
        
        // Extract color with code (format: "NNNN color name" where NNNN is 4 digits)
        // Look for 4 digits followed by lowercase letters/spaces
        const colorMatch = line.match(/\d{4}\s+([a-z\s\-]+?)(?=\s+\d+\s*Pcs|EUR|$)/i);
        if (colorMatch) {
          const fullColorMatch = line.match(/(\d{4}\s+[a-z\s\-]+?)(?=\s+\d+\s*Pcs|EUR|$)/i);
          if (fullColorMatch) {
            color = fullColorMatch[1].trim();
          }
        }
        
        console.log(`   Item: ${itemNumber}, Qty: ${quantity}, Price: ${price}, Color: ${color}`);
        
        // Get description and certification from next lines
        let lineIdx = i + 1;
        let certLine = '';
        
        // Next line should be the main description (product name only)
        if (lineIdx < lines.length && lineIdx < i + 5) {
          const descLine = lines[lineIdx].trim();
          
          // Skip empty lines
          if (descLine && !descLine.match(/^\d+\s+\d{7,8}/)) {
            // Don't include very long lines (likely footer/header text)
            if (descLine.length < 100 && !descLine.match(/Email|sales|Phone|Web|GmbH/i)) {
              // Extract just the product name, removing material/certification info
              // Remove material names and certification keywords
              const productName = descLine
                .replace(/\s+(TWEED|CORDUROY|WOOL|BLEND|PREMIUM|MERINO|STRIPES|BARREL|VELVET|KARLENAA|REGLANA|FINE|GOTS|organic|RWS|PETA|GRS|CU-\d+|empty).*$/i, '')
                .trim();
              
              if (productName) {
                description = productName;
                console.log(`   Description: ${description}`);
                lineIdx++;
              }
            }
          }
        }
        
        // Look for certification info on the next few lines
        while (lineIdx < lines.length && lineIdx < i + 10) {
          const checkLine = lines[lineIdx].trim();
          
          // Stop if we hit a size code
          if (checkLine.match(/^(XS|S|M|L|XL|XXL|\d+\/\d+)$/)) {
            console.log(`   Found size, stopping description scan`);
            break;
          }
          
          // Stop if we hit a next product
          if (checkLine.match(/^\d+\s+\d{7,8}/)) {
            console.log(`   Found next product, stopping`);
            break;
          }
          
          // Check for certification line
          if (checkLine.match(/GOTS|RWS|PETA|GRS|CU-\d+/i)) {
            certLine = checkLine;
            console.log(`   Certification: ${certLine}`);
            lineIdx++;
            break;
          }
          
          // Skip metadata and material names
          if (checkLine.match(/^(GOTS|organic|RWS|PETA|TWEED|CORDUROY|WOOL|BLEND|empty|PREMIUM|MERINO|STRIPES|BARREL|VELVET|KARLENAA|REGLANA|FINE|GRS|CU-\d+|GRAZILIAA|SELMAA|ICONIC|AALTHEA|LILIRIAA|YENAAS|AURELEAA|HELGEAA|MIKULAA|NYXAA|JOANIAAS|JAANISARA)$/i)) {
            console.log(`   Skipping metadata: ${checkLine}`);
            lineIdx++;
            continue;
          }
          
          // Stop if line is too long or contains footer-like content
          if (checkLine.length > 50 || checkLine.match(/Email|sales|Phone|Web|GmbH|Fax|IBAN|BIC|Köln/i)) {
            console.log(`   Hit footer/header text, stopping`);
            break;
          }
          
          lineIdx++;
        }
        
        // Look for size breakdown lines
        // The PDF has EACH SIZE AND QUANTITY ON SEPARATE LINES:
        // Line: "XS"
        // Line: "1"
        // Line: "S"
        // Line: "2"
        // etc.
        console.log(`   Looking for sizes starting at line ${lineIdx}...`);
        let foundSizes = false;
        
        while (lineIdx < lines.length && lineIdx < i + 20) {
          const checkLine = lines[lineIdx].trim();
          
          console.log(`   Check line ${lineIdx}: "${checkLine}"`);
          
          // Check if this line is a single size code
          const sizeMatch = checkLine.match(/^(XS|S|M|L|XL|XXL|\d+\/\d+)$/);
          
          if (sizeMatch) {
            const sizeCode = sizeMatch[1];
            console.log(`   ✅ Found size: ${sizeCode}`);
            
            // Next line should be the quantity
            if (lineIdx + 1 < lines.length) {
              const qtyLine = lines[lineIdx + 1].trim();
              const qtyMatch = qtyLine.match(/^(\d+)$/);
              
              if (qtyMatch) {
                const sizeQty = parseInt(qtyMatch[1]);
                console.log(`   ✅ Found quantity: ${sizeQty}`);
                
                sizes.push({
                  size: sizeCode,
                  qty: sizeQty,
                });
                foundSizes = true;
                
                // Move to next size (skip the quantity line)
                lineIdx += 2;
                continue;
              } else {
                console.log(`   ⚠️  Next line is not a quantity: "${qtyLine}"`);
                // If next line doesn't look like a quantity, check if it's another size
                const nextSizeMatch = qtyLine.match(/^(XS|S|M|L|XL|XXL)$/);
                if (nextSizeMatch) {
                  // It's another size, so skip ahead
                  lineIdx += 1;
                  continue;
                } else {
                  // Unknown format, stop looking
                  break;
                }
              }
            } else {
              console.log(`   ⚠️  No next line for quantity`);
              break;
            }
          } else {
            // Check if we've hit a marker for the next product or end
            if (checkLine.match(/^\d+\s+\d{7,8}/) || checkLine.match(/Shipping|Total|EU delivery/i)) {
              console.log(`   🛑 Hit end marker: "${checkLine}"`);
              break;
            }
            
            // Skip certification lines and other metadata
            if (checkLine.match(/GOTS|organic|RWS|PETA|TWEED|CORDUROY|WOOL|BLEND|empty|PREMIUM|Certification/i)) {
              console.log(`   ℹ️  Skipping metadata line: "${checkLine}"`);
              lineIdx++;
              continue;
            }
            
            // If it doesn't match anything, stop
            console.log(`   🛑 Unrecognized line format: "${checkLine}"`);
            break;
          }
        }
        
        if (foundSizes) {
          console.log(`   ✅ Successfully found ${sizes.length} sizes!`);
        } else {
          console.log(`   ⚠️  No size breakdown found for item ${itemNumber}`);
        }
        
        // Create product entries
        if (foundSizes && sizes.length > 0) {
          // Create entry for each size
          for (const sizeInfo of sizes) {
            products.push({
              itemNumber,
              description,
              color,
              size: sizeInfo.size,
              sku: '',
              quantity: sizeInfo.qty,
              price,
            });
          }
          console.log(`✅ Added ${sizes.length} size variants for item ${itemNumber}`);
        } else if (itemNumber) {
          // Add as single entry if no sizes found
          products.push({
            itemNumber,
            description,
            color,
            size: 'One Size',
            sku: '',
            quantity,
            price,
          });
          console.log(`⚠️  Added as single product (no sizes found) item ${itemNumber}`);
        }
        
        i = lineIdx;
      } else {
        i++;
      }
    }

    console.log(`✅ Successfully parsed ${products.length} product entries from ${new Set(products.map(p => p.itemNumber)).size} unique items`);

    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No products found in PDF',
        debugText: pdfText.substring(0, 3000),
      });
    }

    // Generate CSV
    const csvHeader = 'Item Number,Description,Color,Size,SKU,Quantity,Price (EUR)';
    const csvRows = products.map(p => 
      `${p.itemNumber},"${p.description}","${p.color}","${p.size}","${p.sku}",${p.quantity},${p.price.toFixed(2)}`
    );
    const csv = [csvHeader, ...csvRows].join('\n');

    return res.status(200).json({
      success: true,
      csv,
      productCount: products.length,
    });
  } catch (error) {
    console.error('❌ Error parsing Armed Angels PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}

export default withAuth(handler);
