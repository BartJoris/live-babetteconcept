import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Head from 'next/head';

const QUARTERS = [
  { label: 'Q1', startMonth: 0, endMonth: 2 },
  { label: 'Q2', startMonth: 3, endMonth: 5 },
  { label: 'Q3', startMonth: 6, endMonth: 8 },
  { label: 'Q4', startMonth: 9, endMonth: 11 },
];

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getQuarterDates(quarter: number, year: number) {
  const q = QUARTERS[quarter];
  const from = new Date(year, q.startMonth, 1);
  const to = new Date(year, q.endMonth + 1, 0);
  return { from: toDateStr(from), to: toDateStr(to) };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function MollieExport() {
  const { isLoading, isLoggedIn } = useAuth();
  const [mode, setMode] = useState<'quarter' | 'custom'>('quarter');
  const [selectedQuarter, setSelectedQuarter] = useState(3);
  const [selectedYear, setSelectedYear] = useState(currentYear - 1);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getDateRange = useCallback(() => {
    if (mode === 'quarter') {
      return getQuarterDates(selectedQuarter, selectedYear);
    }
    return { from: customFrom, to: customTo };
  }, [mode, selectedQuarter, selectedYear, customFrom, customTo]);

  const handleExport = async () => {
    setError(null);
    setSuccessMsg(null);

    const { from, to } = getDateRange();

    if (!from || !to) {
      setError('Selecteer een geldig datumbereik.');
      return;
    }

    if (new Date(from) > new Date(to)) {
      setError('Startdatum moet voor einddatum liggen.');
      return;
    }

    setIsExporting(true);

    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(
        `/api/mollie/settlements?${params}`,
        { credentials: 'include' }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const count = parseInt(res.headers.get('X-Transaction-Count') || '0', 10);
      const approach = res.headers.get('X-Approach') || '';
      const settlementError = res.headers.get('X-Settlement-Error') === 'true';

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers
          .get('Content-Disposition')
          ?.match(/filename="(.+)"/)?.[1] ||
        `mollie-settlements-${from}-tot-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      if (count === 0) {
        setError('Geen uitbetalingen gevonden in deze periode.');
      } else if (approach === 'payments' && settlementError) {
        setSuccessMsg(
          `${count} transactie${count !== 1 ? 's' : ''} geëxporteerd voor ${formatDate(from)} t/m ${formatDate(to)}. ` +
          'Let op: kostenregels en uitbetalingsreferenties ontbreken omdat de Settlements API een access token vereist. ' +
          'Voeg MOLLIE_ACCESS_TOKEN toe aan .env.local voor volledige settlement data.'
        );
      } else {
        setSuccessMsg(
          `${count} rij${count !== 1 ? 'en' : ''} geëxporteerd voor ${formatDate(from)} t/m ${formatDate(to)}` +
          (approach === 'settlements' ? ' (inclusief kostenregels)' : '')
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      setError(message);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isLoggedIn) return null;

  const { from, to } = getDateRange();
  const rangeValid = from && to && new Date(from) <= new Date(to);

  return (
    <>
      <Head>
        <title>Mollie Export - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Mollie Uitbetalingen Export
          </h1>
          <p className="text-gray-600 mb-8">
            Exporteer alle Mollie uitbetalingen (settlements) over een bepaalde
            periode als één gecombineerd CSV bestand, in hetzelfde formaat als de
            Mollie dashboard export.
          </p>

          <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Periode selecteren
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('quarter')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === 'quarter'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Per kwartaal
                </button>
                <button
                  onClick={() => setMode('custom')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Aangepaste periode
                </button>
              </div>
            </div>

            {mode === 'quarter' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jaar
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kwartaal
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {QUARTERS.map((q, i) => (
                      <button
                        key={q.label}
                        onClick={() => setSelectedQuarter(i)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          selectedQuarter === i
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Van
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tot
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {rangeValid && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Geselecteerde periode:</span>{' '}
                  {formatDate(from)} t/m {formatDate(to)}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-sm text-green-800">{successMsg}</p>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={isExporting || !rangeValid}
              className={`w-full py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                isExporting || !rangeValid
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isExporting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Bezig met exporteren...
                </span>
              ) : (
                'Exporteer Uitbetalingen als CSV'
              )}
            </button>
          </div>

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-amber-900 mb-2">
              Volledige settlement data nodig?
            </h2>
            <p className="text-sm text-amber-800 mb-3">
              Met enkel een <code className="bg-amber-100 px-1 rounded">MOLLIE_API_KEY</code> worden
              de betalingen geëxporteerd, maar ontbreken de kostenregels (fees) en
              uitbetalingsreferenties. Voor de volledige settlement export
              (identiek aan de Mollie dashboard export) heb je een access token nodig.
            </p>
            <p className="text-sm text-amber-800">
              Voeg <code className="bg-amber-100 px-1 rounded">MOLLIE_ACCESS_TOKEN</code> toe
              aan <code className="bg-amber-100 px-1 rounded">.env.local</code> met
              een token met <code className="bg-amber-100 px-1 rounded">settlements.read</code> scope.
              Dit kan via een Mollie OAuth app of de Partner API.
            </p>
          </div>

          <div className="mt-6 bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              CSV Kolommen (Mollie formaat)
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <span className="font-medium text-gray-700">Datum</span>
              <span>Datum + tijd van betaling</span>
              <span className="font-medium text-gray-700">Betaalmethode</span>
              <span>mistercash, paypal, creditcard, ...</span>
              <span className="font-medium text-gray-700">Valuta</span>
              <span>EUR</span>
              <span className="font-medium text-gray-700">Bedrag</span>
              <span>Betaald bedrag</span>
              <span className="font-medium text-gray-700">Status</span>
              <span>paidout</span>
              <span className="font-medium text-gray-700">ID</span>
              <span>Mollie transactie-ID</span>
              <span className="font-medium text-gray-700">Omschrijving</span>
              <span>Bestelnummer / omschrijving</span>
              <span className="font-medium text-gray-700">Rekening consument</span>
              <span>IBAN van de klant</span>
              <span className="font-medium text-gray-700">BIC consument</span>
              <span>BIC van de bank van de klant</span>
              <span className="font-medium text-gray-700">Uitbetalingsreferentie</span>
              <span>Mollie settlement referentie</span>
              <span className="font-medium text-gray-700">Teruggestort bedrag</span>
              <span>Terugbetaald bedrag (indien van toepassing)</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
