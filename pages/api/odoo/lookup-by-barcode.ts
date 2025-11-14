import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type SuccessFound = {
  found: true;
  productId: number;
  barcode: string;
  name: string;
  variant: string | null;
  qtyAvailable: number | null;
  salePrice: number | null;
  purchasePrice: number | null;
};

type SuccessNotFound = {
  found: false;
};

type ApiResponse = SuccessFound | SuccessNotFound | { error: string };

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const raw = req.query.barcode;
  const barcode = Array.isArray(raw) ? raw[0] : raw;

  if (!barcode || typeof barcode !== 'string' || !barcode.trim()) {
    return res.status(400).json({ error: 'barcode query param is required' });
  }

  try {
    const { user } = req.session;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fields = ['id', 'barcode', 'display_name', 'list_price', 'qty_available', 'standard_price'] as const;
    const products = await odooClient.searchRead<{
      id: number;
      barcode: string | null;
      display_name: string;
      list_price: number | null;
      qty_available: number | null;
      standard_price: number | null;
    }>(user.uid, user.password, 'product.product', [['barcode', '=', String(barcode)]], [...fields], 1);

    const prod = products && products.length > 0 ? products[0] : null;
    if (!prod) {
      return res.status(200).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      productId: prod.id,
      barcode: prod.barcode ?? barcode,
      name: prod.display_name,
      variant: prod.display_name ?? null,
      qtyAvailable: prod.qty_available ?? null,
      salePrice: prod.list_price ?? null,
      purchasePrice: prod.standard_price ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});


