import type { NextApiResponse } from 'next';
import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { POS_SALES_CACHE_VERSION, fetchPosOrdersAndLinesForDateRange } from '@/lib/posSalesForRange';
import { aggregateMonthlyDaily, type MonthlyComparePeriodRow } from '@/lib/salesPosAggregates';

const periodSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

const bodySchema = z.object({
  periods: z.array(periodSchema).min(1),
});

const REVALIDATE_SECONDS = 180;

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { periods } = parsed.data;
  const { uid, password } = req.session.user!;

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const rows = await Promise.all(
      periods.map(async ({ year, month }) => {
        const days = new Date(year, month, 0).getDate();
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
        const cacheKey = `${year}-${month}`;

        const row = await unstable_cache(
          async () => {
            const { orders, lines } = await fetchPosOrdersAndLinesForDateRange(
              uid,
              password,
              startDate,
              endDate,
            );
            return aggregateMonthlyDaily(orders, lines, year, month);
          },
          ['sales-monthly-compare', POS_SALES_CACHE_VERSION, String(uid), cacheKey],
          { revalidate: REVALIDATE_SECONDS },
        )();

        return { cacheKey, row };
      }),
    );

    const compareData: Record<string, MonthlyComparePeriodRow> = {};
    let marginAvailable = false;
    for (const { cacheKey, row } of rows) {
      const { marginAvailable: ma, ...rest } = row;
      compareData[cacheKey] = rest;
      if (ma) marginAvailable = true;
    }

    return res.status(200).json({ compareData, marginAvailable });
  } catch (error) {
    console.error('sales-monthly-compare error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to load monthly compare', message });
  }
});
