import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/middleware/withAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession(req, res);

    if (!session.isLoggedIn || !session.user) {
      return res.status(200).json({
        isLoggedIn: false,
        user: null,
      });
    }

    return res.status(200).json({
      isLoggedIn: true,
      user: {
        uid: session.user.uid,
        username: session.user.username,
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    return res.status(500).json({ error: 'Failed to check session' });
  }
}

