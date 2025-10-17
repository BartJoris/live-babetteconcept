import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface PlayUpProduct {
  article: string;
  color: string;
  description: string;
  sizes: { [size: string]: number };
  price: number;
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

    console.log(`📋 Parsing Play UP PDF: ${pdfFile.originalFilename}`);

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

    // Parse Play UP PDF format
    const products: PlayUpProduct[] = [];
    const lines = pdfText.split('\n').map(l => l.trim());

    console.log(`📝 Total lines in PDF: ${lines.length}`);
    console.log(`📝 First 30 lines:`);
    lines.slice(0, 30).forEach((line, idx) => console.log(`  ${idx}: ${line}`));

    // Detect table headers to determine which size columns are present
    // Different tables have different size ranges
    let currentSizeColumns: string[] = [];
    
    const detectTableType = (line: string): string[] | null => {
      // Look for size column headers in the line
      // Baby/toddler tables: 3M, 6M, 9M, 12M, 18M, 24M, 36M
      if (line.includes('3M') && line.includes('6M') && line.includes('9M')) {
        // Check if it goes up to 36M or just 12M
        if (line.includes('36M') || line.includes('24M')) {
          console.log('   🔍 Detected BABY/TODDLER table (M sizes)');
          return ['3M', '6M', '9M', '12M', '18M', '24M', '36M'];
        } else {
          console.log('   🔍 Detected SHORT BABY table (M sizes)');
          return ['0M', '1M', '3M', '6M', '9M', '12M'];
        }
      }
      // Kids tables: 3Y, 4Y, 5Y, 6Y, 8Y, 10Y, 12Y, 14Y
      if (line.includes('3Y') && line.includes('4Y') && line.includes('5Y')) {
        console.log('   🔍 Detected KIDS table (Y sizes)');
        return ['3Y', '4Y', '5Y', '6Y', '8Y', '10Y', '12Y', '14Y'];
      }
      // Adult tables: XS, S, M, L
      if (line.includes('XS') && line.includes(' S ') && line.includes(' M ') && line.includes(' L')) {
        console.log('   🔍 Detected ADULT table (XS/S/M/L sizes)');
        return ['XS', 'S', 'M', 'L', 'XL'];
      }
      return null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this line is a table header
      const detectedSizes = detectTableType(line);
      if (detectedSizes) {
        currentSizeColumns = detectedSizes;
        console.log(`📊 Table header detected at line ${i}: ${currentSizeColumns.join(', ')}`);
        continue;
      }
      
      // Look for product header lines: Article code + Color code + Description
      // Example: "1AR11002 P6179 RIB LS T-SHIRT - 100% OGCO"
      const articleMatch = line.match(/^(\d[A-Z0-9]{6,})\s+([A-Z0-9]{4,})\s+(.+)/);
      
      if (articleMatch) {
        if (currentSizeColumns.length === 0) {
          console.log(`⚠️ WARNING: Found product at line ${i} but no table header detected yet. Skipping: ${line}`);
          continue;
        }
        
        const article = articleMatch[1];
        const color = articleMatch[2];
        let description = articleMatch[3].trim();
        
        // Clean description: remove material composition that contains percentages
        // Examples:
        // "STRIPED JERSEY LS T- - 50% OGCO/50%" -> "STRIPED JERSEY LS T"
        // "RIB LS T-SHIRT - 100% OGCO" -> "RIB LS T-SHIRT"
        // "DENIM JUMPSUIT - 100% CO" -> "DENIM JUMPSUIT"
        
        const originalDescription = description;
        
        // Remove everything from the last dash that includes a percentage onwards
        // Use a more aggressive approach: find last " - " followed by text containing %
        const dashIndex = description.lastIndexOf(' - ');
        if (dashIndex !== -1) {
          const afterDash = description.substring(dashIndex + 3); // +3 to skip " - "
          if (afterDash.includes('%') || /\d+%/.test(afterDash)) {
            description = description.substring(0, dashIndex).trim();
            // Trim any trailing dashes
            description = description.replace(/[\s\-]+$/, '').trim();
            console.log(`   📝 Cleaned description from: "${originalDescription}"`);
            console.log(`   📝 Cleaned description to: "${description}"`);
          }
        }
        
        console.log(`\n🔍 Found article: ${article} ${color}`);
        console.log(`   Description: ${description}`);
        console.log(`   Line ${i}: ${line}`);
        
        // Look ahead for the quantities line
        // Skip the customs code lines (e.g., "6110 20 91 - (24M - 36M)")
        // Find the line with actual quantities (e.g., "1 1 1 1 1 1 6 12.3900 74.340a)")
        let quantitiesLine = '';
        let price = 0;
        
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const nextLine = lines[j];
          console.log(`   Checking line ${j}: ${nextLine}`);
          
          // Look for line that starts with quantities (numbers and dashes) and ends with price
          // Pattern: "1 1 1 1 1 1 6 12.3900 74.340a)" or "1 1 1 1 1 1 - 6 12.8300 76.980a)"
          const quantityMatch = nextLine.match(/^((?:\d+|\-)\s+)+(\d+)\s+(\d+[.,]\d{2,4})\s+(\d+[.,]\d{2})/);
          
          if (quantityMatch) {
            quantitiesLine = nextLine;
            price = parseFloat(quantityMatch[3].replace(',', '.'));
            console.log(`   ✅ Found quantities line: ${quantitiesLine}`);
            console.log(`   Price: €${price}`);
            break;
          }
        }
        
        if (quantitiesLine) {
          // Parse quantities from the line
          const tokens = quantitiesLine.trim().split(/\s+/);
          const sizes: { [size: string]: number } = {};
          
          console.log(`   Tokens: ${JSON.stringify(tokens)}`);
          
          // Extract quantities (all tokens before "Total" number)
          let quantityValues: string[] = [];
          for (const token of tokens) {
            // Stop when we hit a price pattern (number with 4 decimals)
            if (/^\d+[.,]\d{4}$/.test(token)) {
              break;
            }
            // Stop when we hit a large total number (> 20)
            if (!isNaN(parseInt(token)) && parseInt(token) > 20) {
              break;
            }
            // Collect quantity values (single/double digit or dash)
            if (/^(\d{1,2}|\-)$/.test(token)) {
              quantityValues.push(token);
            }
          }
          
          // Remove the last value if it's the total
          if (quantityValues.length > 0) {
            quantityValues = quantityValues.slice(0, -1); // Remove "Total" column
          }
          
          console.log(`   Quantity values: ${JSON.stringify(quantityValues)}`);
          console.log(`   Using size columns: ${JSON.stringify(currentSizeColumns)}`);
          
          // Map quantities to size columns
          for (let s = 0; s < Math.min(quantityValues.length, currentSizeColumns.length); s++) {
            const qty = quantityValues[s];
            if (qty !== '-' && !isNaN(parseInt(qty))) {
              const quantity = parseInt(qty);
              if (quantity > 0) {
                sizes[currentSizeColumns[s]] = quantity;
                console.log(`     ${currentSizeColumns[s]}: ${quantity}`);
              }
            }
          }
          
          if (Object.keys(sizes).length > 0) {
            products.push({
              article,
              color,
              description,
              sizes,
              price,
            });
            
            console.log(`✅ Added product: ${article} ${color} (${Object.keys(sizes).length} sizes, €${price})`);
          } else {
            console.log(`⚠️ No valid quantities found`);
          }
        } else {
          console.log(`⚠️ No quantities line found for ${article}`);
        }
      }
    }

    console.log(`✅ Extracted ${products.length} products from PDF`);

    // Convert sizes to Dutch format
    const convertSizeToDutch = (size: string): string => {
      // Month sizes: 0M, 1M, 3M, 6M, 9M, 12M, 18M, 24M, 36M
      if (size.endsWith('M') && !isNaN(parseInt(size.slice(0, -1)))) {
        const months = size.slice(0, -1);
        return `${months} maand`;
      }
      // Year sizes: 3Y, 4Y, 5Y, 6Y, 8Y, 10Y, 12Y, 14Y
      if (size.endsWith('Y') && !isNaN(parseInt(size.slice(0, -1)))) {
        const years = size.slice(0, -1);
        return `${years} jaar`;
      }
      // Adult sizes: XS, S, M, L, XL (keep as-is)
      return size;
    };

    // Convert to CSV format
    // Header: Article,Color,Description,Size,Quantity,Price
    let csv = 'Article,Color,Description,Size,Quantity,Price\n';
    let variantCount = 0;
    
    for (const product of products) {
      for (const [size, quantity] of Object.entries(product.sizes)) {
        const dutchSize = convertSizeToDutch(size);
        csv += `${product.article},${product.color},"${product.description}",${dutchSize},${quantity},${product.price.toFixed(2)}\n`;
        variantCount++;
      }
    }

    console.log(`✅ Generated CSV with ${variantCount} variants`);

    // Clean up temp file
    fs.unlinkSync(pdfFile.filepath);

    return res.status(200).json({
      success: products.length > 0,
      csv,
      productCount: products.length,
      variantCount,
      // Include raw text for debugging if no products found
      debugText: products.length === 0 ? pdfText.substring(0, 2000) : undefined,
      error: products.length === 0 ? 'No products found in PDF. Check console for debug output.' : undefined,
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

