import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { fetchPosOrdersAndLinesForDateRange } from '@/lib/posSalesForRange';
import { orderLinesHaveMarginField, sumTotalsInDateRange } from '@/lib/salesPosAggregates';
import {
  getOverallSalesYearCalendarBounds,
  getVacationPeriodsForSalesYears,
  isKnownSalesYear,
  listKnownSalesYears,
  getSalesYearCalendarBounds,
  vacationDaysInclusive,
} from '@/lib/belgianSchoolVacations';

const bodySchema = z.object({
  salesYears: z.array(z.string().min(1)).min(1),
});

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { salesYears: rawYears } = parsed.data;
  const unknown = rawYears.filter((y) => !isKnownSalesYear(y));
  if (unknown.length > 0) {
    return res.status(400).json({
      error: 'Unknown sales year(s)',
      unknown,
      knownSalesYears: listKnownSalesYears(),
    });
  }

  const salesYears = [...new Set(rawYears)].sort();
  const periods = getVacationPeriodsForSalesYears(salesYears);
  const bounds = getOverallSalesYearCalendarBounds(salesYears);
  if (!bounds) {
    return res.status(200).json({
      periods: [],
      yearTotals: [],
      marginAvailable: false,
      salesYears,
    });
  }

  const { uid, password } = req.session.user!;
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const { orders, lines } = await fetchPosOrdersAndLinesForDateRange(
      uid,
      password,
      bounds.minStart,
      bounds.maxEnd,
    );

    const marginAvailable = orderLinesHaveMarginField(lines);
    const rows = periods.map((p) => {
      const t = sumTotalsInDateRange(orders, lines, p.start, p.end);
      const vacationDays = vacationDaysInclusive(p.start, p.end);
      return {
        salesYear: p.salesYear,
        vacationId: p.vacationId,
        label: p.label,
        start: p.start,
        end: p.end,
        vacationDays,
        omzet: t.omzet,
        orderCount: t.orderCount,
        ...(marginAvailable ? { marge: t.marge } : {}),
      };
    });

    const vacationSumByYear = new Map<
      string,
      { omzet: number; orderCount: number; marge: number; vacationDays: number }
    >();
    for (const sy of salesYears) {
      vacationSumByYear.set(sy, { omzet: 0, orderCount: 0, marge: 0, vacationDays: 0 });
    }
    for (const r of rows) {
      const cur = vacationSumByYear.get(r.salesYear);
      if (!cur) continue;
      cur.omzet += r.omzet;
      cur.orderCount += r.orderCount;
      cur.vacationDays += r.vacationDays;
      if (marginAvailable && typeof r.marge === 'number') {
        cur.marge += r.marge;
      }
    }

    const yearTotals = salesYears.map((sy) => {
      const cal = getSalesYearCalendarBounds(sy);
      const v = vacationSumByYear.get(sy) ?? { omzet: 0, orderCount: 0, marge: 0, vacationDays: 0 };
      if (!cal) {
        return {
          salesYear: sy,
          jaarStart: '',
          jaarEnd: '',
          totalVacationDays: v.vacationDays,
          totaalJaar: { omzet: 0, orderCount: 0 },
          totaalZonderVakantie: { omzet: 0, orderCount: 0 },
        };
      }
      const jaar = sumTotalsInDateRange(orders, lines, cal.start, cal.end);
      const zonderOmzet = Math.max(0, jaar.omzet - v.omzet);
      const zonderOrders = Math.max(0, jaar.orderCount - v.orderCount);
      const zonderMarge = marginAvailable ? Math.max(0, jaar.marge - v.marge) : 0;
      return {
        salesYear: sy,
        jaarStart: cal.start,
        jaarEnd: cal.end,
        totalVacationDays: v.vacationDays,
        totaalJaar: {
          omzet: jaar.omzet,
          orderCount: jaar.orderCount,
          ...(marginAvailable ? { marge: jaar.marge } : {}),
        },
        totaalZonderVakantie: {
          omzet: zonderOmzet,
          orderCount: zonderOrders,
          ...(marginAvailable ? { marge: zonderMarge } : {}),
        },
      };
    });

    return res.status(200).json({ periods: rows, yearTotals, marginAvailable, salesYears });
  } catch (error) {
    console.error('sales-vacation-compare error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to load vacation compare', message });
  }
});
