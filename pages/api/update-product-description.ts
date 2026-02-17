import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: true } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { templateId, description } = req.body as { templateId?: number; description?: string };
  if (typeof templateId !== 'number' || templateId <= 0) {
    return res.status(400).json({ error: 'templateId (number) is required' });
  }
  if (typeof description !== 'string') {
    return res.status(400).json({ error: 'description (string) is required' });
  }

  try {
    const { uid, password } = req.session.user!;

    await odooClient.call({
      uid,
      password,
      model: 'product.template',
      method: 'write',
      args: [[templateId], { description_ecommerce: description }],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('update-product-description error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
