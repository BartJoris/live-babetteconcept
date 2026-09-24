import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
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
import {
  actionCategoryLabel,
  formatDurationMinutes,
  type AccountingEntry,
  type AccountingInsights,
  type ActionCategory,
  type GroupBy,
  type ProcessPlaybookItem,
} from '@/lib/accounting/insights';
import {
  ACCOUNTING_CHECKLIST,
  AUTOMATION_ROADMAP,
  allProcessGuides,
  automationStatusLabel,
  cadenceLabel,
  type AutomationStatus,
  type ProcessGuide,
} from '@/lib/accounting/processGuide';
import {
  documentSourceLabel,
  matchesQuery,
  missingSupportKindLabel,
  missingSupportRowTypeLabel,
  peppolLinkStatusLabel,
  peppolMoveStateLabel,
  peppolNeedsAttention,
  peppolOriginLabel,
  type AccountingDocuments,
  type InvoiceWithDocument,
  type MissingSupportRow,
  type PeppolInboundRow,
  type PeppolLinkStatus,
  type UploadedDocument,
} from '@/lib/accounting/documents';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type PageTab = 'overview' | 'processes' | 'documents';
type DocumentsSubTab = 'uploaded' | 'linked' | 'missing' | 'peppol';
type PeppolStatusFilter = 'all' | 'linked' | 'attention';

const CATEGORY_COLORS: Record<ActionCategory, string> = {
  in_invoice: 'rgba(37, 99, 235, 0.8)',
  in_refund: 'rgba(14, 165, 233, 0.8)',
  out_invoice: 'rgba(22, 163, 74, 0.8)',
  out_refund: 'rgba(132, 204, 22, 0.8)',
  payment_inbound: 'rgba(16, 185, 129, 0.8)',
  payment_outbound: 'rgba(245, 158, 11, 0.8)',
  bank_statement: 'rgba(99, 102, 241, 0.8)',
  vat_entry: 'rgba(168, 85, 247, 0.8)',
  entry: 'rgba(100, 116, 139, 0.8)',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentQuarterRange(now = new Date()): { from: string; to: string } {
  const quarter = Math.floor(now.getMonth() / 3);
  const from = new Date(now.getFullYear(), quarter * 3, 1);
  const to = new Date(now.getFullYear(), quarter * 3 + 3, 0);
  return { from: toYmd(from), to: toYmd(to) };
}

function formatEuro(amount: number): string {
  return amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function stateLabel(state: string): string {
  switch (state) {
    case 'draft':
      return 'Concept';
    case 'posted':
      return 'Geboekt';
    case 'cancel':
      return 'Geannuleerd';
    case 'paid':
      return 'Betaald';
    case 'in_process':
      return 'In verwerking';
    case 'reconciled':
      return 'Afgestemd';
    case 'open':
      return 'Open';
    default:
      return state || '—';
  }
}

function sourceLabel(source: AccountingEntry['source']): string {
  switch (source) {
    case 'account.move':
      return 'Boeking';
    case 'account.payment':
      return 'Betaling';
    case 'account.bank.statement.line':
      return 'Bankregel';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export default function BoekhoudingInzichtenPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const initialRange = useMemo(() => currentQuarterRange(), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [tab, setTab] = useState<PageTab>('overview');
  const [documentsSubTab, setDocumentsSubTab] = useState<DocumentsSubTab>('uploaded');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountingInsights | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [documents, setDocuments] = useState<AccountingDocuments | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [documentsQuery, setDocumentsQuery] = useState('');
  const hasAutoFetched = useRef(false);
  const documentsFetchedFor = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/accounting-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ dateFrom, dateTo, groupBy }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setData(payload as AccountingInsights);
      const firstKey = (payload as AccountingInsights).periods[0]?.key;
      setExpanded(firstKey ? new Set([firstKey]) : new Set());
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy]);

  const fetchDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const res = await fetch('/api/accounting-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setDocuments(payload as AccountingDocuments);
    } catch (err) {
      setDocuments(null);
      setDocumentsError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      documentsFetchedFor.current = `${dateFrom}:${dateTo}`;
      setDocumentsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!isLoggedIn || authLoading || hasAutoFetched.current) return;
    hasAutoFetched.current = true;
    void fetchData();
  }, [isLoggedIn, authLoading, fetchData]);

  useEffect(() => {
    if (!isLoggedIn || authLoading || tab !== 'documents') return;
    const key = `${dateFrom}:${dateTo}`;
    if (documentsFetchedFor.current === key) return;
    void fetchDocuments();
  }, [isLoggedIn, authLoading, tab, dateFrom, dateTo, fetchDocuments]);

  const togglePeriod = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Boekhouding Inzichten</h1>
            <p className="text-center py-12 text-gray-600">Log in om boekhoudinzichten te bekijken.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Head>
        <title>Boekhouding Inzichten</title>
      </Head>
      <div className="p-4">
        <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tab === 'documents') {
                documentsFetchedFor.current = null;
                void fetchDocuments();
                return;
              }
              void fetchData();
            }}
            className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-6"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Boekhouding Inzichten</h1>
              <p className="text-sm text-gray-600 mt-1">
                Handelingen van de boekhoudpartner (alles behalve gebruiker Margot), gegroepeerd op boekingsdatum.
                Onder Gids staan de stappen om dit zelf te doen. Onder Documenten: uploads, facturen met bijlage, en
                transacties waar een factuur of PDF ontbreekt.
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
              <div className="flex rounded-xl overflow-hidden border border-gray-300">
                <button
                  type="button"
                  onClick={() => setGroupBy('month')}
                  className={`px-3 py-2 text-sm font-medium ${
                    groupBy === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
                  }`}
                >
                  Maand
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBy('quarter')}
                  className={`px-3 py-2 text-sm font-medium ${
                    groupBy === 'quarter' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'
                  }`}
                >
                  Kwartaal
                </button>
              </div>
              <button
                type="submit"
                disabled={tab === 'documents' ? documentsLoading : loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow disabled:opacity-50"
              >
                {(tab === 'documents' ? documentsLoading : loading) ? 'Laden...' : 'Laden'}
              </button>
            </div>
          </form>

          {tab === 'documents'
            ? documentsError && (
                <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  {documentsError}
                </p>
              )
            : error && (
                <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

          {tab === 'documents'
            ? documents?.warnings && documents.warnings.length > 0 && (
                <ul className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1">
                  {documents.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )
            : data?.warnings && data.warnings.length > 0 && (
                <ul className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1">
                  {data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}

          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                tab === 'overview' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Overzicht
            </button>
            <button
              type="button"
              onClick={() => setTab('processes')}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                tab === 'processes' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Gids & automatisering
            </button>
            <button
              type="button"
              onClick={() => setTab('documents')}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                tab === 'documents' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Documenten
            </button>
          </div>

          <MainTabPanel
            tab={tab}
            data={data}
            loading={loading}
            error={error}
            expanded={expanded}
            onToggle={togglePeriod}
            documents={documents}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            documentsSubTab={documentsSubTab}
            onDocumentsSubTab={setDocumentsSubTab}
            documentsQuery={documentsQuery}
            onDocumentsQuery={setDocumentsQuery}
          />
        </div>
      </div>
    </div>
  );
}

function MainTabPanel({
  tab,
  data,
  loading,
  error,
  expanded,
  onToggle,
  documents,
  documentsLoading,
  documentsError,
  documentsSubTab,
  onDocumentsSubTab,
  documentsQuery,
  onDocumentsQuery,
}: {
  tab: PageTab;
  data: AccountingInsights | null;
  loading: boolean;
  error: string | null;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  documents: AccountingDocuments | null;
  documentsLoading: boolean;
  documentsError: string | null;
  documentsSubTab: DocumentsSubTab;
  onDocumentsSubTab: (tab: DocumentsSubTab) => void;
  documentsQuery: string;
  onDocumentsQuery: (value: string) => void;
}) {
  switch (tab) {
    case 'overview':
      if (data) return <OverviewTab data={data} expanded={expanded} onToggle={onToggle} />;
      if (loading) return <p className="text-center py-12 text-gray-600">Gegevens laden...</p>;
      if (!error) {
        return <p className="text-center py-12 text-gray-600">Kies een periode en klik op Laden.</p>;
      }
      return null;
    case 'processes':
      return <GuideTab data={data} />;
    case 'documents':
      return (
        <DocumentsTab
          data={documents}
          loading={documentsLoading}
          error={documentsError}
          subTab={documentsSubTab}
          onSubTab={onDocumentsSubTab}
          query={documentsQuery}
          onQuery={onDocumentsQuery}
        />
      );
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function documentsSubTabCount(subTab: DocumentsSubTab, data: AccountingDocuments): number {
  switch (subTab) {
    case 'uploaded':
      return data.uploaded.length;
    case 'linked':
      return data.invoicesWithDocument.length;
    case 'missing':
      return data.missingSupport.length;
    case 'peppol':
      return data.peppolInbound.length;
    default: {
      const _exhaustive: never = subTab;
      return _exhaustive;
    }
  }
}

function documentsSubTabLabel(subTab: DocumentsSubTab, data: AccountingDocuments | null): string {
  const suffix = data == null ? '' : ` (${documentsSubTabCount(subTab, data)})`;
  switch (subTab) {
    case 'uploaded':
      return `Geüploade documenten${suffix}`;
    case 'linked':
      return `Facturen met document${suffix}`;
    case 'missing':
      return `Zonder factuur/document${suffix}`;
    case 'peppol':
      return `Peppol inkomend${suffix}`;
    default: {
      const _exhaustive: never = subTab;
      return _exhaustive;
    }
  }
}

function DocumentsTab({
  data,
  loading,
  error,
  subTab,
  onSubTab,
  query,
  onQuery,
}: {
  data: AccountingDocuments | null;
  loading: boolean;
  error: string | null;
  subTab: DocumentsSubTab;
  onSubTab: (tab: DocumentsSubTab) => void;
  query: string;
  onQuery: (value: string) => void;
}) {
  const [peppolFilter, setPeppolFilter] = useState<PeppolStatusFilter>('all');

  const uploaded = useMemo(
    () =>
      (data?.uploaded ?? []).filter((row) =>
        matchesQuery(
          [
            row.name,
            row.partnerName,
            row.invoiceName,
            row.folderName,
            row.mimetype,
            row.isPeppol ? 'Peppol' : null,
            row.peppolLinkStatus ? peppolLinkStatusLabel(row.peppolLinkStatus) : null,
          ],
          query
        )
      ),
    [data, query]
  );
  const linked = useMemo(
    () =>
      (data?.invoicesWithDocument ?? []).filter((row) =>
        matchesQuery(
          [
            row.name,
            row.partnerName,
            row.ref,
            row.documentName,
            row.isPeppolInbound ? 'Peppol' : null,
            row.peppolLinkStatus ? peppolLinkStatusLabel(row.peppolLinkStatus) : null,
          ],
          query
        )
      ),
    [data, query]
  );
  const missing = useMemo(
    () =>
      (data?.missingSupport ?? []).filter((row) =>
        matchesQuery(
          [
            row.name,
            row.partnerName,
            row.ref,
            row.journalName,
            missingSupportKindLabel(row.kind),
            missingSupportRowTypeLabel(row.rowType),
            row.isPeppolInbound ? 'Peppol' : null,
          ],
          query
        )
      ),
    [data, query]
  );

  const peppol = useMemo(
    () =>
      (data?.peppolInbound ?? []).filter((row) => {
        if (peppolFilter === 'linked' && row.linkStatus !== 'linked') return false;
        if (peppolFilter === 'attention' && !peppolNeedsAttention(row.linkStatus)) return false;
        return matchesQuery(
          [
            row.fileName,
            row.invoiceName,
            row.invoiceRef,
            row.partnerName,
            peppolLinkStatusLabel(row.linkStatus),
            peppolOriginLabel(row.origin),
          ],
          query
        );
      }),
    [data, query, peppolFilter]
  );

  const peppolCounts = useMemo(() => {
    const rows = data?.peppolInbound ?? [];
    const attention = rows.filter((row) => peppolNeedsAttention(row.linkStatus)).length;
    return {
      all: rows.length,
      linked: rows.length - attention,
      attention,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Controleer de stukken bij de boekhouding: wat is geüpload, welke facturen een PDF/bijlage hebben, en
        waar een factuur of document nog ontbreekt. Onder Peppol inkomend: XML’s die via Peppol binnenkwamen
        (MAIL_*.xml) en of ze juist aan de aankoopfactuur (UBL) gekoppeld zijn.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {(['uploaded', 'linked', 'missing', 'peppol'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSubTab(key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium ${
                subTab === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {documentsSubTabLabel(key, data)}
            </button>
          ))}
        </div>
        <label className="flex-1 min-w-[12rem]">
          <span className="sr-only">Zoeken</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Zoek op naam, relatie, referentie…"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-gray-900 bg-white"
          />
        </label>
      </div>

      {subTab === 'peppol' && data ? (
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'linked', 'attention'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeppolFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                peppolFilter === key ? 'bg-violet-700 text-white' : 'bg-violet-50 text-violet-900 hover:bg-violet-100'
              }`}
            >
              {peppolFilterLabel(key, peppolCounts)}
            </button>
          ))}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-center py-12 text-gray-600">Documenten laden...</p>
      ) : data ? (
        <DocumentsSubTabPanel
          subTab={subTab}
          uploaded={uploaded}
          linked={linked}
          missing={missing}
          peppol={peppol}
          peppolFilter={peppolFilter}
          loading={loading}
          query={query}
        />
      ) : (
        !error && <p className="text-center py-12 text-gray-600">Kies een periode en klik op Laden.</p>
      )}
    </div>
  );
}

function peppolFilterLabel(
  filter: PeppolStatusFilter,
  counts: { all: number; linked: number; attention: number }
): string {
  switch (filter) {
    case 'all':
      return `Alles (${counts.all})`;
    case 'linked':
      return `Juist gekoppeld (${counts.linked})`;
    case 'attention':
      return `Aandacht nodig (${counts.attention})`;
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function peppolStatusBadgeClass(status: PeppolLinkStatus): string {
  switch (status) {
    case 'linked':
      return 'bg-emerald-50 text-emerald-800';
    case 'unlinked':
      return 'bg-amber-50 text-amber-900';
    case 'invoice_without_file':
      return 'bg-amber-50 text-amber-900';
    case 'mismatch':
      return 'bg-red-50 text-red-800';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function PeppolStatusBadge({ status }: { status: PeppolLinkStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${peppolStatusBadgeClass(status)}`}>
      Peppol · {peppolLinkStatusLabel(status)}
    </span>
  );
}

function peppolEmptyMessage(query: string, filter: PeppolStatusFilter): string {
  if (query.trim()) return 'Geen Peppol-stukken voor deze zoekterm.';
  switch (filter) {
    case 'all':
      return 'Geen inkomende Peppol-bestanden of -facturen in deze periode.';
    case 'linked':
      return 'Geen juist gekoppelde Peppol-bestanden in deze periode.';
    case 'attention':
      return 'Geen Peppol-bestanden met een koppelprobleem in deze periode.';
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function DocumentsSubTabPanel({
  subTab,
  uploaded,
  linked,
  missing,
  peppol,
  peppolFilter,
  loading,
  query,
}: {
  subTab: DocumentsSubTab;
  uploaded: UploadedDocument[];
  linked: InvoiceWithDocument[];
  missing: MissingSupportRow[];
  peppol: PeppolInboundRow[];
  peppolFilter: PeppolStatusFilter;
  loading: boolean;
  query: string;
}) {
  const hint = loading ? (
    <p className="text-xs text-gray-500">Vernieuwen...</p>
  ) : null;

  switch (subTab) {
    case 'uploaded':
      return (
        <div className="space-y-2">
          {hint}
          {uploaded.length === 0 ? (
            <p className="text-center py-8 text-gray-600">
              {query.trim()
                ? 'Geen documenten voor deze zoekterm.'
                : 'Geen geüploade documenten in deze periode.'}
            </p>
          ) : (
            <UploadedDocumentsTable rows={uploaded} />
          )}
        </div>
      );
    case 'linked':
      return (
        <div className="space-y-2">
          {hint}
          {linked.length === 0 ? (
            <p className="text-center py-8 text-gray-600">
              {query.trim()
                ? 'Geen facturen voor deze zoekterm.'
                : 'Geen facturen met een gekoppeld document in deze periode.'}
            </p>
          ) : (
            <InvoicesWithDocumentTable rows={linked} />
          )}
        </div>
      );
    case 'missing':
      return (
        <div className="space-y-2">
          {hint}
          {missing.length === 0 ? (
            <p className="text-center py-8 text-gray-600">
              {query.trim()
                ? 'Geen transacties voor deze zoekterm.'
                : 'Geen bankregels zonder factuur en geen aankoopfacturen zonder document in deze periode.'}
            </p>
          ) : (
            <MissingSupportTable rows={missing} />
          )}
        </div>
      );
    case 'peppol':
      return (
        <div className="space-y-2">
          {hint}
          <p className="text-xs text-gray-500">
            Inkomend via Peppol: het MAIL_*.xml-bestand is het ontvangen UBL-bericht. Juist gekoppeld betekent dat er
            een aankoopfactuur met dezelfde referentie is én dat de UBL-XML op die factuur staat.
          </p>
          {peppol.length === 0 ? (
            <p className="text-center py-8 text-gray-600">{peppolEmptyMessage(query, peppolFilter)}</p>
          ) : (
            <PeppolInboundTable rows={peppol} />
          )}
        </div>
      );
    default: {
      const _exhaustive: never = subTab;
      return _exhaustive;
    }
  }
}

function UploadedDocumentsTable({ rows }: { rows: UploadedDocument[] }) {
  return (
    <div className="overflow-auto max-h-[36rem] border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-medium">Geüpload</th>
            <th className="px-3 py-2 font-medium">Document</th>
            <th className="px-3 py-2 font-medium">Bron</th>
            <th className="px-3 py-2 font-medium">Relatie</th>
            <th className="px-3 py-2 font-medium">Gekoppelde factuur</th>
            <th className="px-3 py-2 font-medium">Map</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Peppol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.source}-${row.id}`} className="border-t border-gray-100 text-gray-800">
              <td className="px-3 py-2 whitespace-nowrap">{row.createDate ? formatDate(row.createDate) : '—'}</td>
              <td className="px-3 py-2">
                <a href={row.odooHref} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {row.name}
                </a>
                {row.mimetype ? <p className="text-xs text-gray-500">{row.mimetype}</p> : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{documentSourceLabel(row.source)}</td>
              <td className="px-3 py-2">{row.partnerName ?? '—'}</td>
              <td className="px-3 py-2">
                {row.invoiceName ?? '—'}
                {row.invoiceDate ? (
                  <span className="block text-xs text-gray-500">{formatDate(row.invoiceDate)}</span>
                ) : null}
              </td>
              <td className="px-3 py-2">{row.folderName ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.linked ? (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">
                    Gekoppeld
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 text-xs font-medium">
                    Niet gekoppeld
                  </span>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.isPeppol && row.peppolLinkStatus ? (
                  <PeppolStatusBadge status={row.peppolLinkStatus} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesWithDocumentTable({ rows }: { rows: InvoiceWithDocument[] }) {
  return (
    <div className="overflow-auto max-h-[36rem] border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-medium">Datum</th>
            <th className="px-3 py-2 font-medium">Factuur</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium text-right">Bedrag</th>
            <th className="px-3 py-2 font-medium">Relatie</th>
            <th className="px-3 py-2 font-medium">Document</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Peppol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 text-gray-800">
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
              <td className="px-3 py-2">
                <a href={row.odooHref} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {row.name ?? `Factuur ${row.id}`}
                </a>
                {row.ref ? <p className="text-xs text-gray-500">{row.ref}</p> : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{actionCategoryLabel(row.category)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-medium">{formatEuro(row.amount)}</td>
              <td className="px-3 py-2">{row.partnerName ?? '—'}</td>
              <td className="px-3 py-2">
                {row.documentName ?? 'Bijlage'}
                <span className="block text-xs text-gray-500">
                  {row.documentCount} document{row.documentCount === 1 ? '' : 'en'}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{stateLabel(row.state)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.isPeppolInbound && row.peppolLinkStatus ? (
                  <PeppolStatusBadge status={row.peppolLinkStatus} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MissingSupportTable({ rows }: { rows: MissingSupportRow[] }) {
  return (
    <div className="overflow-auto max-h-[36rem] border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-medium">Datum</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Omschrijving</th>
            <th className="px-3 py-2 font-medium text-right">Bedrag</th>
            <th className="px-3 py-2 font-medium">Relatie</th>
            <th className="px-3 py-2 font-medium">Journaal</th>
            <th className="px-3 py-2 font-medium">Ontbreekt</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Peppol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.rowType}-${row.id}`} className="border-t border-gray-100 text-gray-800">
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{missingSupportRowTypeLabel(row.rowType)}</td>
              <td className="px-3 py-2">
                <a href={row.odooHref} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {row.name ?? row.ref ?? `#${row.id}`}
                </a>
                {row.ref && row.ref !== row.name ? (
                  <p className="text-xs text-gray-500">{row.ref}</p>
                ) : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-medium">{formatEuro(row.amount)}</td>
              <td className="px-3 py-2">{row.partnerName ?? '—'}</td>
              <td className="px-3 py-2">{row.journalName ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 text-xs font-medium">
                  {missingSupportKindLabel(row.kind)}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{stateLabel(row.state)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.isPeppolInbound ? (
                  <span className="px-2 py-0.5 rounded-lg bg-violet-50 text-violet-800 text-xs font-medium">
                    Peppol
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeppolInboundTable({ rows }: { rows: PeppolInboundRow[] }) {
  return (
    <div className="overflow-auto max-h-[36rem] border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-medium">Datum</th>
            <th className="px-3 py-2 font-medium">Bestand</th>
            <th className="px-3 py-2 font-medium">Herkomst</th>
            <th className="px-3 py-2 font-medium">Factuur</th>
            <th className="px-3 py-2 font-medium">Relatie</th>
            <th className="px-3 py-2 font-medium">Peppol-status</th>
            <th className="px-3 py-2 font-medium">Koppeling</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 text-gray-800">
              <td className="px-3 py-2 whitespace-nowrap">{row.date ? formatDate(row.date) : '—'}</td>
              <td className="px-3 py-2">
                {row.fileHref && row.fileName ? (
                  <a href={row.fileHref} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                    {row.fileName}
                  </a>
                ) : (
                  row.fileName ?? '—'
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{peppolOriginLabel(row.origin)}</td>
              <td className="px-3 py-2">
                {row.invoiceHref && (row.invoiceName || row.invoiceRef) ? (
                  <a href={row.invoiceHref} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                    {row.invoiceName ?? row.invoiceRef}
                  </a>
                ) : (
                  row.invoiceRef ?? '—'
                )}
                {row.invoiceRef && row.invoiceName ? (
                  <span className="block text-xs text-gray-500">{row.invoiceRef}</span>
                ) : null}
              </td>
              <td className="px-3 py-2">{row.partnerName ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {peppolMoveStateLabel(row.peppolState, row.peppolStateRaw)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${peppolStatusBadgeClass(row.linkStatus)}`}>
                  {peppolLinkStatusLabel(row.linkStatus)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewTab({
  data,
  expanded,
  onToggle,
}: {
  data: AccountingInsights;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard title="Totaal handelingen" value={String(data.totalCount)} hint={formatEuro(data.totalAmount)} />
        <SummaryCard
          title="Geschatte werktijd"
          value={formatDurationMinutes(data.effort.estimatedMinutes)}
          hint={`${data.effort.sessionCount} werksessie${data.effort.sessionCount === 1 ? '' : 's'}`}
        />
        {data.overall.slice(0, 6).map((row) => (
          <SummaryCard
            key={row.category}
            title={row.label}
            value={String(row.count)}
            hint={`${formatEuro(row.amount)} · ${formatDurationMinutes(row.estimatedMinutes)}`}
            color={CATEGORY_COLORS[row.category]}
          />
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Tijd per gebruiker</h2>
        {data.effort.users.length === 0 ? (
          <p className="text-sm text-gray-500">Geen partner-activiteit in deze periode.</p>
        ) : (
          <div className="space-y-2">
            {data.effort.users.map((user) => (
              <div
                key={`${user.userId ?? user.userName}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{user.userName}</p>
                  <p className="text-xs text-gray-500">
                    {user.actionCount} handelingen · {user.sessionCount} sessie{user.sessionCount === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{formatDurationMinutes(user.estimatedMinutes)}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Schatting: opeenvolgende handelingen van dezelfde gebruiker binnen {data.effort.gapMinutes} minuten tellen
          als één werksessie. Een losse handeling telt als {data.effort.defaultActionMinutes} minuten. Dit is geen
          stopwatch — Odoo registreert geen exacte werktijd.
        </p>
        {data.houseUsers.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            Uitgesloten huisgebruiker: {data.houseUsers.map((u) => u.name).join(', ')}.
          </p>
        )}
      </div>

      {data.periods.length === 0 ? (
        <p className="text-center py-8 text-gray-600">Geen boekhoudhandelingen van de partner in deze periode.</p>
      ) : (
        <div className="space-y-3">
          {data.periods.map((period) => {
            const open = expanded.has(period.key);
            return (
              <section key={period.key} className="border border-gray-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggle(period.key)}
                  aria-expanded={open}
                  className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <span className="font-semibold text-gray-900">{period.label}</span>
                  <span className="text-sm text-gray-600">
                    {period.totalCount} handelingen · {formatEuro(period.totalAmount)} ·{' '}
                    {formatDurationMinutes(period.estimatedMinutes)}
                  </span>
                </button>
                {open && (
                  <div className="p-4 space-y-4">
                    <PeriodChart summary={period.summary} />
                    <EntriesTable entries={period.entries} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuideTab({ data }: { data: AccountingInsights | null }) {
  const statsByCategory = new Map(
    (data?.processes ?? []).map((row) => [row.category, row] as const)
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Zo neem je de boekhouding over</h2>
        <p className="text-sm text-gray-600 mb-4">
          De partner doet in Odoo vooral facturen, betalingen, bankreconciliatie en btw. Hieronder: wanneer,
          welke klikken in Odoo, en of deze app het al (of binnenkort) kan. Bank via Mollie kan je vandaag al
          hier doen; aankoopfacturen uit PDF is de grootste volgende automatisering.
        </p>
        <ol className="space-y-2">
          {ACCOUNTING_CHECKLIST.map((item, index) => {
            const seen = item.categories.some((category) => statsByCategory.has(category));
            return (
              <li
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-xl border border-gray-200 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {index + 1}. {item.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {cadenceLabel(item.cadence)}
                    {data ? (seen ? ' · gezien in deze periode' : ' · niet gezien in deze periode') : ''}
                  </p>
                </div>
                {item.href && item.hrefLabel ? (
                  <a href={item.href} className="text-sm font-medium text-blue-700 hover:underline">
                    {item.hrefLabel}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Wat we in deze app kunnen automatiseren</h2>
        <p className="text-sm text-gray-600 mb-3">
          Idealiter blijft Odoo de boekhoudbron, en doet deze app de saaie invoer + afletter-voorstellen. Jij
          controleert en bevestigt. BTW-aangifte Intervat laten we bij de partner (aansprakelijkheid).
        </p>
        <div className="space-y-3">
          {AUTOMATION_ROADMAP.map((item) => (
            <article key={item.title} className="rounded-2xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-700 mt-1">{item.impact}</p>
              <p className="text-sm text-gray-500 mt-1">Inspanning: {item.effort}</p>
              <p className="text-xs text-gray-500 mt-2">
                Vervangt of versnelt:{' '}
                {item.replaces.map((category) => actionCategoryLabel(category)).join(', ')}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Procesgids</h2>
        {allProcessGuides().map((guide) => (
          <ProcessGuideCard
            key={guide.category}
            guide={guide}
            stats={statsByCategory.get(guide.category) ?? null}
            groupBy={data?.groupBy ?? 'month'}
          />
        ))}
      </section>
    </div>
  );
}

function automationBadgeClass(status: AutomationStatus): string {
  switch (status) {
    case 'in_app':
      return 'bg-emerald-100 text-emerald-800';
    case 'partial':
      return 'bg-sky-100 text-sky-800';
    case 'planned':
      return 'bg-amber-100 text-amber-900';
    case 'keep_in_odoo':
      return 'bg-gray-100 text-gray-700';
    case 'keep_with_partner':
      return 'bg-violet-100 text-violet-800';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function ProcessGuideCard({
  guide,
  stats,
  groupBy,
}: {
  guide: ProcessGuide;
  stats: ProcessPlaybookItem | null;
  groupBy: GroupBy;
}) {
  return (
    <article className="border border-gray-200 rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-2 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{actionCategoryLabel(guide.category)}</h3>
          <p className="text-sm text-gray-600 mt-1">{guide.when}</p>
        </div>
        <span
          className={`self-start px-2.5 py-1 rounded-lg text-xs font-medium ${automationBadgeClass(guide.automation.status)}`}
        >
          {automationStatusLabel(guide.automation.status)}
        </span>
      </div>

      {stats ? (
        <p className="text-sm text-gray-800 mb-3">
          In deze periode: {stats.count}× · {stats.frequencyLabel} · {formatDurationMinutes(stats.estimatedMinutes)}
          <span className="mx-2 text-gray-400">·</span>
          {stats.amount > 0 ? formatEuro(stats.amount) : 'geen bedrag'}
          <span className="mx-2 text-gray-400">·</span>
          gem. {formatDurationMinutes(stats.avgMinutesPerAction)} per stuk
        </p>
      ) : (
        <p className="text-sm text-gray-500 mb-3">
          Niet gezien in de geladen {groupBy === 'month' ? 'maanden' : 'kwartalen'}. De stappen hieronder blijven
          gelden.
        </p>
      )}

      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">In Odoo</p>
      <p className="text-sm text-gray-700 mb-2">
        {guide.odooWhere}{' '}
        <a href={guide.odooHref} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
          Open in Odoo
        </a>
      </p>
      <ol className="list-decimal list-inside space-y-1 text-sm text-gray-800 mb-3">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-sm text-gray-700 mb-1">
        <span className="font-medium">Controle:</span> {guide.check}
      </p>
      <p className="text-sm text-amber-900 mb-3">
        <span className="font-medium">Let op:</span> {guide.pitfall}
      </p>

      <div className="rounded-xl bg-gray-50 px-3 py-3 space-y-1">
        <p className="text-sm text-gray-800">
          <span className="font-medium">Nu:</span> {guide.automation.now}
        </p>
        <p className="text-sm text-gray-800">
          <span className="font-medium">Automatiseren:</span> {guide.automation.next}
        </p>
        {guide.automation.appHref && guide.automation.appLabel ? (
          <a
            href={guide.automation.appHref}
            className="inline-block text-sm font-medium text-blue-700 hover:underline pt-1"
          >
            {guide.automation.appLabel} →
          </a>
        ) : null}
      </div>

      {stats && stats.periods.length > 0 ? (
        <div className="flex flex-wrap gap-2 mt-3">
          {stats.periods.map((label) => (
            <span key={label} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  color,
}: {
  title: string;
  value: string;
  hint: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        {color ? (
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        ) : null}
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-600">{hint}</p>
    </div>
  );
}

function PeriodChart({ summary }: { summary: AccountingInsights['overall'] }) {
  const chart = useMemo(
    () => ({
      labels: summary.map((row) => row.label),
      datasets: [
        {
          label: 'Aantal',
          data: summary.map((row) => row.count),
          backgroundColor: summary.map((row) => CATEGORY_COLORS[row.category]),
        },
      ],
    }),
    [summary]
  );

  if (summary.length === 0) return null;

  return (
    <div className="h-56">
      <Bar
        data={chart}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: false },
          },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        }}
      />
    </div>
  );
}

function EntriesTable({ entries }: { entries: AccountingEntry[] }) {
  return (
    <div className="overflow-auto max-h-[28rem] border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-medium">Datum</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Bron</th>
            <th className="px-3 py-2 font-medium text-right">Bedrag</th>
            <th className="px-3 py-2 font-medium">Relatie</th>
            <th className="px-3 py-2 font-medium">Referentie</th>
            <th className="px-3 py-2 font-medium">Journaal</th>
            <th className="px-3 py-2 font-medium">Gebruiker</th>
            <th className="px-3 py-2 font-medium text-right">Tijd</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => (
            <tr key={`${row.source}-${row.id}`} className="border-t border-gray-100 text-gray-800">
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{actionCategoryLabel(row.category)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{sourceLabel(row.source)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-medium">{formatEuro(row.amount)}</td>
              <td className="px-3 py-2">{row.partnerName ?? '—'}</td>
              <td className="px-3 py-2">
                {row.ref || row.name || '—'}
              </td>
              <td className="px-3 py-2">{row.journalName ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.userName ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right">{formatDurationMinutes(row.estimatedMinutes)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{stateLabel(row.state)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
