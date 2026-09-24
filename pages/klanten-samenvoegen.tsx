import { useState, useCallback } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';

import type { DuplicateGroup, DuplicatePartner } from './api/odoo/duplicate-partners';

const ODOO_BASE = 'https://www.babetteconcept.be';

type SortField = 'partners' | 'reason' | 'name';
type SortDir = 'asc' | 'desc';

function odooPartnerUrl(id: number): string {
  return `${ODOO_BASE}/odoo/contacts/${id}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('nl-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function KlantenSamenvoegenPage() {
  const { isLoading: authLoading, isLoggedIn } = useAuth(true);

  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [totalPartners, setTotalPartners] = useState(0);
  const [totalDuplicateGroups, setTotalDuplicateGroups] = useState(0);
  const [totalDuplicatePartners, setTotalDuplicatePartners] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const [onlyCustomers, setOnlyCustomers] = useState(false);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('partners');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (onlyCustomers) params.set('onlyCustomers', 'true');
      const res = await fetch(`/api/odoo/duplicate-partners?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGroups(data.groups);
      setTotalPartners(data.totalPartners);
      setTotalDuplicateGroups(data.totalDuplicateGroups);
      setTotalDuplicatePartners(data.totalDuplicatePartners);
      setFetched(true);
      setExpandedGroups(new Set());
      setHiddenGroups(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }, [onlyCustomers]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hideGroup = (key: string) => {
    setHiddenGroups((prev) => new Set(prev).add(key));
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'partners' ? 'desc' : 'asc');
    }
  };

  // Filter & sort
  const visibleGroups = groups
    .filter((g) => !hiddenGroups.has(g.key))
    .filter((g) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        g.key.toLowerCase().includes(q) ||
        g.reason.toLowerCase().includes(q) ||
        g.partners.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.email?.toLowerCase().includes(q)) ||
            (p.phone?.includes(q))
        )
      );
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'partners':
          return (a.partners.length - b.partners.length) * dir;
        case 'reason':
          return a.reason.localeCompare(b.reason) * dir;
        case 'name':
          return a.key.localeCompare(b.key) * dir;
        default:
          return 0;
      }
    });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }
  if (!isLoggedIn) return null;

  return (
    <>
      <Head>
        <title>Klanten samenvoegen — Babette POS</title>
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          👥 Dubbele klanten opsporen
        </h1>
        <p className="text-gray-500 mb-6">
          Zoek klanten die dubbel in Odoo staan op basis van naam, e-mail of telefoonnummer. 
          Klik op een klant-ID om het record in Odoo te openen en samen te voegen.
        </p>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={onlyCustomers}
                onChange={(e) => setOnlyCustomers(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Enkel klanten (customer_rank &gt; 0)
            </label>
            <button
              onClick={fetchDuplicates}
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Laden…
                </span>
              ) : fetched ? '🔄 Opnieuw ophalen' : '🔍 Dubbels zoeken'}
            </button>
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-50 text-red-700 rounded text-sm">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Stats */}
        {fetched && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{totalPartners}</div>
              <div className="text-xs text-gray-500 mt-1">Totaal contacten</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{totalDuplicateGroups}</div>
              <div className="text-xs text-gray-500 mt-1">Dubbel-groepen</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{totalDuplicatePartners}</div>
              <div className="text-xs text-gray-500 mt-1">Contacten met dubbels</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {hiddenGroups.size}
              </div>
              <div className="text-xs text-gray-500 mt-1">Verborgen groepen</div>
            </div>
          </div>
        )}

        {/* Search & sort */}
        {fetched && groups.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op naam, e-mail, telefoon…"
                className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex gap-2 text-xs">
                <SortButton label="# Klanten" field="partners" active={sortField} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Reden" field="reason" active={sortField} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Naam" field="name" active={sortField} dir={sortDir} onClick={toggleSort} />
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              {visibleGroups.length} groepen zichtbaar van {groups.length} totaal
              {hiddenGroups.size > 0 && (
                <button onClick={() => setHiddenGroups(new Set())} className="ml-2 text-blue-500 hover:underline">
                  Alles tonen
                </button>
              )}
            </div>
          </div>
        )}

        {/* Groups */}
        {fetched && visibleGroups.length === 0 && !loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
            {groups.length === 0 ? '✅ Geen dubbele klanten gevonden!' : 'Geen resultaten voor deze zoekopdracht.'}
          </div>
        )}

        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            return (
              <div key={group.key} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      group.partners.length >= 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {group.partners.length}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800 truncate block">{group.key}</span>
                      <span className="text-xs text-gray-400">{group.reason}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); hideGroup(group.key); }}
                      className="text-xs text-gray-400 hover:text-red-500 px-2 py-1"
                      title="Verberg groep"
                    >
                      ✕
                    </button>
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </button>

                {/* Expanded partner list */}
                {isExpanded && (
                  <div className="border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-2 text-left">ID</th>
                            <th className="px-4 py-2 text-left">Naam</th>
                            <th className="px-4 py-2 text-left">E-mail</th>
                            <th className="px-4 py-2 text-left">Telefoon</th>
                            <th className="px-4 py-2 text-left">Adres</th>
                            <th className="px-4 py-2 text-right">POS orders</th>
                            <th className="px-4 py-2 text-right">Webshop orders</th>
                            <th className="px-4 py-2 text-left">Aangemaakt</th>
                            <th className="px-4 py-2 text-left">Acties</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {group.partners
                            .slice()
                            .sort((a, b) => (b.posOrderCount + b.saleOrderCount) - (a.posOrderCount + a.saleOrderCount))
                            .map((p) => (
                              <PartnerRow key={p.id} partner={p} />
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 flex justify-between items-center">
                      <span>
                        💡 Open de klant met meeste orders in Odoo → Acties → Samenvoegen
                      </span>
                      <a
                        href={`${ODOO_BASE}/odoo/contacts?search=${encodeURIComponent(group.key)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        Zoek in Odoo →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PartnerRow({ partner: p }: { partner: DuplicatePartner }) {
  const totalOrders = p.posOrderCount + p.saleOrderCount;
  return (
    <tr className={`hover:bg-blue-50/50 ${totalOrders === 0 ? 'opacity-60' : ''}`}>
      <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.id}</td>
      <td className="px-4 py-2 font-medium text-gray-800">
        {p.name}
        {p.parentCompany && (
          <span className="block text-xs text-gray-400">🏢 {p.parentCompany}</span>
        )}
        {p.pricelist && (
          <span className="block text-xs text-purple-400">🏷️ {p.pricelist}</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-600">{p.email ?? '—'}</td>
      <td className="px-4 py-2 text-gray-600">{p.phone ?? '—'}</td>
      <td className="px-4 py-2 text-gray-600 text-xs">
        {p.street && <span>{p.street}</span>}
        {(p.zip || p.city) && (
          <span className="block">{[p.zip, p.city].filter(Boolean).join(' ')}</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <span className={`font-medium ${p.posOrderCount > 0 ? 'text-green-600' : 'text-gray-300'}`}>
          {p.posOrderCount}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <span className={`font-medium ${p.saleOrderCount > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
          {p.saleOrderCount}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-400 text-xs">{formatDate(p.createDate)}</td>
      <td className="px-4 py-2">
        <a
          href={odooPartnerUrl(p.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
        >
          Open in Odoo ↗
        </a>
      </td>
    </tr>
  );
}

function SortButton({
  label,
  field,
  active,
  dir,
  onClick,
}: {
  label: string;
  field: SortField;
  active: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
}) {
  const isActive = active === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={`px-2 py-1 rounded border text-xs transition-colors ${
        isActive ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
      }`}
    >
      {label} {isActive && (dir === 'asc' ? '↑' : '↓')}
    </button>
  );
}
