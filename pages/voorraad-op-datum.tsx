import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

type BrandStockValueRow = {
  brandName: string;
  units: number;
  variantCount: number;
  templateCount: number;
  costValue: number;
  retailValue: number;
};

type StockValueAtDateData = {
  asOfDate: string;
  filters: { brand: string | null; category: string | null; audience: string };
  totalUnits: number;
  variantCount: number;
  templateCount: number;
  costValue: number;
  retailValue: number;
  zeroCostUnits: number;
  moveCount: number;
  truncatedMoves: boolean;
  truncatedProducts: boolean;
  brands: BrandStockValueRow[];
  summary: string;
};

const formatBE = (amount: number) =>
  amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatUnits = (n: number) =>
  n.toLocaleString('nl-BE', { maximumFractionDigits: 0 });

function formatDateNl(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultAsOfDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function VoorraadOpDatumPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [asOfDate, setAsOfDate] = useState(defaultAsOfDate);
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('all');
  const [data, setData] = useState<StockValueAtDateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isLoggedIn) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stock-value-at-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asOfDate,
          brand: brand.trim() || undefined,
          category: category.trim() || undefined,
          audience: audience === 'all' ? undefined : audience,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Ophalen mislukt');
      }
      setData(json as StockValueAtDateData);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Ophalen mislukt');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, asOfDate, brand, category, audience]);

  useEffect(() => {
    if (isLoggedIn) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only; filters apply via button
  }, [isLoggedIn]);

  const brandTotalCost = useMemo(
    () => data?.brands.reduce((sum, b) => sum + b.costValue, 0) ?? 0,
    [data]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Laden…</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Log in om voorraadwaarde op datum te bekijken.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Voorraadwaarde op datum</h1>
          <p className="text-gray-600 mt-1">
            Herberekent voorraad via <code className="bg-gray-100 px-1 rounded text-sm">stock.move</code>
            en waardeert met huidige kost- en verkoopprijzen.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
              <input
                type="date"
                value={asOfDate}
                max={todayIso()}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Merk (optioneel)</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="bv. Tiny Cottons"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categorie (optioneel)</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="bv. Zomer 2025"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Doelgroep</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              >
                <option value="all">Alle</option>
                <option value="adults">Volwassenen</option>
                <option value="kids">Kinderen (alle)</option>
                <option value="babies">Baby&apos;s</option>
                <option value="children">Kinderen</option>
                <option value="teens">Tieners</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded-lg"
            >
              {loading ? 'Berekenen…' : 'Bereken voorraadwaarde'}
            </button>
            {error ? <p className="text-red-600 text-sm">{error}</p> : null}
          </div>
        </div>

        {loading && !data ? (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-600">
            Voorraad herberekenen voor {formatDateNl(asOfDate)}…
          </div>
        ) : null}

        {data ? (
          <>
            {(data.truncatedMoves || data.truncatedProducts) && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
                Resultaat mogelijk afgekapt door grote datasets. Verfijn met merk- of categoriefilter indien nodig.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-sm text-purple-700 font-medium mb-1">Kostwaarde</p>
                <p className="text-2xl font-bold text-purple-900">€{formatBE(data.costValue)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-sm text-blue-700 font-medium mb-1">Verkoopwaarde</p>
                <p className="text-2xl font-bold text-blue-900">€{formatBE(data.retailValue)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-sm text-gray-600 font-medium mb-1">Voorraad</p>
                <p className="text-2xl font-bold text-gray-900">{formatUnits(data.totalUnits)} stuks</p>
                <p className="text-sm text-gray-500 mt-1">
                  {data.variantCount} varianten · {data.templateCount} modellen
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">{data.summary}</p>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h2 className="font-semibold text-gray-900">Per merk</h2>
                <p className="text-sm text-gray-500">
                  {data.moveCount.toLocaleString('nl-BE')} stock moves verwerkt tot {formatDateNl(data.asOfDate)}
                </p>
              </div>
              {data.brands.length === 0 ? (
                <p className="p-6 text-gray-600 text-sm">Geen voorraad gevonden op deze datum.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600 border-b">
                        <th className="px-4 py-2 font-medium">Merk</th>
                        <th className="px-4 py-2 font-medium text-right">Stuks</th>
                        <th className="px-4 py-2 font-medium text-right">Varianten</th>
                        <th className="px-4 py-2 font-medium text-right">Modellen</th>
                        <th className="px-4 py-2 font-medium text-right">Kostwaarde</th>
                        <th className="px-4 py-2 font-medium text-right">Verkoopwaarde</th>
                        <th className="px-4 py-2 font-medium text-right">% kost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.brands.map((row) => (
                        <tr key={row.brandName} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{row.brandName}</td>
                          <td className="px-4 py-2 text-right">{formatUnits(row.units)}</td>
                          <td className="px-4 py-2 text-right">{row.variantCount}</td>
                          <td className="px-4 py-2 text-right">{row.templateCount}</td>
                          <td className="px-4 py-2 text-right">€{formatBE(row.costValue)}</td>
                          <td className="px-4 py-2 text-right">€{formatBE(row.retailValue)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {brandTotalCost > 0
                              ? `${((row.costValue / brandTotalCost) * 100).toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold text-gray-900">
                        <td className="px-4 py-2">Totaal</td>
                        <td className="px-4 py-2 text-right">{formatUnits(data.totalUnits)}</td>
                        <td className="px-4 py-2 text-right">{data.variantCount}</td>
                        <td className="px-4 py-2 text-right">{data.templateCount}</td>
                        <td className="px-4 py-2 text-right">€{formatBE(data.costValue)}</td>
                        <td className="px-4 py-2 text-right">€{formatBE(data.retailValue)}</td>
                        <td className="px-4 py-2 text-right">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {data.zeroCostUnits > 0 ? (
              <p className="mt-4 text-sm text-amber-800">
                {formatUnits(data.zeroCostUnits)} stuks hebben geen kostprijs in Odoo (standaardprijs 0).
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
