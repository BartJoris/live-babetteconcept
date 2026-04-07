import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { fetchPosOrdersAndLinesForDateRange } from '@/lib/posSalesForRange';
import { aggregateYearlyCompare, type YearlyCompareMonthRow } from '@/lib/salesPosAggregates';

const bodySchema = z.object({
  years: z.array(z.number().int()).min(1),
});

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { years } = parsed.data;
  const { uid, password } = req.session.user!;

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    // Note: do not use unstable_cache here — Pages API routes on Vercel lack the App Router
    // static generation store, so next/cache throws at runtime in production.
    const results = await Promise.all(
      years.map(async (year) => {
        const { orders, lines } = await fetchPosOrdersAndLinesForDateRange(
          uid,
          password,
          `${year}-01-01`,
          `${year}-12-31`,
        );
        const { monthly, marginAvailable: ma } = aggregateYearlyCompare(orders, lines);
        return { year, monthly, marginAvailable: ma };
      }),
    );

    const compareData: Record<number, Record<string, YearlyCompareMonthRow>> = {};
    let marginAvailable = false;
    for (const { year, monthly, marginAvailable: ma } of results) {
      compareData[year] = monthly;
      if (ma) marginAvailable = true;
    }

    return res.status(200).json({ compareData, marginAvailable });
  } catch (error) {
    console.error('sales-yearly-compare error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to load yearly compare', message });
  }
});
