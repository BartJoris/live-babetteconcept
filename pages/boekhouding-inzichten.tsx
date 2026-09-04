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
} from '@/lib/accounting/insights';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type PageTab = 'overview' | 'processes';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AccountingInsights | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const hasAutoFetched = useRef(false);

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

  useEffect(() => {
    if (!isLoggedIn || authLoading || hasAutoFetched.current) return;
    hasAutoFetched.current = true;
    void fetchData();
  }, [isLoggedIn, authLoading, fetchData]);

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
              void fetchData();
            }}
            className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-6"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Boekhouding Inzichten</h1>
              <p className="text-sm text-gray-600 mt-1">
                Handelingen van de boekhoudpartner (alles behalve gebruiker Margot), gegroepeerd op boekingsdatum.
                Werktijd is geschat uit Odoo-aanmaaktijdstippen.
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
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow disabled:opacity-50"
              >
                {loading ? 'Laden...' : 'Laden'}
              </button>
            </div>
          </form>

          {error && (
            <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {data?.warnings && data.warnings.length > 0 && (
            <ul className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {data && (
            <>
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
                  Processen
                </button>
              </div>

              {tab === 'overview' ? (
                <OverviewTab data={data} expanded={expanded} onToggle={togglePeriod} />
              ) : (
                <ProcessesTab data={data} />
              )}
            </>
          )}

          {!data && !loading && !error && (
            <p className="text-center py-12 text-gray-600">Kies een periode en klik op Laden.</p>
          )}
        </div>
      </div>
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

function ProcessesTab({ data }: { data: AccountingInsights }) {
  if (data.processes.length === 0) {
    return <p className="text-center py-8 text-gray-600">Nog geen processen om te tonen voor deze periode.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Dit overzicht is afgeleid van wat de partner effectief in Odoo heeft uitgevoerd. Gebruik het als
        checklist om dezelfde handelingen zelf over te nemen.
      </p>
      {data.processes.map((process) => (
        <article key={process.category} className="border border-gray-200 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{process.label}</h3>
            <p className="text-sm text-gray-600">
              {process.count}× · {process.frequencyLabel} · {formatDurationMinutes(process.estimatedMinutes)}
            </p>
          </div>
          <p className="text-sm text-gray-700 mb-3">{process.description}</p>
          <p className="text-sm text-gray-800 mb-2">
            Volume: <span className="font-medium">{formatEuro(process.amount)}</span>
            <span className="mx-2 text-gray-400">·</span>
            Gem. {formatDurationMinutes(process.avgMinutesPerAction)} per handeling
          </p>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Voorgekomen in deze {data.groupBy === 'month' ? 'maanden' : 'kwartalen'}
          </p>
          <div className="flex flex-wrap gap-2">
            {process.periods.map((label) => (
              <span key={label} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs">
                {label}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
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
