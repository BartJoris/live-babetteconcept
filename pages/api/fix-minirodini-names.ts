import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

interface Product {
  id: number;
  name: string;
  default_code: string | false;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  const { uid, password } = req.session.user!;

  if (req.method === 'GET') {
    try {
      const products = await odooClient.searchRead<Product>(
        uid,
        password,
        'product.template',
        [
          ['name', 'ilike', 'mini rodini'],
          ['name', '=like', '%(%)'],
        ],
        ['id', 'name', 'default_code'],
        0,
        0,
        'name asc'
      );

      const pattern = /\s*\(\d+\)\s*$/;
      const affected = products.filter(p => pattern.test(p.name));

      return res.status(200).json({
        success: true,
        products: affected.map(p => ({
          id: p.id,
          name: p.name,
          default_code: p.default_code || '',
          newName: p.name.replace(pattern, ''),
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching Mini Rodini products:', message);
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === 'POST') {
    const { updates } = req.body as {
      updates: Array<{ id: number; newName: string }>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const results: Array<{ id: number; success: boolean; error?: string }> = [];

    for (const update of updates) {
      try {
        await odooClient.write(uid, password, 'product.template', [update.id], {
          name: update.newName,
        });
        results.push({ id: update.id, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update product ${update.id}:`, message);
        results.push({ id: update.id, success: false, error: message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return res.status(200).json({ success: true, updated: successCount, total: updates.length, results });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
