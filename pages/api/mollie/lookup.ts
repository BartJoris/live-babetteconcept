import type { NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { emptyLookupMessage, parseLookupQuery } from '@/lib/mollieLookup';
import { lookupByQuery, mollieTokensFromEnv } from '@/lib/mollieLookupService';

export default withAuth(async function handler(req, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawQuery = req.query.q;
  const parsed = parseLookupQuery(Array.isArray(rawQuery) ? rawQuery[0] : rawQuery);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const tokens = mollieTokensFromEnv();
  if (!tokens) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY of MOLLIE_ACCESS_TOKEN niet geconfigureerd' });
  }

  const { uid, password } = req.session.user!;
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const rows = await lookupByQuery({
      uid,
      password,
      tokens,
      query: parsed.query,
    });
    return res.status(200).json({
      query: parsed.query,
      rows,
      emptyMessage: rows.length === 0 ? emptyLookupMessage(parsed.query) : null,
    });
  } catch (error) {
    console.error('mollie lookup error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: `Fout bij opzoeken: ${message}` });
  }
});

export const maxDuration = 60;
