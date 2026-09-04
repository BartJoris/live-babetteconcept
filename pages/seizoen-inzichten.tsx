import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useAuth } from '@/lib/hooks/useAuth';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type DateRange = { start: string; end: string };
type PhaseTotals = { units: number; revenue: number; cost: number; profit: number };
type SeasonAudienceKey = 'all' | 'kids' | 'adults' | 'other';
type AudienceSlice = {
  productCount: number;
  available: number;
  openingStock: number;
  stockIn: number;
  stockAtSoldenStart: number;
  currentStock: number;
  currentRetailValue: number;
  currentCostValue: number;
  regular: PhaseTotals;
  solden: PhaseTotals;
  afterRetail: PhaseTotals;
  retailSold: PhaseTotals;
  stockSale: PhaseTotals;
  totalSold: PhaseTotals;
  sellThroughRetailPct: number;
  sellThroughInclStockSalePct: number;
  avgSoldenDiscountPct: number | null;
  profitMarginPct: number;
};
type BrandSeasonRow = {
  brandId: number | null;
  brandName: string;
  available: number;
  regularUnits: number;
  soldenUnits: number;
  afterUnits: number;
  stockSaleUnits: number;
  currentStock: number;
  sellThroughRetailPct: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMarginPct: number;
};
type StockSaleOrder = {
  orderId: number;
  orderName: string;
  date: string;
  partner: string | null;
  state: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  avgPctOfList: number | null;
  matchedBy: 'note' | 'price' | 'quotationName';
};
type SeasonInsights = {
  category: string;
  matchedCategory: string;
  year: number;
  kind: 'summer' | 'winter';
  periods: { regular: DateRange; solden: DateRange; after: DateRange };
  byAudience: Record<SeasonAudienceKey, AudienceSlice>;
  brands: BrandSeasonRow[];
  stockSales: StockSaleOrder[];
  leftoverWarning: string | null;
  summary: string;
};

const formatBE = (amount: number) =>
  amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatUnits = (n: number) =>
  n.toLocaleString('nl-BE', { maximumFractionDigits: 0 });

const formatPct = (n: number) =>
  `${n.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function formatProfitLine(phase: Pick<PhaseTotals, 'profit' | 'revenue'>): string {
  const pct = phase.revenue > 0 ? (phase.profit / phase.revenue) * 100 : 0;
  const prefix = phase.profit < 0 ? 'verlies' : 'winst';
  if (!(phase.revenue > 0)) return `${prefix} €${formatBE(phase.profit)}`;
  return `${prefix} €${formatBE(phase.profit)} · ${formatPct(pct)}`;
}

function formatDate(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateRange(range: DateRange): string {
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

function kindLabel(kind: SeasonInsights['kind']): string {
  switch (kind) {
    case 'summer':
      return 'Zomer';
    case 'winter':
      return 'Winter';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function audienceTabLabel(key: SeasonAudienceKey): string {
  switch (key) {
    case 'all':
      return 'Totaal';
    case 'kids':
      return 'Kinderen+baby';
    case 'adults':
      return 'Volwassenen';
    case 'other':
      return 'Overig';
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function matchedByLabel(matchedBy: StockSaleOrder['matchedBy']): string {
  switch (matchedBy) {
    case 'note':
      return 'notitie';
    case 'price':
      return 'prijs';
    case 'quotationName':
      return 'offertenaam';
    default: {
      const _exhaustive: never = matchedBy;
      return _exhaustive;
    }
  }
}

function barRange(from: number, to: number): [number, number] {
  return from <= to ? [from, to] : [to, from];
}

export default function SeasonInsightsPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [category, setCategory] = useState('Zomer 2026');
  const [quotationName, setQuotationName] = useState('');
  const [data, setData] = useState<SeasonInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAudience, setSelectedAudience] = useState<SeasonAudienceKey>('all');
  const hasAutoFetched = useRef(false);

  const fetchData = useCallback(async () => {
    if (!isLoggedIn) return;
    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      setError('Vul een categorie in, bijvoorbeeld “Zomer 2026”.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const body: { category: string; quotationName?: string } = { category: trimmedCategory };
      const trimmedOfferte = quotationName.trim();
      if (trimmedOfferte) body.quotationName = trimmedOfferte;

      const res = await fetch('/api/season-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || (json && typeof json.error === 'string')) {
        setData(null);
        setError(typeof json?.error === 'string' ? json.error : 'Kon seizoensinzichten niet laden.');
        return;
      }
      setData(json as SeasonInsights);
    } catch (err) {
      console.error('Error fetching season insights:', err);
      setData(null);
      setError('Kon seizoensinzichten niet laden.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, category, quotationName]);

  useEffect(() => {
    if (!isLoggedIn || authLoading || hasAutoFetched.current) return;
    hasAutoFetched.current = true;
    void fetchData();
  }, [isLoggedIn, authLoading, fetchData]);

  useEffect(() => {
    if (!data) return;
    if (selectedAudience === 'other' && data.byAudience.other.productCount === 0) {
      setSelectedAudience('all');
    }
  }, [data, selectedAudience]);

  const slice = data?.byAudience[selectedAudience] ?? null;

  const audienceTabs = useMemo((): SeasonAudienceKey[] => {
    const tabs: SeasonAudienceKey[] = ['all', 'kids', 'adults'];
    if (data && data.byAudience.other.productCount > 0) tabs.push('other');
    return tabs;
  }, [data]);

  const waterfallChart = useMemo(() => {
    if (!slice) return null;
    const restAfterSolden = slice.stockAtSoldenStart - slice.solden.units;
    return {
      labels: [
        'Beschikbaar',
        'Regulier verkocht',
        'Rest soldenstart',
        'Solden verkocht',
        'Rest na solden',
        'Stockverkoop',
        'Nog in winkel',
      ],
      datasets: [
        {
          label: 'Stuks',
          data: [
            barRange(0, slice.available),
            barRange(slice.available - slice.regular.units, slice.available),
            barRange(0, slice.stockAtSoldenStart),
            barRange(slice.stockAtSoldenStart - slice.solden.units, slice.stockAtSoldenStart),
            barRange(0, restAfterSolden),
            barRange(restAfterSolden - slice.stockSale.units, restAfterSolden),
            barRange(0, slice.currentStock),
          ],
          backgroundColor: [
            'rgba(59, 130, 246, 0.75)',
            'rgba(34, 197, 94, 0.75)',
            'rgba(99, 102, 241, 0.75)',
            'rgba(251, 146, 60, 0.75)',
            'rgba(100, 116, 139, 0.75)',
            'rgba(168, 85, 247, 0.75)',
            'rgba(244, 63, 94, 0.75)',
          ],
        },
      ],
    };
  }, [slice]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 font-sans">
        <div className="p-4">
          <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
            <p className="text-center py-12 text-gray-600">Gegevens laden...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 font-sans">
        <div className="p-4">
          <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Seizoensafsluiting</h1>
            <p className="text-center py-12 text-gray-600">Log in om seizoensinzichten te bekijken.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void fetchData();
            }}
            className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-6"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Seizoensafsluiting</h1>
              {data && (
                <p className="text-sm text-gray-600 mt-1">
                  {kindLabel(data.kind)} {data.year}
                  {data.matchedCategory && data.matchedCategory !== category.trim()
                    ? ` · gematcht: ${data.matchedCategory}`
                    : ''}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Categorie</span>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium bg-white min-w-[10rem]"
                  placeholder="Zomer 2026"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Offertenummer</span>
                <input
                  type="text"
                  value={quotationName}
                  onChange={(e) => setQuotationName(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium bg-white min-w-[10rem]"
                  placeholder="Optioneel"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow disabled:opacity-50"
              >
                {loading ? 'Laden...' : 'Laden'}
              </button>
            </div>
          </form>

          {data && (
            <p className="text-sm text-gray-700 mb-4">
              <span className="font-medium">Regulier:</span> {formatDateRange(data.periods.regular)}
              <span className="mx-2 text-gray-400">·</span>
              <span className="font-medium">Solden:</span> {formatDateRange(data.periods.solden)}
              <span className="mx-2 text-gray-400">·</span>
              <span className="font-medium">Na solden:</span> {formatDateRange(data.periods.after)}
            </p>
          )}

          {data?.summary && (
            <p className="text-sm text-gray-600 mb-6">{data.summary}</p>
          )}

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-center py-12 text-gray-600">Gegevens laden... dit kan tot een minuut duren.</p>
          ) : data && slice ? (
            <>
              <div className="flex flex-wrap gap-2 mb-6">
                {audienceTabs.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedAudience(key)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedAudience === key
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {audienceTabLabel(key)}
                  </button>
                ))}
              </div>

              <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                  <p className="text-green-700 text-sm font-medium mb-1">Reguliere verkoop</p>
                  <p className="text-2xl font-bold text-green-900">{formatUnits(slice.regular.units)}</p>
                  <p className="text-sm text-green-700">€{formatBE(slice.regular.revenue)}</p>
                  <p className="text-xs text-green-800 mt-1">{formatProfitLine(slice.regular)}</p>
                </div>
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-lg border border-indigo-200">
                  <p className="text-indigo-700 text-sm font-medium mb-1">Voorraad bij start solden</p>
                  <p className="text-2xl font-bold text-indigo-900">{formatUnits(slice.stockAtSoldenStart)}</p>
                  <p className="text-sm text-indigo-700">stuks</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                  <p className="text-orange-700 text-sm font-medium mb-1">Solden</p>
                  <p className="text-2xl font-bold text-orange-900">{formatUnits(slice.solden.units)}</p>
                  <p className="text-sm text-orange-700">
                    €{formatBE(slice.solden.revenue)}
                    {slice.avgSoldenDiscountPct != null ? ` · gem. ${formatPct(slice.avgSoldenDiscountPct)} korting` : ''}
                  </p>
                  <p className="text-xs text-orange-800 mt-1">{formatProfitLine(slice.solden)}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                  <p className="text-purple-700 text-sm font-medium mb-1">Stockverkoop 20%</p>
                  <p className="text-2xl font-bold text-purple-900">{formatUnits(slice.stockSale.units)}</p>
                  <p className="text-sm text-purple-700">€{formatBE(slice.stockSale.revenue)}</p>
                  <p className="text-xs text-purple-800 mt-1">{formatProfitLine(slice.stockSale)}</p>
                </div>
                <div className="bg-gradient-to-br from-rose-50 to-rose-100 p-4 rounded-lg border border-rose-200">
                  <p className="text-rose-700 text-sm font-medium mb-1">Nog in de winkel</p>
                  <p className="text-2xl font-bold text-rose-900">{formatUnits(slice.currentStock)}</p>
                  <p className="text-sm text-rose-700">€{formatBE(slice.currentRetailValue)} retail</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-lg border border-emerald-200">
                  <p className="text-emerald-700 text-sm font-medium mb-1">Winst totaal</p>
                  <p className="text-2xl font-bold text-emerald-900">€{formatBE(slice.totalSold.profit)}</p>
                  <p className="text-sm text-emerald-700">
                    {formatPct(slice.profitMarginPct)} marge · omzet €{formatBE(slice.totalSold.revenue)}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-gray-700 text-sm font-medium mb-1">Winst retail</p>
                  <p className="text-xl font-bold text-gray-900">€{formatBE(slice.retailSold.profit)}</p>
                  <p className="text-sm text-gray-600">{formatProfitLine(slice.retailSold)}</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-gray-700 text-sm font-medium mb-1">Winst na solden</p>
                  <p className="text-xl font-bold text-gray-900">€{formatBE(slice.afterRetail.profit)}</p>
                  <p className="text-sm text-gray-600">
                    {formatUnits(slice.afterRetail.units)} stuks · €{formatBE(slice.afterRetail.revenue)} omzet
                  </p>
                </div>
              </div>

              <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-700 text-sm font-medium mb-1">Sell-through retail</p>
                  <p className="text-2xl font-bold text-blue-900">{formatPct(slice.sellThroughRetailPct)}</p>
                  <p className="text-sm text-blue-700">Zonder stockverkoop</p>
                </div>
                <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-lg border border-teal-200">
                  <p className="text-teal-700 text-sm font-medium mb-1">Sell-through incl. stockverkoop</p>
                  <p className="text-2xl font-bold text-teal-900">{formatPct(slice.sellThroughInclStockSalePct)}</p>
                  <p className="text-sm text-teal-700">Retail + B2B 20%</p>
                </div>
              </div>

              {waterfallChart && (
                <div className="mb-8 bg-gray-50 p-4 rounded-lg border">
                  <h2 className="font-semibold mb-3 text-gray-900">Voorraadverloop</h2>
                  <Bar
                    data={waterfallChart}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const raw = ctx.raw as number | [number, number];
                              const value = Array.isArray(raw) ? Math.abs(raw[1] - raw[0]) : raw;
                              return `${ctx.label}: ${formatUnits(value)} stuks`;
                            },
                          },
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: { display: true, text: 'Stuks' },
                        },
                      },
                    }}
                  />
                </div>
              )}

              <div className="mb-8">
                <h2 className="font-semibold mb-3 text-gray-900">Merken in deze collectie</h2>
                {data.brands.length === 0 ? (
                  <p className="text-sm text-gray-600">Geen merken gevonden voor deze categorie.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200 rounded-lg text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left border-b font-semibold text-gray-900">Merk</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Beschikbaar</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Regulier</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Solden</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Na solden</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Stockverkoop</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Rest</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Winst</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Marge %</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Sell-through %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.brands.map((brand, idx) => {
                          const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                          return (
                            <tr key={brand.brandId ?? `${brand.brandName}-${idx}`} className={rowBg}>
                              <td className="px-3 py-2 font-medium border-b">{brand.brandName}</td>
                              <td className="px-3 py-2 text-right border-b">{formatUnits(brand.available)}</td>
                              <td className="px-3 py-2 text-right border-b">{formatUnits(brand.regularUnits)}</td>
                              <td className="px-3 py-2 text-right border-b text-orange-700">{formatUnits(brand.soldenUnits)}</td>
                              <td className="px-3 py-2 text-right border-b">{formatUnits(brand.afterUnits)}</td>
                              <td className="px-3 py-2 text-right border-b text-purple-700">{formatUnits(brand.stockSaleUnits)}</td>
                              <td className="px-3 py-2 text-right border-b font-semibold">{formatUnits(brand.currentStock)}</td>
                              <td className="px-3 py-2 text-right border-b">€{formatBE(brand.profit)}</td>
                              <td className="px-3 py-2 text-right border-b">{formatPct(brand.profitMarginPct)}</td>
                              <td className="px-3 py-2 text-right border-b">{formatPct(brand.sellThroughRetailPct)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h2 className="font-semibold mb-3 text-gray-900">Stockverkoop</h2>
                {data.stockSales.length === 0 ? (
                  <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
                    Auto-detect vond geen stockverkoop. Gebruik het offertenummer om een B2B-order te koppelen.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200 rounded-lg text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left border-b font-semibold text-gray-900">Order</th>
                          <th className="px-3 py-2 text-left border-b font-semibold text-gray-900">Partner</th>
                          <th className="px-3 py-2 text-left border-b font-semibold text-gray-900">Datum</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Stuks</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Omzet</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">Winst</th>
                          <th className="px-3 py-2 text-right border-b font-semibold text-gray-900">% van lijst</th>
                          <th className="px-3 py-2 text-left border-b font-semibold text-gray-900">Status</th>
                          <th className="px-3 py-2 text-left border-b font-semibold text-gray-900">Gekoppeld via</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stockSales.map((order, idx) => {
                          const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                          return (
                            <tr key={order.orderId} className={rowBg}>
                              <td className="px-3 py-2 font-medium border-b">{order.orderName}</td>
                              <td className="px-3 py-2 border-b">{order.partner ?? '—'}</td>
                              <td className="px-3 py-2 border-b">{formatDate(order.date)}</td>
                              <td className="px-3 py-2 text-right border-b">{formatUnits(order.units)}</td>
                              <td className="px-3 py-2 text-right border-b">€{formatBE(order.revenue)}</td>
                              <td className="px-3 py-2 text-right border-b">€{formatBE(order.profit)}</td>
                              <td className="px-3 py-2 text-right border-b">
                                {order.avgPctOfList == null ? '—' : formatPct(order.avgPctOfList)}
                              </td>
                              <td className="px-3 py-2 border-b">{order.state}</td>
                              <td className="px-3 py-2 border-b">{matchedByLabel(order.matchedBy)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mb-8">
                <h2 className="font-semibold mb-3 text-gray-900">Nog in de winkel</h2>
                {data.leftoverWarning && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-800">{data.leftoverWarning}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm font-medium text-gray-700 mb-1">Volwassenen</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatUnits(data.byAudience.adults.currentStock)} stuks
                    </p>
                    <p className="text-sm text-gray-600">
                      €{formatBE(data.byAudience.adults.currentRetailValue)} retail
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm font-medium text-gray-700 mb-1">Kinderen+baby</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatUnits(data.byAudience.kids.currentStock)} stuks
                    </p>
                    <p className="text-sm text-gray-600">
                      €{formatBE(data.byAudience.kids.currentRetailValue)} retail
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3">Uitleg & berekeningsmethode</h3>
                <div className="space-y-2 text-xs text-gray-700">
                  <p>
                    <strong>Reguliere verkoop:</strong> POS- en webshopverkopen vóór de soldenperiode.
                  </p>
                  <p>
                    <strong>Solden:</strong> verkopen tijdens de officiële solden. Gemiddelde korting volgt uit
                    betaalde prijs versus lijstprijs.
                  </p>
                  <p>
                    <strong>Voorraad:</strong> reconstructed via <code className="bg-blue-100 px-1 rounded">stock.move</code>{' '}
                    (opening + inkomende bewegingen tot de peildatum).
                  </p>
                  <p>
                    <strong>Stockverkoop 20%:</strong> B2B-orders herkend via notitie, prijs (±20% van lijst) of
                    offertenummer.
                  </p>
                  <p>
                    <strong>Winst:</strong> omzet minus kostprijs (
                    <code className="bg-blue-100 px-1 rounded">standard_price</code>
                    ), dezelfde methode als Merkprestaties. POS-omzet is incl. BTW.
                  </p>
                  <p>
                    <strong>Rest na solden:</strong> voorraad bij start solden minus soldenstuks (benadering).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                    <div className="bg-white p-2 rounded">
                      <strong>Beschikbaar:</strong> opening + inkoop
                    </div>
                    <div className="bg-white p-2 rounded">
                      <strong>Retail sell-through:</strong> regulier + solden + na solden / beschikbaar
                    </div>
                    <div className="bg-white p-2 rounded">
                      <strong>Incl. stockverkoop:</strong> retail + B2B / beschikbaar
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            !error && <p className="text-center py-12 text-gray-500">Geen data beschikbaar</p>
          )}
        </div>
      </div>
    </div>
  );
}
