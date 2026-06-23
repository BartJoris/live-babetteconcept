import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface PriceUpdate {
  variantId: number;
  price: number;
}

interface RequestBody {
  updates: PriceUpdate[];
}

interface ApiResponse {
  success: boolean;
  updated: number;
  failed: number;
  errors: string[];
}

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ApiResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { user } = req.session;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { updates }: RequestBody = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates must be a non-empty array' });
  }

  for (const u of updates) {
    if (!u.variantId || typeof u.price !== 'number' || u.price < 0) {
      return res.status(400).json({ error: `Invalid update: variantId=${u.variantId}, price=${u.price}` });
    }
  }

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const u of updates) {
    try {
      await odooClient.write(
        user.uid,
        user.password,
        'product.product',
        [u.variantId],
        { list_price: u.price }
      );
      updated++;
    } catch (error: unknown) {
      failed++;
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Variant ${u.variantId}: ${msg}`);
    }
  }

  return res.status(200).json({ success: failed === 0, updated, failed, errors });
});
