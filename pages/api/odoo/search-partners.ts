import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type Partner = {
  id: number;
  name: string;
};

type ApiResponse = { partners: Partner[] } | { error: string };

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const raw = req.query.q;
  const query = Array.isArray(raw) ? raw[0] : raw;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return res.status(400).json({ error: 'q query param is required (min 2 characters)' });
  }

  try {
    const { user } = req.session;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const partners = await odooClient.searchRead<Partner>(
      user.uid,
      user.password,
      'res.partner',
      [['name', 'ilike', query.trim()], ['is_company', '=', true]],
      ['id', 'name'],
      20,
      undefined,
      'name asc'
    );

    return res.status(200).json({ partners: partners ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
