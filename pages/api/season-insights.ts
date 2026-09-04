import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { analyzeSeasonInsights } from '@/lib/retail/seasonInsights';

const bodySchema = z.object({
  category: z.string().min(1),
  year: z.number().int().min(2020).max(2100).optional(),
  quotationName: z.string().min(1).optional(),
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

  const { category, year, quotationName } = parsed.data;
  const { uid, password } = req.session.user!;

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const payload = await analyzeSeasonInsights({
      uid,
      password,
      category,
      year,
      quotationName,
    });
    return res.status(200).json(payload);
  } catch (error) {
    console.error('season-insights error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (/category not found/i.test(message)) {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

export const maxDuration = 60;
