import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  listKnownSalesYears,
  VACATION_LABELS,
  VACATION_ROW_ORDER,
  type SchoolVacationId,
} from '@/lib/belgianSchoolVacations';

const formatBE = (amount: number) =>
  amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateBE = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

type PeriodRow = {
  salesYear: string;
  vacationId: SchoolVacationId;
  label: string;
  start: string;
  end: string;
  vacationDays?: number;
  omzet: number;
  orderCount: number;
  marge?: number;
};

type YearMetric = {
  omzet: number;
  orderCount: number;
  marge?: number;
};

type YearTotalRow = {
  salesYear: string;
  jaarStart: string;
  jaarEnd: string;
  totalVacationDays: number;
  totaalJaar: YearMetric;
  totaalZonderVakantie: YearMetric;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Verkoopsjaarlabel (1 sep – 31 aug) waarin deze kalenderdatum valt. */
function salesYearContainingYmd(ymd: string): string {
  const [ys, ms, ds] = ymd.split('-').map(Number);
  if (!ys || !ms || !ds) return '';
  if (ms >= 9) return `${ys}-${ys + 1}`;
  return `${ys - 1}-${ys}`;
}

function daysInclusiveYmd(startYmd: string, endYmd: string): number {
  const [y1, m1, d1] = startYmd.split('-').map(Number);
  const [y2, m2, d2] = endYmd.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.floor((t2 - t1) / 86400000) + 1;
}

function vacationDaysForCell(cell: PeriodRow | undefined): number {
  if (!cell) return 0;
  if (typeof cell.vacationDays === 'number') return cell.vacationDays;
  return daysInclusiveYmd(cell.start, cell.end);
}

type SalesYearProjection = {
  projJaarOmzet: number;
  projZonderOmzet: number;
  projVakantieOmzet: number;
  projJaarMarge?: number;
  projZonderMarge?: number;
  projVakantieMarge?: number;
  elapsedDays: number;
  totalDays: number;
};

function computeSalesYearRunRateProjection(
  yt: YearTotalRow,
  todayYmd: string,
  vakantieOmzet: number,
  vakantieMarge: number,
  marginAvailable: boolean,
): SalesYearProjection | null {
  const { salesYear, jaarStart, jaarEnd, totaalJaar, totaalZonderVakantie } = yt;
  if (!jaarStart || !jaarEnd) return null;
  if (salesYearContainingYmd(todayYmd) !== salesYear) return null;
  if (todayYmd < jaarStart) return null;
  if (todayYmd > jaarEnd) return null;

  const periodEnd = todayYmd <= jaarEnd ? todayYmd : jaarEnd;
  const elapsedDays = daysInclusiveYmd(jaarStart, periodEnd);
  const totalDays = daysInclusiveYmd(jaarStart, jaarEnd);
  if (elapsedDays < 1 || totalDays < 1) return null;
  if (elapsedDays >= totalDays) return null;

  const jaarOmzet = totaalJaar.omzet;
  const jaarMarge = totaalJaar.marge ?? 0;
  const zonderOmzet = totaalZonderVakantie.omzet;
  const zonderMarge = totaalZonderVakantie.marge ?? 0;

  const rateO = jaarOmzet / elapsedDays;
  const projJaarOmzet = rateO * totalDays;
  let projZonderOmzet: number;
  let projVakantieOmzet: number;
  if (jaarOmzet > 0) {
    projZonderOmzet = projJaarOmzet * (zonderOmzet / jaarOmzet);
    projVakantieOmzet = projJaarOmzet * (vakantieOmzet / jaarOmzet);
  } else {
    projZonderOmzet = 0;
    projVakantieOmzet = 0;
  }

  const out: SalesYearProjection = {
    projJaarOmzet,
    projZonderOmzet,
    projVakantieOmzet,
    elapsedDays,
    totalDays,
  };

  if (marginAvailable) {
    const rateM = jaarMarge / elapsedDays;
    out.projJaarMarge = rateM * totalDays;
    if (jaarMarge > 0) {
      out.projZonderMarge = out.projJaarMarge * (zonderMarge / jaarMarge);
      out.projVakantieMarge = out.projJaarMarge * (vakantieMarge / jaarMarge);
    } else {
      out.projZonderMarge = 0;
      out.projVakantieMarge = 0;
    }
  }

  return out;
}

function ProjectionOmzetLine({ value }: { value: number }) {
  return (
    <div className="text-xs font-normal text-purple-800 mt-1 whitespace-nowrap">
      ∼ €{formatBE(value)} eind verkoopsjaar
    </div>
  );
}

function ProjectionMargeLine({ value }: { value: number }) {
  return (
    <div className="text-xs font-normal text-green-800 mt-1 whitespace-nowrap">
      ∼ €{formatBE(value)} marge eind verkoopsjaar
    </div>
  );
}

export default function SalesVacationComparePage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const allYears = useMemo(() => listKnownSalesYears().slice().reverse(), []);
  const defaultSelection = useMemo(() => allYears.slice(0, 4), [allYears]);

  const [selectedYears, setSelectedYears] = useState<string[]>(defaultSelection);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [yearTotals, setYearTotals] = useState<YearTotalRow[]>([]);
  const [loadedSalesYears, setLoadedSalesYears] = useState<string[]>([]);
  const [marginAvailable, setMarginAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (!storedUid || !storedPass) {
        router.push('/');
      }
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!isLoggedIn || selectedYears.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sales-vacation-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesYears: selectedYears }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : 'Laden mislukt');
        return;
      }
      setPeriods(json.periods as PeriodRow[]);
      setYearTotals((json.yearTotals as YearTotalRow[]) ?? []);
      setMarginAvailable(Boolean(json.marginAvailable));
      setLoadedSalesYears((json.salesYears as string[]) ?? []);
    } catch {
      setError('Netwerkfout');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, selectedYears]);

  useEffect(() => {
    if (isLoggedIn && selectedYears.length > 0) {
      fetchData();
    }
  }, [isLoggedIn, selectedYears, fetchData]);

  const lookup = useMemo(() => {
    const m = new Map<string, PeriodRow>();
    for (const p of periods) {
      m.set(`${p.vacationId}:${p.salesYear}`, p);
    }
    return m;
  }, [periods]);

  const yearTotalBySalesYear = useMemo(() => {
    const m = new Map<string, YearTotalRow>();
    for (const y of yearTotals) {
      m.set(y.salesYear, y);
    }
    return m;
  }, [yearTotals]);

  const columnYears = loadedSalesYears.length > 0 ? loadedSalesYears : [...selectedYears].sort();

  const todayYmd = useMemo(() => localYmd(new Date()), []);

  const projectionBySalesYear = useMemo(() => {
    const m = new Map<string, SalesYearProjection | null>();
    for (const y of columnYears) {
      const yt = yearTotalBySalesYear.get(y);
      if (!yt) {
        m.set(y, null);
        continue;
      }
      let vOmz = 0;
      let vMar = 0;
      for (const vid of VACATION_ROW_ORDER) {
        const c = lookup.get(`${vid}:${y}`);
        vOmz += c?.omzet ?? 0;
        vMar += c?.marge ?? 0;
      }
      m.set(y, computeSalesYearRunRateProjection(yt, todayYmd, vOmz, vMar, marginAvailable));
    }
    return m;
  }, [columnYears, yearTotalBySalesYear, lookup, todayYmd, marginAvailable]);

  const toggleYear = (y: string) => {
    setSelectedYears((prev) => {
      if (prev.includes(y)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== y);
      }
      return [...prev, y].sort();
    });
  };

  const selectLastFour = () => {
    setSelectedYears(allYears.slice(0, 4));
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Vakantievergelijking</h1>
            <p className="text-sm text-gray-600 mb-4">
              Omzet tijdens de officiële schoolvakanties (Vlaanderen), per <strong>verkoopsjaar</strong> (1 september
              t/m 31 augustus). De vijf vakantieblokken volgen de officiële data; datums verschillen per verkoopsjaar.
              Voor het <strong>lopende verkoopsjaar</strong> tonen de totalen onderaan een schatting eind verkoopsjaar
              (gemiddelde per verstreken dag × lengte van de periode; vakantie/zonder vakantie behouden dezelfde
              verhouding als nu).
            </p>
            <div className="flex flex-wrap gap-3 items-center mb-2">
              {allYears.map((y) => (
                <label
                  key={y}
                  className="inline-flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedYears.includes(y)}
                    onChange={() => toggleYear(y)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-900 font-medium">{y}</span>
                </label>
              ))}
              <button
                type="button"
                onClick={selectLastFour}
                className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium"
              >
                Laatste 4 verkoopsjaren
              </button>
              <button
                type="button"
                onClick={() => fetchData()}
                disabled={loading || selectedYears.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow font-semibold text-sm"
              >
                Vernieuwen
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">{error}</div>
          )}

          {loading && periods.length === 0 && yearTotals.length === 0 ? (
            <p className="text-gray-700">Gegevens laden…</p>
          ) : (
            <div className="relative overflow-x-auto">
              {loading && (periods.length > 0 || yearTotals.length > 0) && (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center pt-8 bg-white/70 pointer-events-none"
                  aria-live="polite"
                >
                  <span className="text-sm font-medium text-gray-700 shadow-sm bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    Gegevens vernieuwen…
                  </span>
                </div>
              )}
              <table
                className={`w-full border border-gray-200 rounded-lg text-sm ${loading && (periods.length > 0 || yearTotals.length > 0) ? 'opacity-90' : ''}`}
              >
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-900 font-semibold border-b">Vakantie</th>
                    {columnYears.map((y) => (
                      <th key={y} className="px-3 py-2 text-right text-gray-900 font-semibold border-b whitespace-nowrap">
                        {y}
                        <div className="text-xs font-normal text-gray-500">Verkoopsjaar · omzet</div>
                      </th>
                    ))}
                    {marginAvailable &&
                      columnYears.map((y) => (
                        <th
                          key={`m-${y}`}
                          className="px-3 py-2 text-right text-gray-900 font-semibold border-b whitespace-nowrap"
                        >
                          <span className="sr-only">{y} </span>
                          <div className="text-xs font-normal text-gray-500">Marge {y}</div>
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {VACATION_ROW_ORDER.map((vid, rowIdx) => {
                    const label = VACATION_LABELS[vid];
                    return (
                      <tr key={vid} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-900 font-medium border-b border-gray-100">
                          {label}
                        </td>
                        {columnYears.map((y) => {
                          const cell = lookup.get(`${vid}:${y}`);
                          const omzet = cell?.omzet ?? 0;
                          const dagen = vacationDaysForCell(cell);
                          return (
                            <td
                              key={y}
                              className="px-3 py-2 text-right text-gray-800 border-b border-gray-100 align-top"
                            >
                              <div className="whitespace-nowrap">€{formatBE(omzet)}</div>
                              {cell && (
                                <>
                                  <div className="text-xs text-gray-500 font-normal mt-0.5 whitespace-normal">
                                    {formatDateBE(cell.start)} – {formatDateBE(cell.end)}
                                  </div>
                                  <div className="text-xs text-gray-400 font-normal mt-0.5">
                                    {dagen} {dagen === 1 ? 'dag' : 'dagen'} vakantie
                                  </div>
                                </>
                              )}
                            </td>
                          );
                        })}
                        {marginAvailable &&
                          columnYears.map((y) => {
                            const cell = lookup.get(`${vid}:${y}`);
                            const marge = cell?.marge ?? 0;
                            return (
                              <td
                                key={`m-${y}`}
                                className="px-3 py-2 text-right text-green-800 border-b border-gray-100 whitespace-nowrap"
                              >
                                €{formatBE(marge)}
                              </td>
                            );
                          })}
                      </tr>
                    );
                  })}
                  <tr className="bg-amber-50 font-semibold border-t-2 border-amber-200">
                    <td className="px-3 py-2 text-gray-900">Totaal vakantiedagen</td>
                    {columnYears.map((y) => {
                      const days = yearTotalBySalesYear.get(y)?.totalVacationDays ?? 0;
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">
                          {days} {days === 1 ? 'dag' : 'dagen'}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y) => (
                        <td key={`md-${y}`} className="px-3 py-2 text-right text-gray-400 border-b border-gray-100">
                          —
                        </td>
                      ))}
                  </tr>
                  <tr className="bg-blue-100 font-bold border-t-2 border-gray-300">
                    <td className="px-3 py-2 text-gray-900">Totaal vakantie</td>
                    {columnYears.map((y) => {
                      let sum = 0;
                      for (const vid of VACATION_ROW_ORDER) {
                        sum += lookup.get(`${vid}:${y}`)?.omzet ?? 0;
                      }
                      const pr = projectionBySalesYear.get(y);
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-900 align-top">
                          <div className="whitespace-nowrap">€{formatBE(sum)}</div>
                          {pr && <ProjectionOmzetLine value={pr.projVakantieOmzet} />}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y) => {
                        let sum = 0;
                        for (const vid of VACATION_ROW_ORDER) {
                          sum += lookup.get(`${vid}:${y}`)?.marge ?? 0;
                        }
                        const pr = projectionBySalesYear.get(y);
                        return (
                          <td key={`mt-${y}`} className="px-3 py-2 text-right text-green-900 align-top">
                            <div className="whitespace-nowrap">€{formatBE(sum)}</div>
                            {pr && pr.projVakantieMarge !== undefined && (
                              <ProjectionMargeLine value={pr.projVakantieMarge} />
                            )}
                          </td>
                        );
                      })}
                  </tr>
                  <tr className="bg-slate-50 font-semibold border-b border-gray-200">
                    <td className="px-3 py-2 text-gray-900">Totaal zonder vakantie</td>
                    {columnYears.map((y) => {
                      const yt = yearTotalBySalesYear.get(y);
                      const omzet = yt?.totaalZonderVakantie.omzet ?? 0;
                      const pr = projectionBySalesYear.get(y);
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-800 align-top">
                          <div className="whitespace-nowrap">€{formatBE(omzet)}</div>
                          {pr && <ProjectionOmzetLine value={pr.projZonderOmzet} />}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y) => {
                        const yt = yearTotalBySalesYear.get(y);
                        const marge = yt?.totaalZonderVakantie.marge ?? 0;
                        const pr = projectionBySalesYear.get(y);
                        return (
                          <td key={`tz-${y}`} className="px-3 py-2 text-right text-green-800 align-top">
                            <div className="whitespace-nowrap">€{formatBE(marge)}</div>
                            {pr && pr.projZonderMarge !== undefined && (
                              <ProjectionMargeLine value={pr.projZonderMarge} />
                            )}
                          </td>
                        );
                      })}
                  </tr>
                  <tr className="bg-slate-100 font-bold border-b border-gray-200">
                    <td className="px-3 py-2 text-gray-900">Totaal verkoopsjaar</td>
                    {columnYears.map((y) => {
                      const yt = yearTotalBySalesYear.get(y);
                      const omzet = yt?.totaalJaar.omzet ?? 0;
                      const pr = projectionBySalesYear.get(y);
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-900 align-top">
                          <div className="whitespace-nowrap">€{formatBE(omzet)}</div>
                          {yt?.jaarStart && yt.jaarEnd && (
                            <div className="text-xs text-gray-500 font-normal mt-0.5 whitespace-normal">
                              {formatDateBE(yt.jaarStart)} – {formatDateBE(yt.jaarEnd)}
                            </div>
                          )}
                          {pr && <ProjectionOmzetLine value={pr.projJaarOmzet} />}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y) => {
                        const yt = yearTotalBySalesYear.get(y);
                        const marge = yt?.totaalJaar.marge ?? 0;
                        const pr = projectionBySalesYear.get(y);
                        return (
                          <td key={`tj-${y}`} className="px-3 py-2 text-right text-green-900 align-top">
                            <div className="whitespace-nowrap">€{formatBE(marge)}</div>
                            {pr && pr.projJaarMarge !== undefined && (
                              <ProjectionMargeLine value={pr.projJaarMarge} />
                            )}
                          </td>
                        );
                      })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
