import type { NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { parseMipounetSrpFromText } from '@/lib/suppliers/mipounet/rrp';
import { extractPdfText } from '@/lib/pdf/extractText';

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

    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log(`🇪🇸 Parsing Mipounet PDF: ${pdfFile.originalFilename}`);

    const pdfBuffer = fs.readFileSync(pdfFile.filepath);
    const pdfData = new Uint8Array(pdfBuffer);

    let pdfText = '';
    try {
      pdfText = await extractPdfText(pdfData);
      console.log(`✅ Extracted ${pdfText.length} characters from Mipounet PDF`);
    } catch (pdfError) {
      console.error('❌ pdf-parse failed:', pdfError);
      return res.status(500).json({
        success: false,
        error: 'Failed to parse PDF: ' + (pdfError as Error).message,
      });
    }

    if (!pdfText.trim()) {
      try {
        fs.unlinkSync(pdfFile.filepath);
      } catch {
        /* ignore */
      }
      return res.status(400).json({
        success: false,
        error: 'Geen tekst in PDF gevonden. Controleer of het een order confirmation met SRP is.',
      });
    }

    const srpMap = parseMipounetSrpFromText(pdfText);
    const priceMap: Record<string, number> = {};
    for (const [ref, rrp] of srpMap) {
      priceMap[ref] = rrp;
    }

    console.log(`✅ Extracted ${srpMap.size} SRP prices from Mipounet PDF`);
    for (const [ref, rrp] of srpMap) {
      console.log(`  🇪🇸 ${ref}: SRP €${rrp.toFixed(2)}`);
    }

    try {
      fs.unlinkSync(pdfFile.filepath);
    } catch {
      /* ignore */
    }

    return res.status(200).json({
      success: true,
      priceMap,
      count: srpMap.size,
      debugText: pdfText.substring(0, 2000),
    });
  } catch (error) {
    console.error('Mipounet PDF parsing error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to parse PDF',
    });
  }
}

export default withAuth(handler);
