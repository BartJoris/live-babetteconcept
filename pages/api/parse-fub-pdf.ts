import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { extractPdfText } from '@/lib/pdf/extractText';
import {
  detectFubPdfKind,
  extractFubInvoiceProducts,
  extractFubOrderProducts,
} from '@/lib/suppliers/fub/pdf';

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

    const pdfFile = files.pdf?.[0] || files.file?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const fileName = pdfFile.originalFilename || '';
    console.log(`📋 Parsing FUB PDF: ${fileName}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);

    let pdfText = '';
    try {
      pdfText = await extractPdfText(pdfData);
      console.log(`✅ Extracted ${pdfText.length} characters from PDF`);
    } catch (pdfError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse PDF: ' + (pdfError as Error).message,
      });
    }

    const kind = detectFubPdfKind(pdfText, fileName);
    if (kind === 'invoice') {
      const products = extractFubInvoiceProducts(pdfText);
      if (products.length === 0) {
        return res.status(200).json({
          success: false,
          kind,
          error: 'No products found in FUB invoice PDF.',
          debugText: pdfText.substring(0, 5000),
        });
      }
      return res.status(200).json({
        success: true,
        kind: 'invoice',
        products,
        productCount: products.length,
      });
    }

    // Default / order confirmation
    const products = extractFubOrderProducts(pdfText);
    if (products.length === 0) {
      return res.status(200).json({
        success: false,
        kind: kind === 'unknown' ? 'order' : kind,
        error: 'No products found in FUB order PDF.',
        debugText: pdfText.substring(0, 5000),
      });
    }

    return res.status(200).json({
      success: true,
      kind: 'order',
      products,
      productCount: products.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to parse PDF: ' + ((error as Error).message || 'Unknown error'),
    });
  }
}

export default withAuth(handler);
