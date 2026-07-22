import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

type SortBy = 'omzet' | 'winst';

type ChannelTotals = {
  omzet: number;
  winst: number;
};

type DayRow = {
  date: string;
  omzet: number;
  winst: number;
  winkel: ChannelTotals;
  webshop: ChannelTotals;
};

type MonthlyCompareRow = {
  omzet: number[];
  marge?: number[];
  days: number;
};

const FIRST_YEAR = 2022;
const TOP_N = 10;

const formatBE = (amount: number) =>
  amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildYearList(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = FIRST_YEAR; y <= now; y++) years.push(y);
  return years;
}

function periodsForYear(year: number): { year: number; month: number }[] {
  const now = new Date();
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  return Array.from({ length: maxMonth }, (_, i) => ({ year, month: i + 1 }));
}

function emptyChannel(): ChannelTotals {
  return { omzet: 0, winst: 0 };
}

export default function SalesBestDaysPage() {
  const { isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('omzet');
  const [days, setDays] = useState<DayRow[]>([]);
  const [marginAvailable, setMarginAvailable] = useState(false);
  const [progress, setProgress] = useState('');

  const years = useMemo(() => buildYearList(), []);

  const fetchAll = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError(null);
    setProgress('Webshop laden…');

    try {
      const byDate = new Map<string, DayRow>();

      const ensureDay = (date: string): DayRow => {
        let row = byDate.get(date);
        if (!row) {
          row = {
            date,
            omzet: 0,
            winst: 0,
            winkel: emptyChannel(),
            webshop: emptyChannel(),
          };
          byDate.set(date, row);
        }
        return row;
      };

      const webshopRes = await fetch('/api/webshop-sales-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ years }),
      });
      const webshopJson = await webshopRes.json();
      if (!webshopRes.ok) {
        throw new Error(webshopJson.message || webshopJson.error || 'Webshop data mislukt');
      }

      let hasMargin = Boolean(webshopJson.marginAvailable);
      const webshopDaily = (webshopJson.daily || {}) as Record<string, { omzet: number; marge: number }>;
      for (const [date, vals] of Object.entries(webshopDaily)) {
        const row = ensureDay(date);
        row.webshop.omzet += vals.omzet || 0;
        row.webshop.winst += vals.marge || 0;
      }

      for (const year of years) {
        setProgress(`Winkel ${year} laden…`);
        const periods = periodsForYear(year);
        const posRes = await fetch('/api/sales-monthly-compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periods }),
        });
        const posJson = await posRes.json();
        if (!posRes.ok) {
          throw new Error(posJson.message || posJson.error || `POS data ${year} mislukt`);
        }
        if (posJson.marginAvailable) hasMargin = true;

        const compareData = (posJson.compareData || {}) as Record<string, MonthlyCompareRow>;
        for (const { year: y, month } of periods) {
          const key = `${y}-${month}`;
          const period = compareData[key];
          if (!period) continue;
          const dayCount = period.days || period.omzet?.length || 0;
          for (let i = 0; i < dayCount; i++) {
            const omzet = period.omzet?.[i] || 0;
            const winst = period.marge?.[i] || 0;
            if (omzet === 0 && winst === 0) continue;
            const date = `${y}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
            const row = ensureDay(date);
            row.winkel.omzet += omzet;
            row.winkel.winst += winst;
          }
        }
      }

      const merged = Array.from(byDate.values()).map((row) => ({
        ...row,
        omzet: row.winkel.omzet + row.webshop.omzet,
        winst: row.winkel.winst + row.webshop.winst,
      }));

      setDays(merged);
      setMarginAvailable(hasMargin);
      setProgress('');
    } catch (err) {
      console.error('sales-best-days:', err);
      setError(err instanceof Error ? err.message : 'Onbekende fout');
      setDays([]);
      setProgress('');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, years]);

  useEffect(() => {
    if (isLoggedIn) fetchAll();
  }, [isLoggedIn, fetchAll]);

  const topDays = useMemo(() => {
    const sorted = [...days].sort((a, b) => {
      const av = sortBy === 'omzet' ? a.omzet : a.winst;
      const bv = sortBy === 'omzet' ? b.omzet : b.winst;
      return bv - av;
    });
    return sorted.slice(0, TOP_N);
  }, [days, sortBy]);

  const formatDate = (dateString: string) =>
    new Date(`${dateString}T00:00:00`).toLocaleDateString('nl-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const channelLabel = (row: DayRow) => {
    const hasWinkel = row.winkel.omzet > 0 || row.winkel.winst > 0;
    const hasWebshop = row.webshop.omzet > 0 || row.webshop.winst > 0;
    if (hasWinkel && hasWebshop) return 'Winkel + Webshop';
    if (hasWinkel) return 'Winkel';
    if (hasWebshop) return 'Webshop';
    return '—';
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Beste verkoopsdagen</h1>
              <p className="text-sm text-gray-600 mt-1">
                Top {TOP_N} dagen all-time (winkel + webshop), sinds {FIRST_YEAR}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-600">Rangschik op</span>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSortBy('omzet')}
                  className={`px-3 py-1.5 text-sm font-medium ${
                    sortBy === 'omzet' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Omzet
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('winst')}
                  disabled={!marginAvailable}
                  className={`px-3 py-1.5 text-sm font-medium border-l border-gray-200 ${
                    sortBy === 'winst' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Winst
                </button>
              </div>
              <button
                type="button"
                onClick={fetchAll}
                disabled={loading}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Vernieuwen
              </button>
            </div>
          </div>

          {loading && (
            <p className="text-gray-600 mb-4">{progress || 'Laden…'}</p>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Dag
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Soort
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Omzet
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Winst
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Winkel
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Webshop
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topDays.length > 0 ? (
                      topDays.map((day, index) => (
                        <tr key={day.date} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatDate(day.date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                              {channelLabel(day)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-800 text-right">
                            € {formatBE(day.omzet)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-green-800 text-right">
                            {marginAvailable ? `€ ${formatBE(day.winst)}` : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800">
                            <div>€ {formatBE(day.winkel.omzet)}</div>
                            {marginAvailable && (
                              <div className="text-xs text-green-700">winst € {formatBE(day.winkel.winst)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800">
                            <div>€ {formatBE(day.webshop.omzet)}</div>
                            {marginAvailable && (
                              <div className="text-xs text-green-700">winst € {formatBE(day.webshop.winst)}</div>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          Geen verkoopdata gevonden
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
