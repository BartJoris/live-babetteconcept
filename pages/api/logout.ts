import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/middleware/withAuth';
import { logLogout } from '@/lib/auditLog';

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession(req, res);
    
    // Log logout before destroying session
    if (session.user) {
      logLogout(session.user.uid, session.user.username, getClientIp(req));
    }
    
    session.destroy();

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
}

