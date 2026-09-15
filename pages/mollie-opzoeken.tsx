import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  emptyLookupMessage,
  lookupRowsToCsv,
  matchStatusLabel,
  type LookupRow,
  type MatchStatus,
} from '@/lib/mollieLookup';

type InTransitFilter = 'all' | 'uitbetaald' | 'in_transit';

function formatEuro(amount: number | null, currency: string | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return amount.toLocaleString('nl-BE', {
    style: 'currency',
    currency: currency || 'EUR',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function documentName(row: LookupRow): string {
  return [row.odooOrderName, row.odooMoveName].filter(Boolean).join(' / ') || '—';
}

function statusClass(status: MatchStatus): string {
  switch (status) {
    case 'uitbetaald':
      return 'bg-green-50 text-green-800';
    case 'in_transit':
      return 'bg-amber-50 text-amber-800';
    case 'geen_mollie_id':
      return 'bg-gray-100 text-gray-700';
    case 'niet_in_mollie':
      return 'bg-red-50 text-red-800';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ResultsTable({ rows }: { rows: LookupRow[] }) {
  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-3 py-2 font-medium">Order / factuur</th>
            <th className="px-3 py-2 font-medium">Relatie</th>
            <th className="px-3 py-2 font-medium">Odoo-datum</th>
            <th className="px-3 py-2 font-medium text-right">Bedrag</th>
            <th className="px-3 py-2 font-medium">Mollie-id</th>
            <th className="px-3 py-2 font-medium">Mollie-status</th>
            <th className="px-3 py-2 font-medium">Uitbetaling</th>
            <th className="px-3 py-2 font-medium">Match</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.odooLineId ?? row.molliePaymentId ?? index}`} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">{documentName(row)}</td>
              <td className="px-3 py-2">{row.partnerName || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.odooDate)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {formatEuro(row.amount, row.currency)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.molliePaymentId || '—'}</td>
              <td className="px-3 py-2">{row.molliePaymentStatus || '—'}</td>
              <td className="px-3 py-2">
                {row.settlementReference ? (
                  <span>
                    {row.settlementReference}
                    {row.settledAt ? (
                      <span className="block text-xs text-gray-500">{formatDate(row.settledAt)}</span>
                    ) : null}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusClass(row.matchStatus)}`}>
                  {matchStatusLabel(row.matchStatus)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MollieOpzoekenPage() {
  const { isLoading, isLoggedIn } = useAuth();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRows, setSearchRows] = useState<LookupRow[] | null>(null);
  const [searchEmpty, setSearchEmpty] = useState<string | null>(null);

  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openAccount, setOpenAccount] = useState<{ code: string; name: string } | null>(null);
  const [openRows, setOpenRows] = useState<LookupRow[]>([]);
  const [openTruncated, setOpenTruncated] = useState(false);
  const [openFilter, setOpenFilter] = useState<InTransitFilter>('all');

  const loadOpen = useCallback(async () => {
    setOpenLoading(true);
    setOpenError(null);
    try {
      const res = await fetch('/api/mollie/in-transit', { credentials: 'same-origin' });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setOpenAccount({ code: payload.accountCode, name: payload.accountName });
      setOpenRows(payload.rows ?? []);
      setOpenTruncated(Boolean(payload.truncated));
    } catch (error) {
      setOpenRows([]);
      setOpenAccount(null);
      setOpenError(error instanceof Error ? error.message : 'Onbekende fout');
    } finally {
      setOpenLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    void loadOpen();
  }, [isLoggedIn, loadOpen]);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    setSearchEmpty(null);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      const res = await fetch(`/api/mollie/lookup?${params}`, { credentials: 'same-origin' });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const rows = (payload.rows ?? []) as LookupRow[];
      setSearchRows(rows);
      setSearchEmpty(
        rows.length === 0
          ? payload.emptyMessage || emptyLookupMessage(payload.query || query.trim())
          : null
      );
    } catch (error) {
      setSearchRows(null);
      setSearchError(error instanceof Error ? error.message : 'Onbekende fout');
    } finally {
      setSearching(false);
    }
  };

  const filteredOpen = useMemo(() => {
    if (openFilter === 'all') return openRows;
    return openRows.filter((row) => row.matchStatus === openFilter);
  }, [openRows, openFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head>
        <title>Mollie opzoeken - Babette POS</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Mollie opzoeken</h1>
            <p className="text-gray-600 max-w-3xl">
              Zoek een Odoo-ordernummer (bijv. S02118), factuur, klant of Mollie-id (<code>tr_…</code>
              ). Uitbetalingen in Mollie tonen geen ordernummers — deze pagina koppelt de Odoo-boeking
              op 580100 aan de Mollie-betaling en de uitbetaling. Export van settlements blijft op{' '}
              <Link href="/mollie-export" className="text-blue-700 underline">
                Mollie Export
              </Link>
              .
            </p>
          </div>

          <section className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Opzoeken</h2>
            <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-2">
              <label className="sr-only" htmlFor="mollie-lookup-q">
                Zoekterm
              </label>
              <input
                id="mollie-lookup-q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="S02118, tr_…, factuurnummer of klantnaam"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={searching || query.trim().length < 2}
                className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {searching ? 'Zoeken…' : 'Zoeken'}
              </button>
            </form>
            {searchError ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                {searchError}
              </p>
            ) : null}
            {searchEmpty ? <p className="text-sm text-gray-700">{searchEmpty}</p> : null}
            {searchRows && searchRows.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `mollie-opzoeken-${query.trim() || 'zoek'}.csv`,
                        lookupRowsToCsv(searchRows)
                      )
                    }
                    className="px-3 py-1.5 rounded-md text-sm border border-gray-300 hover:bg-gray-50"
                  >
                    CSV downloaden
                  </button>
                </div>
                <ResultsTable rows={searchRows} />
              </div>
            ) : null}
          </section>

          <section className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Open 580100 Mollie in transit</h2>
                <p className="text-sm text-gray-600">
                  {openAccount
                    ? `${openAccount.code} ${openAccount.name} — niet-afgeletterde journaallijnen.`
                    : 'Niet-afgeletterde journaallijnen op Mollie in transit.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCsv('mollie-open-580100.csv', lookupRowsToCsv(filteredOpen))
                }
                disabled={filteredOpen.length === 0}
                className="px-3 py-1.5 rounded-md text-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                CSV downloaden
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'Alles'],
                  ['in_transit', 'Nog in transit'],
                  ['uitbetaald', 'Al uitbetaald in Mollie'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOpenFilter(id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    openFilter === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {openError ? (
              <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                {openError}
              </p>
            ) : null}
            {openTruncated ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                Meer dan 250 open lijnen. Dit overzicht is afgekapt — filter verder in Odoo als je alles
                nodig hebt.
              </p>
            ) : null}
            {openLoading ? <p className="text-sm text-gray-600">Open posten laden…</p> : null}
            {!openLoading && !openError && filteredOpen.length === 0 ? (
              <p className="text-sm text-gray-600">Geen open 580100-lijnen voor deze filter.</p>
            ) : null}
            {filteredOpen.length > 0 ? <ResultsTable rows={filteredOpen} /> : null}
          </section>
        </div>
      </div>
    </>
  );
}
