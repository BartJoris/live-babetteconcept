import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type FoundBarcode = {
  barcode: string;
  productId: number;
  name: string;
  qtyAvailable: number;
};

type ApiResponse = {
  found: FoundBarcode[];
  notFound: string[];
} | { error: string };

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { barcodes } = req.body as { barcodes: string[] };
  if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
    return res.status(400).json({ error: 'barcodes array is required' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const uniqueBarcodes = [...new Set(barcodes.filter(b => b && b.trim()))];

    const BATCH_SIZE = 200;
    const allResults: Array<{ id: number; barcode: string; display_name: string; qty_available: number }> = [];

    for (let i = 0; i < uniqueBarcodes.length; i += BATCH_SIZE) {
      const batch = uniqueBarcodes.slice(i, i + BATCH_SIZE);

      const products = await odooClient.call<Array<{ id: number; barcode: string; display_name: string; qty_available: number }>>({
        uid: user.uid,
        password: user.password,
        model: 'product.product',
        method: 'search_read',
        args: [[['barcode', 'in', batch]]],
        kwargs: {
          fields: ['id', 'barcode', 'display_name', 'qty_available'],
          limit: batch.length,
          context: { active_test: false },
        },
      });

      if (products && products.length > 0) {
        allResults.push(...products);
      }
    }

    const foundMap = new Map<string, FoundBarcode>();
    for (const p of allResults) {
      if (p.barcode) {
        foundMap.set(p.barcode, {
          barcode: p.barcode,
          productId: p.id,
          name: p.display_name,
          qtyAvailable: p.qty_available || 0,
        });
      }
    }

    const found = uniqueBarcodes.filter(b => foundMap.has(b)).map(b => foundMap.get(b)!);
    const notFound = uniqueBarcodes.filter(b => !foundMap.has(b));

    return res.status(200).json({ found, notFound });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
