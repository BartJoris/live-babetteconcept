import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type ApiResponse =
  | {
      success: true;
      unarchivedCount: number;
      totalCount: number;
      results: Array<{ productId: number; success: boolean; error?: string }>;
    }
  | { error: string };

const BATCH_SIZE = 50;

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

    const results: Array<{ productId: number; success: boolean; error?: string }> = [];
    let unarchivedCount = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      const products = await odooClient.call<
        Array<{
          id: number;
          active: boolean;
          product_tmpl_id: [number, string] | number | false;
        }>
      >({
        uid: user.uid,
        password: user.password,
        model: 'product.product',
        method: 'search_read',
        args: [[['id', 'in', batch]]],
        kwargs: {
          fields: ['id', 'active', 'product_tmpl_id'],
          limit: batch.length,
          context: { active_test: false },
        },
      });

      const found = new Map((products || []).map((p) => [p.id, p]));

      for (const productId of batch) {
        const prod = found.get(productId);
        if (!prod) {
          results.push({ productId, success: false, error: 'Product niet gevonden' });
          continue;
        }

        try {
          const tmplId = Array.isArray(prod.product_tmpl_id)
            ? prod.product_tmpl_id[0]
            : typeof prod.product_tmpl_id === 'number'
              ? prod.product_tmpl_id
              : null;

          // Template eerst activeren (anders blijft variant vaak gearchiveerd)
          if (tmplId) {
            await odooClient.call({
              uid: user.uid,
              password: user.password,
              model: 'product.template',
              method: 'write',
              args: [[tmplId], { active: true }],
              kwargs: { context: { active_test: false } },
            });
          }

          await odooClient.call({
            uid: user.uid,
            password: user.password,
            model: 'product.product',
            method: 'write',
            args: [[productId], { active: true }],
            kwargs: { context: { active_test: false } },
          });

          results.push({ productId, success: true });
          unarchivedCount += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          results.push({ productId, success: false, error: message });
        }
      }
    }

    return res.status(200).json({
      success: true,
      unarchivedCount,
      totalCount: ids.length,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
