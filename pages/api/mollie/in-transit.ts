import type { NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { listOpenInTransit, mollieTokensFromEnv } from '@/lib/mollieLookupService';

export default withAuth(async function handler(req, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mollieTokens = mollieTokensFromEnv();
  if (!mollieTokens) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY of MOLLIE_ACCESS_TOKEN niet geconfigureerd' });
  }

  const { uid, password } = req.session.user!;
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const payload = await listOpenInTransit({ uid, password, tokens: mollieTokens });
    return res.status(200).json(payload);
  } catch (error) {
    console.error('mollie in-transit error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: message });
  }
});

export const maxDuration = 60;
