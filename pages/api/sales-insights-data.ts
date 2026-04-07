import type { NextApiResponse } from 'next';
import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { POS_SALES_CACHE_VERSION, fetchPosOrdersAndLinesForDateRange } from '@/lib/posSalesForRange';
import { buildMonthlyInsights, type MonthlyInsights } from '@/lib/salesPosAggregates';

const bodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
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

  const { month } = parsed.data;
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

  const { uid, password } = req.session.user!;

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const payload = await unstable_cache(
      async () => {
        const { orders, lines } = await fetchPosOrdersAndLinesForDateRange(
          uid,
          password,
          startDate,
          endDate,
        );
        return buildMonthlyInsights(orders, lines);
      },
      ['sales-insights-data', POS_SALES_CACHE_VERSION, String(uid), month],
      { revalidate: REVALIDATE_SECONDS },
    )();

    if ('error' in payload) {
      const empty: MonthlyInsights = {
        total_revenue: 0,
        total_orders: 0,
        average_daily_revenue: 0,
        average_order_value: 0,
        daily_sales: [],
        total_morning_revenue: 0,
        total_afternoon_revenue: 0,
        total_morning_orders: 0,
        total_afternoon_orders: 0,
      };
      return res.status(200).json({
        insights: empty,
        marginAvailable: false,
        fieldError: payload.error,
      });
    }

    return res.status(200).json({
      insights: payload.insights,
      marginAvailable: payload.marginAvailable,
    });
  } catch (error) {
    console.error('sales-insights-data error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to load sales insights', message });
  }
});
