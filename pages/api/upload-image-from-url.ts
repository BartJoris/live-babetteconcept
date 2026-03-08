import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../lib/middleware/withAuth';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body as { url?: string };

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BabetteConcept/1.0)',
        Accept: 'image/*',
      },
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch image: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not point to an image' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');

    return res.status(200).json({ base64, mimeType: contentType });
  } catch (error) {
    console.error('Error fetching image from URL:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch image from URL',
    });
  }
}

export default withAuth(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
