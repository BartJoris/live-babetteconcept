import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { extractPdfText } from '@/lib/pdf/extractText';
import { extractCimeProducts, isCimeOrderPdf } from '@/lib/suppliers/cime/pdf';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [, files] = await form.parse(req);

    const pdfFile =
      files.pdf?.[0] ||
      files.pdf_order?.[0] ||
      files.file?.[0] ||
      files.packing?.[0];
    if (!pdfFile) {
      return res.status(400).json({
        error: 'Geen PDF geüpload. Upload het CÎME opstart-/bestelformulier.',
      });
    }

    const fileName = pdfFile.originalFilename || '';
    console.log(`📋 Parsing CÎME PDF: ${fileName}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    let pdfText = '';
    try {
      pdfText = await extractPdfText(new Uint8Array(pdfBuffer));
      console.log(`✅ Extracted ${pdfText.length} characters from CÎME PDF`);
    } catch (pdfError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse PDF: ' + (pdfError as Error).message,
      });
    } finally {
      try {
        fs.unlinkSync(pdfFile.filepath);
      } catch {
        /* ignore */
      }
    }

    if (!isCimeOrderPdf(pdfText, fileName)) {
      console.log('⚠️ PDF does not look like a CÎME order form; parsing anyway');
    }

    const products = extractCimeProducts(pdfText);
    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Geen producten gevonden in CÎME PDF.',
        debugText: pdfText.substring(0, 5000),
      });
    }

    return res.status(200).json({
      success: true,
      products,
      productCount: products.length,
      orderedCount: products.filter((p) => p.quantity > 0).length,
    });
  } catch (error) {
    console.error('CÎME PDF parse error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to parse PDF',
    });
  }
}

export default withAuth(handler);
