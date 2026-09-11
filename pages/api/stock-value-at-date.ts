import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { getStockValueAtDate } from '@/lib/retail/stockValueAtDate';

const bodySchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  brand: z.string().optional(),
  category: z.string().optional(),
  audience: z
    .enum(['all', 'adults', 'kids', 'babies', 'children', 'teens'])
    .optional(),
});

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

  const { asOfDate, brand, category, audience } = parsed.data;
  const { uid, password } = req.session.user!;

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const payload = await getStockValueAtDate({
      uid,
      password,
      asOfDate,
      filters: { brand, category, audience },
    });
    return res.status(200).json(payload);
  } catch (error) {
    console.error('stock-value-at-date error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (/not found/i.test(message) || /ongeldige datum/i.test(message) || /toekomst/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

export const maxDuration = 60;
