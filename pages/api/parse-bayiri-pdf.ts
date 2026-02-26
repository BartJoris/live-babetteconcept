import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface BayiriProduct {
  styleRef: string;
  description: string;
  color: string;
  section: string;
  sizes: Array<{ size: string; quantity: number }>;
  totalPieces: number;
  wholesalePrice: number;
  totalWholesale: number;
  suggestedPvp: number;
}

const STYLE_REF_RE = /([a-z]+(?:\.[a-z]+)*\.\d{2}\.\d{2})/i;
const SIZE_TOKENS = ['ONE SIZE', '0-6M', '6-12M', '1-3Y', '3M', '6M', '12M', '18M', '2Y', '3Y', '4Y', '6Y'];
const SIZE_TOKEN_RE = new RegExp(`\\b(${SIZE_TOKENS.map(s => s.replace(/[-()/]/g, '\\$&')).join('|')})\\b`, 'gi');

function extractProducts(pdfText: string): BayiriProduct[] {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const products: BayiriProduct[] = [];
  let currentSection = 'BABY';

  console.log(`📝 Total non-empty lines: ${lines.length}`);
  lines.forEach((line, idx) => {
    console.log(`  ${idx}: "${line.substring(0, 200)}"`);
  });

  const styleRefPositions: Array<{ index: number; ref: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (/KIDS?\s*:/i.test(lines[i])) {
      styleRefPositions.push({ index: i, ref: '__KIDS_SECTION__' });
    }
    const m = lines[i].match(STYLE_REF_RE);
    if (m) {
      const ref = m[1].toLowerCase();
      if (/\.\d{2}\.\d{2}$/.test(ref) && !lines[i].match(/^(IMG|STYLE|DESCRIPTION)/i)) {
        styleRefPositions.push({ index: i, ref });
      }
    }
  }

  console.log(`🔍 Found ${styleRefPositions.filter(p => !p.ref.startsWith('__')).length} style references`);

  for (let p = 0; p < styleRefPositions.length; p++) {
    const pos = styleRefPositions[p];
    if (pos.ref.startsWith('__')) {
      if (pos.ref === '__KIDS_SECTION__') currentSection = 'KIDS';
      continue;
    }

    const styleRef = pos.ref;
    const lineIdx = pos.index;
    const nextPos = styleRefPositions.find((x, xi) => xi > p && !x.ref.startsWith('__'));
    const blockEnd = nextPos ? nextPos.index : Math.min(lines.length, lineIdx + 10);

    const blockLines = lines.slice(lineIdx, blockEnd);
    const blockText = blockLines.join(' ');

    console.log(`\n📦 Processing "${styleRef}" (lines ${lineIdx}-${blockEnd - 1})`);
    console.log(`   Block: "${blockText.substring(0, 300)}"`);

    // --- Extract description and color ---
    // Collect uppercase text fragments from the block, excluding the style ref itself
    const textFragments: string[] = [];
    for (const bl of blockLines) {
      // Remove the style ref, row numbers, and single digits (size quantities)
      let cleaned = bl
        .replace(STYLE_REF_RE, '')
        .replace(/^\d+\s*/, '') // leading row number
        .replace(/\b[€]\s*[\d.,]+/g, '') // euro prices
        .replace(/\b\d+[.,]\d{2}\b/g, '') // decimal numbers
        .trim();
      if (cleaned.length > 1 && !/^\d+$/.test(cleaned)) {
        textFragments.push(cleaned);
      }
    }

    // Split fragments into individual uppercase phrases
    const phrases: string[] = [];
    for (const frag of textFragments) {
      // Split on transitions between uppercase phrases
      const parts = frag.split(/\s{3,}|(?<=\S)\s*[|]\s*/).map(s => s.trim()).filter(s => s.length > 1);
      phrases.push(...parts);
    }

    // The PDF table order is: STYLE REF, DESCRIPTION, COLOR
    // So description comes first, then color
    let description = '';
    let color = '';

    const meaningfulPhrases = phrases.filter(p =>
      p.length > 1 &&
      !/^\d+$/.test(p) &&
      !SIZE_TOKENS.includes(p.toUpperCase()) &&
      !/^(BABY|KIDS|TOTAL|WHOLESALE|SUGGESTED|PVP|EUR|IMG|PIECES|PRICE)/i.test(p)
    );

    console.log(`   Phrases: ${JSON.stringify(meaningfulPhrases)}`);

    if (meaningfulPhrases.length >= 2) {
      description = meaningfulPhrases[0].trim();
      color = meaningfulPhrases[1].trim();
    } else if (meaningfulPhrases.length === 1) {
      description = meaningfulPhrases[0].trim();
    }

    // If description or color still empty, try single-line approach
    if (!description) {
      const nameParts = styleRef.split('.').filter(p => !/^\d+$/.test(p) && p !== 'baby' && p !== 'kid');
      description = nameParts.join(' ').toUpperCase();
    }

    // --- Extract prices (ONLY those prefixed with €) ---
    const euroPrices: number[] = [];
    const euroRe = /€\s*([\d]+[.,]\d{2})/g;
    let em;
    while ((em = euroRe.exec(blockText)) !== null) {
      const val = parseFloat(em[1].replace(',', '.'));
      if (val > 0 && val < 100000) euroPrices.push(val);
    }

    // Also try comma-decimal format without € but only AFTER the style ref portion
    // Look for standalone price-like numbers that are NOT part of a style ref
    const afterRef = blockText.substring(blockText.indexOf(styleRef) + styleRef.length);
    const decimalRe = /(?<!\.)(\d{2,}[,]\d{2})(?![\d.])/g;
    let dm;
    while ((dm = decimalRe.exec(afterRef)) !== null) {
      const val = parseFloat(dm[1].replace(',', '.'));
      if (val > 5 && val < 100000 && !euroPrices.includes(val)) {
        euroPrices.push(val);
      }
    }

    console.log(`   Euro prices found: ${JSON.stringify(euroPrices)}`);

    let wholesalePrice = 0;
    let totalWholesale = 0;
    let suggestedPvp = 0;

    // Table order: WHOLESALE PRICE, TOTAL WHOLESALE, SUGGESTED PVP
    if (euroPrices.length >= 3) {
      wholesalePrice = euroPrices[euroPrices.length - 3];
      totalWholesale = euroPrices[euroPrices.length - 2];
      suggestedPvp = euroPrices[euroPrices.length - 1];
    } else if (euroPrices.length === 2) {
      wholesalePrice = euroPrices[0];
      suggestedPvp = euroPrices[1];
    } else if (euroPrices.length === 1) {
      wholesalePrice = euroPrices[0];
    }

    // --- Extract total pieces ---
    let totalPieces = 0;

    // Look for the total pieces number: it's typically the last standalone integer
    // before the € prices. Try to find it in the block.
    const totalMatch = blockText.match(/\b(\d{1,2})\s*€/);
    if (totalMatch) {
      totalPieces = parseInt(totalMatch[1]);
    }

    // Fallback: calculate from prices
    if (totalPieces === 0 && totalWholesale > 0 && wholesalePrice > 0) {
      totalPieces = Math.round(totalWholesale / wholesalePrice);
    }

    // Fallback: count standalone "1"s (each size gets qty 1 in Bayiri format)
    if (totalPieces === 0) {
      // Match isolated 1s that are likely size quantities (not part of other numbers)
      const sizeOnes = afterRef.match(/(?<!\d)1(?!\d)/g);
      if (sizeOnes && sizeOnes.length > 0 && sizeOnes.length <= 12) {
        totalPieces = sizeOnes.length;
      }
    }

    // --- Extract actual size tokens from the block ---
    const foundSizes: string[] = [];
    let sizeMatch;
    while ((sizeMatch = SIZE_TOKEN_RE.exec(blockText)) !== null) {
      const sizeToken = sizeMatch[1].toUpperCase();
      // Only add if it's not part of the header
      if (!foundSizes.includes(sizeToken)) {
        foundSizes.push(sizeToken);
      }
    }
    SIZE_TOKEN_RE.lastIndex = 0;

    console.log(`   Found size tokens in block: ${JSON.stringify(foundSizes)}`);

    // Build size-quantity pairs
    const sizeQuantities: Array<{ size: string; quantity: number }> = [];

    if (foundSizes.length > 0 && totalPieces > 0) {
      // Use found sizes, limited to totalPieces
      const useSizes = foundSizes.slice(0, totalPieces);
      for (const size of useSizes) {
        sizeQuantities.push({ size, quantity: 1 });
      }
      // If we still need more sizes, infer from section
      const remaining = totalPieces - sizeQuantities.length;
      if (remaining > 0) {
        const sectionSizes = currentSection === 'KIDS'
          ? ['2Y', '3Y', '4Y', '6Y']
          : ['3M', '6M', '12M', '18M', '2Y', '3Y'];
        const available = sectionSizes.filter(s => !sizeQuantities.some(sq => sq.size === s));
        for (let e = 0; e < remaining && e < available.length; e++) {
          sizeQuantities.push({ size: available[e], quantity: 1 });
        }
      }
    } else if (totalPieces > 0) {
      // No size tokens found, infer from section
      const sectionSizes = currentSection === 'KIDS'
        ? ['2Y', '3Y', '4Y', '6Y']
        : ['3M', '6M', '12M', '18M', '2Y', '3Y'];
      const useSizes = sectionSizes.slice(0, Math.min(totalPieces, sectionSizes.length));
      for (const size of useSizes) {
        sizeQuantities.push({ size, quantity: 1 });
      }
    }

    console.log(`   Result: desc="${description}", color="${color}"`);
    console.log(`   Prices: wholesale=${wholesalePrice}, total=${totalWholesale}, pvp=${suggestedPvp}`);
    console.log(`   Pieces: ${totalPieces}, Sizes: ${sizeQuantities.map(s => s.size).join(', ')}`);

    products.push({
      styleRef,
      description: description || styleRef.split('.').filter(p => !/^\d+$/.test(p) && p !== 'baby' && p !== 'kid').join(' ').toUpperCase(),
      color,
      section: currentSection,
      sizes: sizeQuantities,
      totalPieces,
      wholesalePrice,
      totalWholesale,
      suggestedPvp,
    });
  }

  return products;
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

    console.log(`📋 Parsing Bayiri PDF: ${pdfFile.originalFilename}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);

    let pdfText = '';

    try {
      if (typeof DOMMatrix === 'undefined') {
        (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function () {
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
        error: 'Failed to parse PDF: ' + (pdfError as Error).message,
      });
    }

    const products = extractProducts(pdfText);

    console.log(`✅ Parsed ${products.length} Bayiri products`);

    const debugLines = pdfText.split('\n').filter(l => l.trim().length > 0).slice(0, 300);

    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No products found in Bayiri PDF. The format may not be recognized.',
        debugText: pdfText.substring(0, 8000),
        debugLines,
      });
    }

    const totalQuantity = products.reduce((sum, p) => sum + p.totalPieces, 0);
    const totalValue = products.reduce((sum, p) => sum + p.totalWholesale, 0);

    return res.status(200).json({
      success: true,
      products,
      productCount: products.length,
      totalQuantity,
      totalValue,
      debugText: pdfText.substring(0, 8000),
      debugLines,
    });
  } catch (error) {
    console.error('❌ Error parsing Bayiri PDF:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}
