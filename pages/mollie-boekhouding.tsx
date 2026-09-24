import { Fragment, useMemo, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '@/lib/hooks/useAuth';

type Tab = 'afschrift' | 'commissie' | 'kassasessies' | 'capital';

type BookableRowDetail = { date: string; description: string; amount: number; ref: string };

type SettlementGroupPreview = {
  settlementId: string;
  reference: string;
  /** Aantal kosten-regels (Withheld fees) die hier als nieuwe banklijn aangemaakt worden. */
  rowCount: number;
  /** Som van de kosten-regels (negatief) — dit is geen "moet op 0 sluiten"-saldo. */
  netAmount: number;
  /** Totaal aantal Mollie-rijen die dag (betaling + omzet + kosten), enkel informatief. */
  totalRowCount: number;
  /** Exact wat er per regel geboekt wordt. */
  bookableRowDetails: BookableRowDetail[];
  latestBookingDate: string;
};

type SettlementGroupResult = SettlementGroupPreview & {
  statementId: number;
  statementReused: boolean;
  linesCreated: number;
  linesSkipped: number;
  linesLinked: number;
  isComplete: boolean;
  isValid: boolean;
  balanceEnd: number;
  balanceEndReal: number;
};

type PreviewResponse = {
  dryRun: true;
  journalId: number;
  approach: 'settlements' | 'payments';
  settlementError?: string;
  groups: SettlementGroupPreview[];
  ungroupedRowCount: number;
  note?: string;
  warning?: string;
};

type ConfirmResponse = {
  dryRun: false;
  journalId: number;
  approach: 'settlements' | 'payments';
  results: SettlementGroupResult[];
  ungroupedRowCount: number;
  deselectedGroupCount?: number;
  errors?: string[];
};

type CommissionBill = { id: number; name: string | null; date: string | null; amountTotal: number; ref: string | null };
type CommissionMonth = {
  month: string;
  settlementCostsTotal: number;
  billsTotal: number;
  difference: number;
  matched: boolean;
  bills: CommissionBill[];
};
type CommissionResponse = {
  approach: 'settlements' | 'payments';
  settlementError?: string;
  warning?: string;
  months: CommissionMonth[];
};

type OutstandingReceiptLine = {
  id: number;
  date: string | null;
  name: string | null;
  debit: number;
  credit: number;
  moveId: number | null;
  moveName: string | null;
  partnerName: string | null;
};
type PosSessionGroup = {
  posSessionId: number | null;
  lines: OutstandingReceiptLine[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
};
type PosSessionResponse = { lineCount: number; groups: PosSessionGroup[] };

type MollieLedgerCategory = 'withheld_fees' | 'invoice_compensation' | 'capital_repayment';
type MollieLedgerRow = {
  date: string;
  category: MollieLedgerCategory;
  reference: string;
  description: string;
  amount: number;
  settlementReference: string;
  settlementId: string;
  uniqueId: string;
};
type LedgerCategorySummary = { category: MollieLedgerCategory; count: number; total: number };
type LedgerGroupPreview = { settlementReference: string; rowCount: number; netAmount: number; rows: MollieLedgerRow[] };
type LedgerGroupResult = {
  settlementReference: string;
  statementId: number;
  statementReused: boolean;
  linesCreated: number;
  linesSkipped: number;
  linesLinked: number;
  isComplete: boolean;
  isValid: boolean;
};
type LedgerPreviewResponse = {
  dryRun: true;
  journalId: number;
  summary: LedgerCategorySummary[];
  groups: LedgerGroupPreview[];
  unresolvedRowCount: number;
  unresolvedInvoiceIds?: string[];
};
type LedgerConfirmResponse = {
  dryRun: false;
  journalId: number;
  results: LedgerGroupResult[];
  unresolvedRowCount: number;
  deselectedGroupCount?: number;
  errors?: string[];
};

const ODOO_WEB = 'https://www.babetteconcept.be/web';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toYmd(from), to: toYmd(to) };
}

function formatEuro(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatusBadge({ ok, okLabel, notOkLabel }: { ok: boolean; okLabel: string; notOkLabel: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
        ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
      }`}
    >
      {ok ? okLabel : notOkLabel}
    </span>
  );
}

export default function MollieBoekhoudingPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [tab, setTab] = useState<Tab>('afschrift');

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Head>
        <title>Mollie Boekhouding Verwerken</title>
      </Head>
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mollie Boekhouding Verwerken</h1>
              <p className="text-sm text-gray-600 mt-1 max-w-3xl">
                Automatiseert de Odoo-stappen uit &ldquo;Mollie Settlement Statements in de boekhouding
                verwerken&rdquo;: per settlement een afschrift met begin/eindsaldo 0 (stap 10&ndash;14), de
                maandelijkse commissiecontrole (stap 16) en het opsporen van niet-afgeletterde
                kassasessies op 550001 (stap 17&ndash;19). Elke stap toont eerst een voorbeeld &mdash; er
                wordt niets in Odoo geschreven zonder expliciete bevestiging hieronder.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Van</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium bg-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Tot</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium bg-white"
                />
              </label>
            </div>
          </div>

          <div className="flex gap-2 mb-6 flex-wrap">
            <TabButton active={tab === 'afschrift'} onClick={() => setTab('afschrift')}>
              Afschriften per settlement
            </TabButton>
            <TabButton active={tab === 'commissie'} onClick={() => setTab('commissie')}>
              Maandelijkse commissie
            </TabButton>
            <TabButton active={tab === 'kassasessies'} onClick={() => setTab('kassasessies')}>
              Kassasessies (550001)
            </TabButton>
            <TabButton active={tab === 'capital'} onClick={() => setTab('capital')}>
              Mollie Capital & kosten
            </TabButton>
          </div>

          {authLoading ? (
            <p className="text-center py-12 text-gray-600">Gegevens laden...</p>
          ) : !isLoggedIn ? (
            <p className="text-center py-12 text-gray-600">Log in om deze pagina te gebruiken.</p>
          ) : tab === 'afschrift' ? (
            <StatementTab dateFrom={dateFrom} dateTo={dateTo} />
          ) : tab === 'commissie' ? (
            <CommissionTab dateFrom={dateFrom} dateTo={dateTo} />
          ) : tab === 'kassasessies' ? (
            <PosSessionTab dateFrom={dateFrom} dateTo={dateTo} />
          ) : (
            <CapitalLedgerTab dateFrom={dateFrom} dateTo={dateTo} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium ${
        active ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function StatementTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [journalId, setJournalId] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const parsedJournalId = (() => {
    const match = journalId.trim().match(/\d+/);
    const n = match ? Number.parseInt(match[0], 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  const toggleSelected = (settlementId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(settlementId)) next.delete(settlementId);
      else next.add(settlementId);
      return next;
    });
  };

  const toggleExpanded = (settlementId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(settlementId)) next.delete(settlementId);
      else next.add(settlementId);
      return next;
    });
  };

  const runRequest = async (dryRun: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { from: dateFrom, to: dateTo, dryRun, skipDuplicates };
      if (parsedJournalId != null) body.journalId = parsedJournalId;
      if (!dryRun) body.selectedSettlementIds = [...selected];
      const res = await fetch('/api/mollie/import-odoo-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (dryRun) {
        const previewData = data as PreviewResponse;
        setPreview(previewData);
        setConfirmResult(null);
        setReviewed(false);
        setSelected(new Set(previewData.groups.map((group) => group.settlementId)));
        setExpanded(new Set());
      } else {
        setConfirmResult(data as ConfirmResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Stap 1: haal een voorbeeld op (geen Odoo-writes). Stap 2: controleer de rijen hieronder &mdash; het
        verwachte saldo per settlement moet op &euro;0,00 uitkomen. Stap 3: vink de controle aan en klik
        &ldquo;Bevestigen en uitvoeren in Odoo&rdquo;. Dat maakt de banklijnen, maakt (of hergebruikt) per
        settlement een afschrift met naam = settlement-referentie en begin/eindsaldo 0, en koppelt de
        lijnen &mdash; daarna lees je <code className="bg-gray-100 px-1 rounded">is_complete</code>/
        <code className="bg-gray-100 px-1 rounded">is_valid</code> terug (dat is het groen/rood in Odoo).
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Bankjournaal-id (optioneel)</span>
          <input
            type="text"
            inputMode="numeric"
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
            placeholder="12 (of ODOO_MOLLIE_BANK_JOURNAL_ID in .env)"
            className="border border-gray-300 rounded px-3 py-2 text-gray-900 bg-white w-64"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="rounded border-gray-300"
          />
          Sla bestaande lijnen/afschriften over (aanbevolen)
        </label>
        <button
          type="button"
          onClick={() => runRequest(true)}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Bezig…' : 'Voorbeeld bekijken'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}

      {preview && (
        <div className="space-y-3">
          {preview.note && (
            <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              {preview.note}
            </p>
          )}
          {preview.warning && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              {preview.warning}
            </p>
          )}
          {preview.groups.length === 0 ? (
            <p className="text-sm text-gray-600">Geen settlements met een referentie in deze periode.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(preview.groups.map((g) => g.settlementId)))}
                  className="text-blue-700 hover:underline"
                >
                  Alles selecteren
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-blue-700 hover:underline">
                  Niets selecteren
                </button>
              </div>
              <div className="overflow-auto max-h-[32rem] border border-gray-100 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-gray-600">
                      <th className="px-3 py-2 font-medium w-8"></th>
                      <th className="px-3 py-2 font-medium">Datum</th>
                      <th className="px-3 py-2 font-medium">Settlement-referentie</th>
                      <th className="px-3 py-2 font-medium text-right">Kostenregels (nieuw)</th>
                      <th className="px-3 py-2 font-medium text-right">Totaal kosten</th>
                      <th className="px-3 py-2 font-medium text-right">Alle Mollie-rijen die dag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.groups.map((group) => {
                      const isExpanded = expanded.has(group.settlementId);
                      return (
                        <Fragment key={group.settlementId}>
                          <tr className="border-t border-gray-100 text-gray-800">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selected.has(group.settlementId)}
                                onChange={() => toggleSelected(group.settlementId)}
                                className="rounded border-gray-300"
                                aria-label={`Selecteer settlement ${group.reference}`}
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(group.latestBookingDate)}</td>
                            <td className="px-3 py-2 font-medium">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(group.settlementId)}
                                aria-expanded={isExpanded}
                                className="text-left hover:underline"
                              >
                                {isExpanded ? '▾' : '▸'} {group.reference}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right">{group.rowCount}</td>
                            <td className="px-3 py-2 text-right">{formatEuro(group.netAmount)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{group.totalRowCount}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-t border-gray-100">
                              <td></td>
                              <td colSpan={5} className="px-3 py-2 bg-gray-50">
                                {group.bookableRowDetails.length === 0 ? (
                                  <p className="text-xs text-gray-500 py-1">
                                    Geen kostenregels voor deze settlement — hier wordt niets geboekt.
                                  </p>
                                ) : (
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-gray-500 border-b border-gray-200">
                                        <th className="py-1 pr-3 font-medium">Datum</th>
                                        <th className="py-1 pr-3 font-medium">Omschrijving (payment_ref in Odoo)</th>
                                        <th className="py-1 pr-3 font-medium text-right">Bedrag</th>
                                        <th className="py-1 pr-3 font-medium">Referentie (dedup-sleutel)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.bookableRowDetails.map((row) => (
                                        <tr key={row.ref} className="border-b border-gray-100 last:border-0 text-gray-700">
                                          <td className="py-1 pr-3 whitespace-nowrap">{formatDate(row.date)}</td>
                                          <td className="py-1 pr-3">{row.description}</td>
                                          <td className="py-1 pr-3 text-right whitespace-nowrap">{formatEuro(row.amount)}</td>
                                          <td className="py-1 pr-3 text-gray-400 font-mono">{row.ref}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {preview.ungroupedRowCount > 0 && (
            <p className="text-xs text-gray-500">
              {preview.ungroupedRowCount} rij(en) zonder settlement-referentie &mdash; daarvoor kan geen
              afschrift aangemaakt worden.
            </p>
          )}

          {preview.groups.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 bg-slate-50 space-y-3">
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                Ik heb de {selected.size} geselecteerde settlement(en) hierboven gecontroleerd en ga
                akkoord om deze in Odoo te boeken (banklijnen + afschrift per settlement).
              </label>
              <button
                type="button"
                onClick={() => runRequest(false)}
                disabled={loading || !reviewed || selected.size === 0}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {loading
                  ? 'Bezig…'
                  : selected.size === 0
                    ? 'Selecteer minstens 1 settlement'
                    : `Bevestigen en uitvoeren in Odoo (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmResult && (
        <div className="space-y-3">
          {confirmResult.errors && confirmResult.errors.length > 0 && (
            <ul className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3 space-y-1">
              {confirmResult.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {!!confirmResult.deselectedGroupCount && (
            <p className="text-xs text-gray-500">
              {confirmResult.deselectedGroupCount} settlement(en) waren niet geselecteerd en zijn niet
              aangeraakt.
            </p>
          )}
          <p className="text-xs text-gray-500">
            &ldquo;Rood&rdquo; hieronder is nu normaal: dit boekt enkel de kostenregels, de betalingen die
            al in Odoo stonden worden hier nog niet aan het afschrift gekoppeld.
          </p>
          <div className="overflow-auto max-h-[28rem] border border-gray-100 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-600">
                  <th className="px-3 py-2 font-medium">Settlement</th>
                  <th className="px-3 py-2 font-medium">Afschrift</th>
                  <th className="px-3 py-2 font-medium text-right">Aangemaakt</th>
                  <th className="px-3 py-2 font-medium text-right">Overgeslagen</th>
                  <th className="px-3 py-2 font-medium">Resultaat</th>
                </tr>
              </thead>
              <tbody>
                {confirmResult.results.map((result) => (
                  <tr key={result.settlementId} className="border-t border-gray-100 text-gray-800">
                    <td className="px-3 py-2 font-medium">{result.reference}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`${ODOO_WEB}#id=${result.statementId}&model=account.bank.statement&view_type=form`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        Open in Odoo
                      </a>
                      {result.statementReused ? (
                        <span className="block text-xs text-gray-500">hergebruikt</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">{result.linesCreated}</td>
                    <td className="px-3 py-2 text-right">{result.linesSkipped}</td>
                    <td className="px-3 py-2">
                      <StatusBadge ok={result.isComplete && result.isValid} okLabel="Groen (0,00)" notOkLabel="Nog niet compleet" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CommissionTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CommissionResponse | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      const res = await fetch(`/api/mollie/commission-check?${params}`, { credentials: 'same-origin' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setData(payload as CommissionResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Vergelijkt per maand de som van de Mollie-kostenregels (settlement-data) met de
        Mollie-leveranciersfacturen in Odoo. Puur controle &mdash; er wordt niets geboekt.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? 'Bezig…' : 'Commissie controleren'}
      </button>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}
      {data?.warning && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          {data.warning}
        </p>
      )}

      {data && (
        data.months.length === 0 ? (
          <p className="text-sm text-gray-600">Geen commissiekosten of -facturen in deze periode.</p>
        ) : (
          <div className="overflow-auto max-h-[32rem] border border-gray-100 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-600">
                  <th className="px-3 py-2 font-medium">Maand</th>
                  <th className="px-3 py-2 font-medium text-right">Kosten (settlement)</th>
                  <th className="px-3 py-2 font-medium text-right">Facturen (Odoo)</th>
                  <th className="px-3 py-2 font-medium text-right">Verschil</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Facturen</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((month) => (
                  <tr key={month.month} className="border-t border-gray-100 text-gray-800 align-top">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{month.month}</td>
                    <td className="px-3 py-2 text-right">{formatEuro(month.settlementCostsTotal)}</td>
                    <td className="px-3 py-2 text-right">{formatEuro(month.billsTotal)}</td>
                    <td className="px-3 py-2 text-right">{formatEuro(month.difference)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge ok={month.matched} okLabel="Komt overeen" notOkLabel="Verschil" />
                    </td>
                    <td className="px-3 py-2">
                      {month.bills.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="space-y-0.5">
                          {month.bills.map((bill) => (
                            <li key={bill.id} className="text-xs text-gray-600">
                              {bill.name ?? `#${bill.id}`} · {formatEuro(bill.amountTotal)}
                              {bill.ref ? ` · ${bill.ref}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function PosSessionTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PosSessionResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      const res = await fetch(`/api/accounting/pos-session-check?${params}`, { credentials: 'same-origin' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setData(payload as PosSessionResponse);
      setExpanded(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Groepeert de openstaande regels op rekening 550001 &ldquo;Outstanding Receipts&rdquo; per
        kassasessie (<code className="bg-gray-100 px-1 rounded">pos_session_id</code>). Groen betekent
        debet = credit voor die sessie &mdash; klaar om samen aan te duiden en af te letteren in Odoo.
        Afletteren zelf gebeurt niet hier, enkel het opsporen van sessies die aandacht nodig hebben.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? 'Bezig…' : 'Kassasessies controleren'}
      </button>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}

      {data && (
        data.groups.length === 0 ? (
          <p className="text-sm text-gray-600">Geen openstaande regels op 550001 in deze periode.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">{data.lineCount} openstaande regel(s) gevonden.</p>
            {data.groups.map((group) => {
              const key = String(group.posSessionId ?? 'overig');
              const open = expanded.has(key);
              return (
                <section key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-expanded={open}
                    className="w-full flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                  >
                    <span className="font-medium text-gray-900">
                      {group.posSessionId != null ? `Kassasessie ${group.posSessionId}` : 'Overig (geen sessie-id)'}
                    </span>
                    <span className="flex items-center gap-3 text-sm text-gray-600">
                      <span>{group.lines.length} regel(s)</span>
                      <span>
                        {formatEuro(group.totalDebit)} / {formatEuro(group.totalCredit)}
                      </span>
                      <StatusBadge ok={group.balanced} okLabel="Klaar om af te letteren" notOkLabel="Nakijken" />
                    </span>
                  </button>
                  {open && (
                    <div className="overflow-auto max-h-72">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white sticky top-0">
                          <tr className="text-left text-gray-600 border-b border-gray-100">
                            <th className="px-3 py-2 font-medium">Datum</th>
                            <th className="px-3 py-2 font-medium">Omschrijving</th>
                            <th className="px-3 py-2 font-medium">Relatie</th>
                            <th className="px-3 py-2 font-medium text-right">Debet</th>
                            <th className="px-3 py-2 font-medium text-right">Credit</th>
                            <th className="px-3 py-2 font-medium">Boeking</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line) => (
                            <tr key={line.id} className="border-t border-gray-100 text-gray-800">
                              <td className="px-3 py-2 whitespace-nowrap">{formatDate(line.date)}</td>
                              <td className="px-3 py-2">{line.name ?? '—'}</td>
                              <td className="px-3 py-2">{line.partnerName ?? '—'}</td>
                              <td className="px-3 py-2 text-right">{formatEuro(line.debit)}</td>
                              <td className="px-3 py-2 text-right">{formatEuro(line.credit)}</td>
                              <td className="px-3 py-2">
                                {line.moveId ? (
                                  <a
                                    href={`${ODOO_WEB}#id=${line.moveId}&model=account.move&view_type=form`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-700 hover:underline"
                                  >
                                    {line.moveName ?? `#${line.moveId}`}
                                  </a>
                                ) : (
                                  line.moveName ?? '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function ledgerCategoryLabel(category: MollieLedgerCategory): string {
  switch (category) {
    case 'withheld_fees':
      return 'Withheld fees (Mollie)';
    case 'invoice_compensation':
      return 'Invoice Compensation';
    case 'capital_repayment':
      return 'Terugbetaling Mollie Capital';
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function CapitalLedgerTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [journalId, setJournalId] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LedgerPreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<LedgerConfirmResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const parsedJournalId = (() => {
    const match = journalId.trim().match(/\d+/);
    const n = match ? Number.parseInt(match[0], 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelected = (settlementReference: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(settlementReference)) next.delete(settlementReference);
      else next.add(settlementReference);
      return next;
    });
  };

  const selectedRowCount = (preview?.groups ?? [])
    .filter((group) => selected.has(group.settlementReference))
    .reduce((sum, group) => sum + group.rowCount, 0);

  const runRequest = async (dryRun: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { from: dateFrom, to: dateTo, dryRun, skipDuplicates };
      if (parsedJournalId != null) body.journalId = parsedJournalId;
      if (!dryRun) body.selectedSettlementReferences = [...selected];
      const res = await fetch('/api/mollie/import-odoo-capital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (dryRun) {
        const previewData = data as LedgerPreviewResponse;
        setPreview(previewData);
        setConfirmResult(null);
        setReviewed(false);
        setExpanded(new Set());
        setSelected(new Set(previewData.groups.map((group) => group.settlementReference)));
      } else {
        setConfirmResult(data as LedgerConfirmResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Vervangt de handmatige <code className="bg-gray-100 px-1 rounded">mollie_capital_lines.xlsx</code>
        {' '}+ Odoo-importwizard: haalt <strong>Withheld fees</strong> (Settlements API),{' '}
        <strong>Invoice Compensation</strong> en <strong>Terugbetaling Mollie Capital</strong> (Balances
        API — vereist <code className="bg-gray-100 px-1 rounded">balances.read</code> op{' '}
        <code className="bg-gray-100 px-1 rounded">MOLLIE_ACCESS_TOKEN</code>) op, en zet ze als banklijnen
        in het afschrift van de bijhorende settlementdag. Eerst voorbeeld bekijken, dan pas bevestigen.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Bankjournaal-id (optioneel)</span>
          <input
            type="text"
            inputMode="numeric"
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
            placeholder="12 (of ODOO_MOLLIE_BANK_JOURNAL_ID in .env)"
            className="border border-gray-300 rounded px-3 py-2 text-gray-900 bg-white w-64"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="rounded border-gray-300"
          />
          Sla bestaande lijnen/afschriften over (aanbevolen)
        </label>
        <button
          type="button"
          onClick={() => runRequest(true)}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Bezig…' : 'Voorbeeld bekijken'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
      )}

      {preview && (
        <div className="space-y-4">
          {preview.summary.length === 0 ? (
            <p className="text-sm text-gray-600">Geen Withheld fees, Invoice Compensation of Capital-aflossingen in deze periode.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {preview.summary.map((row) => (
                <div key={row.category} className="rounded-xl border border-gray-200 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {ledgerCategoryLabel(row.category)}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">{formatEuro(row.total)}</p>
                  <p className="text-xs text-gray-500">{row.count} regel(s)</p>
                </div>
              ))}
            </div>
          )}

          {preview.unresolvedRowCount > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              {preview.unresolvedRowCount} regel(s) horen nog bij geen afgesloten settlement (te recent) —
              die worden nu niet meegenomen. Probeer een periode die eerder afsluit.
            </p>
          )}
          {preview.unresolvedInvoiceIds && preview.unresolvedInvoiceIds.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Kon de MOL-NL-referentie niet ophalen voor {preview.unresolvedInvoiceIds.length} Mollie-factuur-id(s);
              die rijen tonen het ruwe factuur-id in plaats van de referentie.
            </p>
          )}

          {preview.groups.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(preview.groups.map((g) => g.settlementReference)))}
                  className="text-blue-700 hover:underline"
                >
                  Alles selecteren
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="text-blue-700 hover:underline">
                  Niets selecteren
                </button>
              </div>
              {preview.groups.map((group) => {
                const key = group.settlementReference;
                const open = expanded.has(key);
                return (
                  <section key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="w-full flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100">
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggleSelected(key)}
                          className="rounded border-gray-300"
                          aria-label={`Selecteer settlement ${key}`}
                        />
                        <span className="font-medium text-gray-900">{group.settlementReference}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={open}
                        className="text-sm text-gray-600 hover:underline"
                      >
                        {group.rowCount} regel(s) · {formatEuro(group.netAmount)}
                      </button>
                    </div>
                    {open && (
                      <div className="overflow-auto max-h-72">
                        <table className="min-w-full text-sm">
                          <thead className="bg-white sticky top-0">
                            <tr className="text-left text-gray-600 border-b border-gray-100">
                              <th className="px-3 py-2 font-medium">Datum</th>
                              <th className="px-3 py-2 font-medium">Categorie</th>
                              <th className="px-3 py-2 font-medium">Omschrijving (payment_ref in Odoo)</th>
                              <th className="px-3 py-2 font-medium text-right">Bedrag</th>
                              <th className="px-3 py-2 font-medium">Referentie (dedup-sleutel)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row) => (
                              <tr key={row.uniqueId} className="border-t border-gray-100 text-gray-800">
                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{ledgerCategoryLabel(row.category)}</td>
                                <td className="px-3 py-2">{row.description}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">{formatEuro(row.amount)}</td>
                                <td className="px-3 py-2 text-gray-400 font-mono text-xs">{row.uniqueId}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {preview.groups.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 bg-slate-50 space-y-3">
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                Ik heb de {selectedRowCount} regel(s) van de {selected.size} geselecteerde afschrift(en)
                hierboven gecontroleerd en ga akkoord om deze in Odoo te boeken.
              </label>
              <button
                type="button"
                onClick={() => runRequest(false)}
                disabled={loading || !reviewed || selected.size === 0}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {loading
                  ? 'Bezig…'
                  : selected.size === 0
                    ? 'Selecteer minstens 1 afschrift'
                    : `Bevestigen en uitvoeren in Odoo (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmResult && (
        <div className="space-y-3">
          {confirmResult.errors && confirmResult.errors.length > 0 && (
            <ul className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3 space-y-1">
              {confirmResult.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {!!confirmResult.deselectedGroupCount && (
            <p className="text-xs text-gray-500">
              {confirmResult.deselectedGroupCount} afschrift(en) waren niet geselecteerd en zijn niet
              aangeraakt.
            </p>
          )}
          <p className="text-xs text-gray-500">
            &ldquo;Rood&rdquo; hieronder is nu normaal: dit boekt enkel deze regels, de betalingen die
            al in Odoo stonden worden hier nog niet aan het afschrift gekoppeld.
          </p>
          <div className="overflow-auto max-h-[28rem] border border-gray-100 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-600">
                  <th className="px-3 py-2 font-medium">Afschrift</th>
                  <th className="px-3 py-2 font-medium text-right">Aangemaakt</th>
                  <th className="px-3 py-2 font-medium text-right">Overgeslagen</th>
                  <th className="px-3 py-2 font-medium">Resultaat</th>
                </tr>
              </thead>
              <tbody>
                {confirmResult.results.map((result) => (
                  <tr key={result.settlementReference} className="border-t border-gray-100 text-gray-800">
                    <td className="px-3 py-2 font-medium">
                      <a
                        href={`${ODOO_WEB}#id=${result.statementId}&model=account.bank.statement&view_type=form`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        {result.settlementReference}
                      </a>
                      {result.statementReused ? (
                        <span className="block text-xs text-gray-500">hergebruikt</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">{result.linesCreated}</td>
                    <td className="px-3 py-2 text-right">{result.linesSkipped}</td>
                    <td className="px-3 py-2">
                      <StatusBadge ok={result.isComplete && result.isValid} okLabel="Groen (0,00)" notOkLabel="Nog niet compleet" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
