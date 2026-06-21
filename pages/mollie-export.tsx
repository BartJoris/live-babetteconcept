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

/** Toon YYYY-MM-DD in lokale kalender (geen UTC-parse van date-only strings). */
function formatDate(dateStr: string) {
  if (!isValidDateOnly(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Validates HTML date input value (YYYY-MM-DD) without relying on Date parsing quirks. */
function isValidDateOnly(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

function isRangeValid(from: string, to: string): boolean {
  return isValidDateOnly(from) && isValidDateOnly(to) && from <= to;
}

/**
 * Belgische kalenderdatum → ISO YYYY-MM-DD (dag eerst, dan maand).
 * Voorbeeld: 01/04/2026 = 1 april 2026 → 2026-04-01 (nooit Amerikaanse M/D).
 */
function parseBelgianDateDisplay(s: string): string | null {
  const trimmed = s.trim().replace(/\s+/g, '');
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(trimmed);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const t = new Date(year, month - 1, day);
  if (t.getFullYear() !== year || t.getMonth() !== month - 1 || t.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Reden waarom aangepaste periode nog niet exporteerbaar is (anders null). `fromBe`/`toBe` = DD/MM/JJJJ-tekst. */
function getCustomPeriodIssue(fromBe: string, toBe: string): string | null {
  if (!fromBe.trim() || !toBe.trim()) {
    return 'Vul begindatum (Van) en einddatum (Tot) in als DD/MM/JJJJ.';
  }
  const fromIso = parseBelgianDateDisplay(fromBe);
  const toIso = parseBelgianDateDisplay(toBe);
  if (!fromIso || !toIso) {
    return 'Ongeldige datum. Gebruik DD/MM/JJJJ — bv. 01/04/2026 voor 1 april 2026 (dag / maand / jaar).';
  }
  if (fromIso > toIso) {
    return `Begindatum moet vóór of op de einddatum liggen. Nu is ${formatDate(fromIso)} (${fromBe.trim()}) later dan ${formatDate(toIso)} (${toBe.trim()}).`;
  }
  return null;
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

  const [odooJournalId, setOdooJournalId] = useState('');
  const [odooSkipDup, setOdooSkipDup] = useState(true);
  const [odooImporting, setOdooImporting] = useState(false);
  const [odooImportResult, setOdooImportResult] = useState<string | null>(null);

  const getDateRange = useCallback(() => {
    if (mode === 'quarter') {
      return getQuarterDates(selectedQuarter, selectedYear);
    }
    const fromIso = parseBelgianDateDisplay(customFrom);
    const toIso = parseBelgianDateDisplay(customTo);
    return { from: fromIso ?? '', to: toIso ?? '' };
  }, [mode, selectedQuarter, selectedYear, customFrom, customTo]);

  const runOdooApiImport = async (dryRun: boolean) => {
    setError(null);
    setSuccessMsg(null);
    setOdooImportResult(null);

    const { from, to } = getDateRange();
    if (!isRangeValid(from, to)) {
      setError(
        mode === 'custom'
          ? 'Vul geldige Van- en Tot-datums in als DD/MM/JJJJ (dag / maand / jaar).'
          : 'Selecteer eerst een geldige periode.'
      );
      return;
    }

    const journalMatch = odooJournalId.trim().match(/\d+/);
    const journalNum = journalMatch ? parseInt(journalMatch[0], 10) : NaN;
    const body: Record<string, unknown> = {
      from,
      to,
      dryRun,
      skipDuplicates: odooSkipDup,
    };
    if (Number.isFinite(journalNum) && journalNum > 0) {
      body.journalId = journalNum;
    }

    setOdooImporting(true);
    try {
      const res = await fetch('/api/mollie/import-odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setOdooImportResult(JSON.stringify(data, null, 2));
      if (dryRun) {
        setSuccessMsg(`Dry-run: ${data.rowCount ?? 0} regels zouden geïmporteerd worden (zie JSON hieronder).`);
      } else {
        setSuccessMsg(
          `Odoo: ${data.created ?? 0} aangemaakt, ${data.skipped ?? 0} overgeslagen, ${data.failed ?? 0} mislukt.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import mislukt');
    } finally {
      setOdooImporting(false);
    }
  };

  const runExport = async (format: 'classic' | 'odoo' | 'odoo_bank') => {
    setError(null);
    setSuccessMsg(null);
    setOdooImportResult(null);

    const { from, to } = getDateRange();

    if (!isRangeValid(from, to)) {
      if (!from || !to) {
        setError(
          mode === 'custom'
            ? 'Vul Van en Tot in als DD/MM/JJJJ (dag / maand / jaar).'
            : 'Selecteer een geldig datumbereik.'
        );
      } else if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
        setError(
          mode === 'custom'
            ? 'Ongeldige datum. Gebruik DD/MM/JJJJ, bv. 01/04/2026 voor 1 april.'
            : 'Ongeldige datum. Gebruik het datumveld om een periode te kiezen.'
        );
      } else {
        setError('Startdatum moet voor of gelijk zijn aan de einddatum.');
      }
      return;
    }

    setIsExporting(true);

    try {
      const params = new URLSearchParams({ from, to });
      if (format === 'odoo') {
        params.set('format', 'odoo');
      } else if (format === 'odoo_bank') {
        params.set('format', 'odoo_bank');
      }

      const res = await fetch(`/api/mollie/settlements?${params}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const count = parseInt(res.headers.get('X-Transaction-Count') || '0', 10);
      const approach = res.headers.get('X-Approach') || '';
      const settlementError = res.headers.get('X-Settlement-Error') === 'true';
      const exportFormat = res.headers.get('X-Export-Format') || format;

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers
          .get('Content-Disposition')
          ?.match(/filename="(.+)"/)?.[1] ||
        (format === 'odoo_bank'
          ? `mollie-settlements-${from}-tot-${to}-odoo-bank.csv`
          : format === 'odoo'
            ? `mollie-settlements-${from}-tot-${to}-odoo.csv`
            : `mollie-settlements-${from}-tot-${to}.csv`);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      const formatLabel =
        exportFormat === 'odoo_bank'
          ? ' (Odoo bank — minimaal CSV)'
          : exportFormat === 'odoo'
            ? ' (Odoo bank — volledig CSV)'
            : ' (klassiek)';

      if (count === 0) {
        setError('Geen uitbetalingen gevonden in deze periode.');
      } else if (approach === 'payments' && settlementError) {
        const odooExtra =
          exportFormat === 'odoo' || exportFormat === 'odoo_bank'
            ? ' Omzet- en kostenregels uit settlement.periods ontbreken eveneens. '
            : ' ';
        setSuccessMsg(
          `${count} transactie${count !== 1 ? 's' : ''} geëxporteerd${formatLabel} voor ${formatDate(from)} t/m ${formatDate(to)}. ` +
            'Let op: kostenregels en uitbetalingsreferenties ontbreken omdat de Settlements API een access token vereist.' +
            odooExtra +
            'Voeg MOLLIE_ACCESS_TOKEN toe aan .env.local voor volledige settlement data.'
        );
      } else {
        setSuccessMsg(
          `${count} rij${count !== 1 ? 'en' : ''} geëxporteerd${formatLabel} voor ${formatDate(from)} t/m ${formatDate(to)}` +
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
  const rangeValid = isRangeValid(from, to);
  const customIssue = mode === 'custom' ? getCustomPeriodIssue(customFrom, customTo) : null;
  const customFromIso = mode === 'custom' ? parseBelgianDateDisplay(customFrom) : null;
  const customToIso = mode === 'custom' ? parseBelgianDateDisplay(customTo) : null;
  const customDatesReversed =
    mode === 'custom' &&
    customFromIso !== null &&
    customToIso !== null &&
    customFromIso > customToIso;

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
            Exporteer Mollie-uitbetalingen (settlements) over een gekozen periode. Kies{' '}
            <strong>klassiek</strong> voor het bestand zoals vroeger naar de boekhouder (zelfde
            kolommen als voorheen, paidout, mistercash, …) of             <strong>Odoo bankimport</strong>: kies <strong>volledig CSV</strong> (alle Mollie-kolommen + hulpvelden)
            of <strong>minimaal CSV</strong> (alleen datum, bedrag, label, referentie) voor snelle koppeling in de
            importwizard — zie onder <em>Importeren in Odoo 19.1</em>.
          </p>

          <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Periode selecteren
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
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
                  type="button"
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
                        type="button"
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
              <div className="grid grid-cols-2 gap-4" lang="nl-BE">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mollie-export-from">
                    Van <span className="font-normal text-gray-500">(DD/MM/JJJJ)</span>
                  </label>
                  <input
                    id="mollie-export-from"
                    type="text"
                    name="mollie-export-from"
                    autoComplete="off"
                    enterKeyHint="next"
                    inputMode="numeric"
                    placeholder="01/04/2026"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mollie-export-to">
                    Tot <span className="font-normal text-gray-500">(DD/MM/JJJJ)</span>
                  </label>
                  <input
                    id="mollie-export-to"
                    type="text"
                    name="mollie-export-to"
                    autoComplete="off"
                    enterKeyHint="done"
                    inputMode="numeric"
                    placeholder="30/04/2026"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-500">
                  Altijd <strong>dag / maand / jaar</strong> (Belgische notering), met schuine strepen of punten.
                  Het oude datumveld van de browser kon maand en dag verwisselen; hier niet.
                </p>
              </div>
            )}

            {customIssue && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-2">
                <p className="text-sm text-amber-900">{customIssue}</p>
                {customDatesReversed && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFrom(customTo);
                      setCustomTo(customFrom);
                    }}
                    className="text-sm font-medium text-amber-900 underline hover:no-underline"
                  >
                    Ruil Van en Tot (als ze per ongeluk omgekeerd staan)
                  </button>
                )}
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

            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => runExport('classic')}
                disabled={isExporting || !rangeValid}
                className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors ${
                  isExporting || !rangeValid
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isExporting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 shrink-0"
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
                    Bezig…
                  </span>
                ) : (
                  'Exporteer klassiek (13 kolommen)'
                )}
              </button>
              <button
                type="button"
                onClick={() => runExport('odoo')}
                disabled={isExporting || !rangeValid}
                className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-colors border ${
                  isExporting || !rangeValid
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                }`}
              >
                {isExporting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 shrink-0"
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
                    Bezig…
                  </span>
                ) : (
                  'Exporteer voor Odoo (volledig CSV)'
                )}
              </button>
              </div>
              <button
                type="button"
                onClick={() => runExport('odoo_bank')}
                disabled={isExporting || !rangeValid}
                className={`w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors border border-dashed ${
                  isExporting || !rangeValid
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {isExporting ? 'Bezig…' : 'Download minimaal CSV voor Odoo-import (4 kolommen)'}
              </button>

              <div className="border border-gray-200 rounded-lg p-4 bg-slate-50 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Rechtstreeks naar Odoo (API)</h3>
                <p className="text-xs text-gray-600">
                  Server gebruikt <code className="bg-white px-1 rounded">ODOO_USERNAME</code>,{' '}
                  <code className="bg-white px-1 rounded">ODOO_API_KEY</code> en optioneel{' '}
                  <code className="bg-white px-1 rounded">ODOO_MOLLIE_BANK_JOURNAL_ID</code>. Zet voor het Mollie-duplicaat
                  ook <code className="bg-white px-1 rounded">ODOO_URL</code> (eindigt op <code className="bg-white px-1 rounded">/jsonrpc</code>) en{' '}
                  <code className="bg-white px-1 rounded">ODOO_DB</code> naar die database. Journal-id = getal in de
                  bank-URL (duplicaat:{' '}
                  <a
                    href="https://mollie-babetteconcept.odoo.com/odoo/accounting/12/reconciliation"
                    className="text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    …/accounting/12/…
                  </a>
                  → <strong>12</strong>). Het journaal moet een suspense-account hebben. Start met een dry-run.
                </p>
                <div>
                  <label
                    className="block text-xs font-medium text-gray-700 mb-1"
                    htmlFor="mollie-odoo-journal"
                  >
                    Bankjournaal-id (optioneel als <code className="bg-gray-100 px-0.5 rounded">ODOO_MOLLIE_BANK_JOURNAL_ID</code> in .env staat)
                  </label>
                  <input
                    id="mollie-odoo-journal"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={odooJournalId}
                    onChange={(e) => setOdooJournalId(e.target.value)}
                    placeholder="12"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={odooSkipDup}
                    onChange={(e) => setOdooSkipDup(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Sla regels over als ref al bestaat (aanbevolen)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => runOdooApiImport(true)}
                    disabled={odooImporting || !rangeValid}
                    className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {odooImporting ? 'Bezig…' : 'Dry-run naar Odoo'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const { from, to } = getDateRange();
                      if (
                        !confirm(
                          `Zeker? Er worden banktransactieregels in Odoo aangemaakt (geboekt) voor ${formatDate(from)} t/m ${formatDate(to)}.`
                        )
                      ) {
                        return;
                      }
                      await runOdooApiImport(false);
                    }}
                    disabled={odooImporting || !rangeValid}
                    className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {odooImporting ? 'Bezig…' : 'Echt importeren'}
                  </button>
                </div>
                {odooImportResult && (
                  <pre className="text-xs bg-white border rounded p-3 overflow-x-auto max-h-64 text-gray-800">
                    {odooImportResult}
                  </pre>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-amber-900 mb-2">
              Volledige settlement data nodig?
            </h2>
            <p className="text-sm text-amber-800 mb-3">
              Met enkel een <code className="bg-amber-100 px-1 rounded">MOLLIE_API_KEY</code> wordt
              bij een fout op de Settlements API teruggevallen op de Payments API (alleen
              betaalde betalingen in de periode). Voor settlements inclusief
              kosten- en omzetregels uit <code className="bg-amber-100 px-1 rounded">periods</code> heb je een access token nodig.
            </p>
            <p className="text-sm text-amber-800">
              Voeg <code className="bg-amber-100 px-1 rounded">MOLLIE_ACCESS_TOKEN</code> toe
              aan <code className="bg-amber-100 px-1 rounded">.env.local</code> met
              een token met <code className="bg-amber-100 px-1 rounded">settlements.read</code> scope.
              Dit kan via een Mollie OAuth app of de Partner API.
            </p>
          </div>

          <div className="mt-6 bg-white rounded-lg shadow-sm border p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Klassieke export (zelfde kolommen als vroeger)
              </h2>
              <p className="text-sm text-gray-600 mb-3">
                Zelfde opmaak als voorheen: datum/tijd lokaal geformatteerd, betaalmethode-oorten
                zoals mistercash, status <code className="bg-gray-100 px-1 rounded">paidout</code> op
                betalingen, kosten als negatieve bedragen met Withheld fees-tekst (inclusief
                factuurreferentie via Mollie indien beschikbaar).
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Odoo bankimport (zelfde koppen als klassiek + extra kolommen)
              </h2>
              <p className="text-sm text-gray-600 mb-3">
                Betalingen met ISO-datums en Mollie status/methode; daarnaast regels uit{' '}
                <code className="bg-gray-100 px-1 rounded">settlement.periods[].revenue</code> en{' '}
                <code className="bg-gray-100 px-1 rounded">.costs</code> (geen dubbele som met de tr_-regels — dit zijn breakdownregels).
                Extra kolommen: <strong>Description</strong>, <strong>Datum_DDMMYYYY</strong> (nl-BE),{' '}
                <strong>Settlement_ID</strong>, <strong>Boekingsdatum</strong>, <strong>Regeltype</strong> (betaling / omzet / kosten),{' '}
                <strong>Unieke_import_ID</strong>, <strong>Mollie_invoice_ID</strong>, <strong>Mollie_modus</strong>.
                Controleer kolommapping op Odoo 19.1 vóór productie-import.
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                <span className="font-medium text-gray-700">Datum</span>
                <span>Mollie ISO-timestamp (paidAt of createdAt); bij perioderegels settledAt</span>
                <span className="font-medium text-gray-700">Betaalmethode</span>
                <span>Mollie method-code of leeg</span>
                <span className="font-medium text-gray-700">Valuta / Bedrag / Status / ID</span>
                <span>Zoals Mollie levert; ID leeg bij omzet- en kostenregels</span>
                <span className="font-medium text-gray-700">Omschrijving</span>
                <span>Payment description of Mollie periodetekst</span>
                <span className="font-medium text-gray-700">Consument / uitbetaling / teruggestort</span>
                <span>Zoals Mollie; teruggestort vaak 0,00 op fee-regels</span>
                <span className="font-medium text-gray-700">Description</span>
                <span>Samengevat voor Odoo omschrijving-kolom</span>
                <span className="font-medium text-gray-700">Datum_DDMMYYYY</span>
                <span>dd/MM/yyyy voor directe Datum-mapping in de wizard</span>
                <span className="font-medium text-gray-700">Settlement_ID / Boekingsdatum / Regeltype</span>
                <span>stl_…, YYYY-MM-DD, betaling | omzet | kosten</span>
                <span className="font-medium text-gray-700">Unieke_import_ID</span>
                <span>tr_… of settlement:rev:… / settlement:cost:…</span>
                <span className="font-medium text-gray-700">Mollie_invoice_ID / Mollie_modus</span>
                <span>Invoice-id op settlement; live/test op betalingen</span>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Importeren in Odoo 19.1 (boekhouding)
              </h2>
              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 mb-4">
                <li>
                  Ga naar <strong>Boekhouding</strong> → dashboard → klik het <strong>⋯</strong> (drie puntjes) op
                  je <strong>bankjournaal</strong> (rekening waar Mollie op binnenkomt) →{' '}
                  <strong>Bestand importeren</strong> (of open het journaal en sleep het CSV-bestand op de tegel).
                </li>
                <li>
                  Kies het bestand. Bij CSV/XLSX vraagt Odoo om <strong>scheidingstekens</strong> en{' '}
                  <strong>kolommapping</strong>: klik door naar de mappingstap.
                </li>
                <li>
                  Stel het <strong>datumformaat</strong> in de wizard af op wat je gebruikt: voor het{' '}
                  <strong>volledige</strong> exportbestand kun je <code className="bg-gray-100 px-1 rounded">Boekingsdatum</code>{' '}
                  koppelen aan het Odoo-veld <strong>Date</strong> (notatie <code className="bg-gray-100 px-1 rounded">yyyy-MM-dd</code>)
                  of <code className="bg-gray-100 px-1 rounded">Datum_DDMMYYYY</code> met notatie{' '}
                  <code className="bg-gray-100 px-1 rounded">dd/MM/yyyy</code>.
                </li>
                <li>
                  Koppel <strong>Amount</strong> aan <code className="bg-gray-100 px-1 rounded">Bedrag</code> of{' '}
                  <code className="bg-gray-100 px-1 rounded">Uitbetalingsbedrag</code> (zelfde bedrag in EUR op
                  jullie bestanden). Zet het <strong>decimaalscheidingsteken</strong> op <strong>punt</strong> (.) als
                  de voorbeeldwaarden <code className="bg-gray-100 px-1 rounded">155.85</code> tonen.
                </li>
                <li>
                  Koppel <strong>Label</strong> / <strong>Payment reference</strong> aan{' '}
                  <code className="bg-gray-100 px-1 rounded">Description</code> (aanbevolen) of aan{' '}
                  <code className="bg-gray-100 px-1 rounded">Omschrijving</code>.
                </li>
                <li>
                  Optioneel: map <code className="bg-gray-100 px-1 rounded">Unieke_import_ID</code> naar een referentieveld
                  om latere duplicaten te herkennen. Voer daarna <strong>Test</strong> en <strong>Importeren</strong> uit.
                </li>
              </ol>
              <p className="text-sm text-gray-600 mb-3">
                <strong>Sneller:</strong> gebruik de knop <em>Download minimaal CSV voor Odoo-import</em>. Dat bestand
                heeft koppen <code className="bg-gray-100 px-1 rounded">date</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">amount</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">payment_ref</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">ref</code> — die matchen vaak direct met de Odoo-velden{' '}
                <strong>Date</strong>, <strong>Amount</strong>, <strong>Label</strong> en <strong>Reference</strong>{' '}
                (namen kunnen iets verschillen per taalversie van Odoo; kies het equivalent in de dropdown).
              </p>
              <p className="text-sm text-gray-500">
                Officiële uitleg:{' '}
                <a
                  href="https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/transactions.html"
                  className="text-blue-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Odoo 19 — Transactions (import CSV/XLSX)
                </a>
                . Voorbeeldbestanden:{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">example-import/mollie-examples/</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
