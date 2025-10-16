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
    const form = formidable({});
    const [, files] = await form.parse(req);
    
    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`🎨 Parsing Play UP Color Palette PDF: ${pdfFile.originalFilename}`);

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
      
      console.log(`✅ Extracted ${pdfText.length} characters from Color Palette PDF`);
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to parse PDF: ' + (pdfError as Error).message
      });
    }

    // Parse color mappings from PDF
    const colorMappings: Record<string, string> = {};
    
    // First, try to extract all text in one go and look for patterns
    console.log(`\n📊 Full text length: ${pdfText.length} chars`);
    console.log(`📝 First 500 chars:\n${pdfText.substring(0, 500)}`);
    
    // Search for ALL color code patterns in the entire text
    // Pattern: Letter followed by 4 digits (P6179, E7048, etc.)
    const allColorCodes = [...pdfText.matchAll(/([A-Z])(\d{4})/g)];
    console.log(`\n🔍 Found ${allColorCodes.length} color code patterns`);
    allColorCodes.slice(0, 20).forEach(match => {
      console.log(`  Found code: ${match[0]} at position ${match.index}`);
    });
    
    // Search for color names (uppercase words before color codes)
    // Try multiple strategies
    
    // Strategy 1: Find "ColorName\nColorCode" or "ColorName ColorCode" patterns
    const lines = pdfText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
    console.log(`\n📝 Cleaned lines: ${lines.length}`);
    console.log(`First 50 lines after cleaning:`);
    lines.slice(0, 50).forEach((line, idx) => console.log(`  ${idx}: ${line}`));
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Pattern 1: "WATERCOLOR P6179" or "Watercolor P6179"
      const pattern1 = line.match(/^([A-Z][A-Z\s]+?)\s+([A-Z]\d{4})$/i);
      if (pattern1) {
        const colorName = pattern1[1].trim().toUpperCase();
        const colorCode = pattern1[2].toUpperCase();
        colorMappings[colorCode] = colorName;
        console.log(`  ✅ Pattern 1: ${colorCode} → ${colorName}`);
        continue;
      }
      
      // Pattern 2: Color code alone, check next line for name
      if (/^[A-Z]\d{4}$/.test(line) && i > 0) {
        const prevLine = lines[i - 1];
        if (/^[A-Z][A-Z\s]+$/.test(prevLine)) {
          colorMappings[line] = prevLine.toUpperCase();
          console.log(`  ✅ Pattern 2: ${line} → ${prevLine.toUpperCase()}`);
        }
      }
      
      // Pattern 3: Color name alone, check next line for code
      if (/^[A-Z][A-Z\s]{3,}$/.test(line) && i < lines.length - 1) {
        const nextLine = lines[i + 1];
        if (/^[A-Z]\d{4}$/.test(nextLine)) {
          colorMappings[nextLine] = line.toUpperCase();
          console.log(`  ✅ Pattern 3: ${nextLine} → ${line.toUpperCase()}`);
        }
      }
    }
    
    // Strategy 2: Search in continuous text for patterns like "WATERCOLOR P6179"
    const continuousMatches = [...pdfText.matchAll(/([A-Z][A-Z\s]{3,?}?)\s+([A-Z]\d{4})/g)];
    console.log(`\n🔍 Continuous text matches: ${continuousMatches.length}`);
    continuousMatches.forEach(match => {
      const colorName = match[1].trim().toUpperCase();
      const colorCode = match[2].toUpperCase();
      if (!colorMappings[colorCode]) {
        colorMappings[colorCode] = colorName;
        console.log(`  ✅ Continuous: ${colorCode} → ${colorName}`);
      }
    });

    console.log(`\n✅ Total extracted: ${Object.keys(colorMappings).length} color mappings`);

    // Clean up temp file
    fs.unlinkSync(pdfFile.filepath);

    return res.status(200).json({
      success: Object.keys(colorMappings).length > 0,
      colorMappings,
      count: Object.keys(colorMappings).length,
      debugText: pdfText.substring(0, 2000),
      fullText: pdfText,
      message: Object.keys(colorMappings).length === 0 
        ? 'PDF appears to be image-based. Text extraction found no color mappings. Consider manual entry.'
        : `Successfully extracted ${Object.keys(colorMappings).length} color mappings`,
    });

  } catch (error) {
    console.error('Color palette parsing error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to parse color palette PDF',
    });
  }
}

