import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface ReorderRequest {
  images: Array<{ id: number; sequence: number }>;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { images }: ReorderRequest = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array is required' });
    }

    for (const img of images) {
      await odooClient.write(
        user.uid,
        user.password,
        'product.image',
        [img.id],
        { sequence: img.sequence }
      );
    }

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error reordering images:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
