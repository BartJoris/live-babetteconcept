import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { extractPdfText } from '@/lib/pdf/extractText';
import { extractBayiriLayoutItems } from '@/lib/suppliers/bayiri/pdf-layout';
import {
  extractBayiriProducts,
  extractBayiriProductsFromLayout,
} from '@/lib/suppliers/bayiri/pdf';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

    const pdfFile = files.pdf?.[0] || files.file?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`📋 Parsing Bayiri PDF: ${pdfFile.originalFilename}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);

    let pdfText = '';

    try {
      pdfText = await extractPdfText(pdfBuffer);
      console.log(`✅ Extracted ${pdfText.length} characters from PDF`);
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({
        success: false,
        error: 'Failed to parse PDF: ' + (pdfError as Error).message,
      });
    }

    let products = extractBayiriProducts(pdfText);
    try {
      const layoutItems = await extractBayiriLayoutItems(pdfBuffer);
      const fromLayout = extractBayiriProductsFromLayout(layoutItems);
      const layoutSizeCount = fromLayout.reduce((sum, p) => sum + p.sizes.length, 0);
      if (fromLayout.length > 0 && layoutSizeCount > 0) {
        products = fromLayout;
        console.log(`✅ Layout extract: ${products.length} products, ${layoutSizeCount} size lines`);
      }
    } catch (layoutError) {
      console.warn('Bayiri layout extract failed, using flattened PDF text:', layoutError);
    }

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

export default withAuth(handler);
