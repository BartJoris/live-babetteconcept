import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type ApiResponse =
  | {
      levels: Record<number, number>;
      /** true = product is actief in Odoo */
      active: Record<number, boolean>;
    }
  | { error: string };

const BATCH_SIZE = 80;

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ApiResponse>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { productIds } = req.body as { productIds?: unknown };
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: 'productIds array is required' });
  }

  const ids = [
    ...new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (ids.length === 0) {
    return res.status(400).json({ error: 'No valid productIds provided' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const levels: Record<number, number> = {};
    const active: Record<number, boolean> = {};

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const products = await odooClient.call<
        Array<{ id: number; qty_available: number | null; active: boolean }>
      >({
        uid: user.uid,
        password: user.password,
        model: 'product.product',
        method: 'search_read',
        args: [[['id', 'in', batch]]],
        kwargs: {
          fields: ['id', 'barcode', 'qty_available', 'display_name', 'active'],
          limit: batch.length,
          context: { active_test: false },
        },
      });

      for (const p of products || []) {
        levels[p.id] = p.qty_available ?? 0;
        active[p.id] = !!p.active;
      }
    }

    return res.status(200).json({ levels, active });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
