import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { fetchAccountingDocuments } from '@/lib/accounting/fetchDocuments';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 800;

const bodySchema = z.object({
  dateFrom: z.string().regex(DATE_RE),
  dateTo: z.string().regex(DATE_RE),
});

function daysInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { dateFrom, dateTo } = parsed.data;
  if (dateFrom > dateTo) {
    return res.status(400).json({ error: 'Begindatum moet op of voor de einddatum liggen.' });
  }
  if (daysInclusive(dateFrom, dateTo) > MAX_RANGE_DAYS) {
    return res.status(400).json({
      error: `Periode is te lang (max. ${MAX_RANGE_DAYS} dagen). Kies een korter bereik.`,
    });
  }

  const { uid, password } = req.session.user!;
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const payload = await fetchAccountingDocuments({
      uid,
      password,
      dateFrom,
      dateTo,
    });
    return res.status(200).json(payload);
  } catch (error) {
    console.error('accounting-documents error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

export const maxDuration = 60;
