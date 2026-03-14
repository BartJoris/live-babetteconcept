import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

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

    const { imageId } = req.body as { imageId?: number };

    if (!imageId) {
      return res.status(400).json({ error: 'imageId is required' });
    }

    await odooClient.unlink(
      user.uid,
      user.password,
      'product.image',
      [imageId]
    );

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error deleting image:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
