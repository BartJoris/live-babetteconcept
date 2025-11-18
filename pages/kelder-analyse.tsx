import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';

type InventoryRow = {
  productId?: number | null;
  barcode: string;
  name: string;
  variant: string | null;
  qty: number;
  salePrice: number | null;
  purchasePrice: number | null;
  qtyAvailable: number | null;
  found: boolean;
  note?: string;
};

type UploadShape = {
  rows: InventoryRow[];
  settings?: unknown;
};

type LocalAgg = {
  scanQty: number;
  localSalePrice: number | null;
  localPurchasePrice: number | null;
  names: string[]; // unique list
  variants: string[]; // unique list
  notes: string[]; // unique list
};

type OdooMatch = {
  id: number;
  barcode: string | null;
  name: string;
  categId: number | null;
  categName: string | null;
  qtyAvailable: number | null;
  listPrice: number | null;
  standardPrice: number | null;
  active?: boolean;
};

type AnalyseApiItem = {
  barcode: string;
  active: OdooMatch | null;
  archived: OdooMatch | null;
};

type AnalyseRow = {
  barcode: string;
  scanQty: number;
  localSalePrice: number | null;
  localPurchasePrice: number | null;
  localName?: string | null;
  localVariant?: string | null;
  localNamesExtra?: string[]; // for hover (merge info)
  localVariantsExtra?: string[];
  localNotes?: string[];
  active?: OdooMatch | null;
  archived?: OdooMatch | null;
  status: 'actief' | 'archief' | 'geen';
};

type FilterState = {
  status: 'alle' | 'actief' | 'archief' | 'geen';
  category: string;
  text: string;
};

type SortKey = 'barcode' | 'name' | 'variant' | 'scanQty' | 'odooQty' | 'diff' | 'category' | 'status';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

const STORAGE_ANALYSE_KEY = 'kelderAnalyseState';

export default function KelderAnalysePage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [upload, setUpload] = useState<UploadShape | null>(null);
  const [grouped, setGrouped] = useState<Record<string, LocalAgg>>({});
  const [analysed, setAnalysed] = useState<AnalyseRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [extraCategory, setExtraCategory] = useState('');
  const [filter, setFilter] = useState<FilterState>({ status: 'alle', category: '', text: '' });
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [sortFound, setSortFound] = useState<SortState>({ key: 'barcode', dir: 'asc' });
  const [sortUnknown, setSortUnknown] = useState<SortState>({ key: 'barcode', dir: 'asc' });
  const [showFound, setShowFound] = useState(true);
  const [showUnknown, setShowUnknown] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState<Record<string, boolean>>({});
  const foundTableRef = useRef<HTMLDivElement | null>(null);
  const [keywordOpen, setKeywordOpen] = useState(false);
  const [keywordBarcode, setKeywordBarcode] = useState<string | null>(null);
  const [keywordQuery, setKeywordQuery] = useState('');
  const [keywordIncArchived, setKeywordIncArchived] = useState(true);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordResults, setKeywordResults] = useState<OdooMatch[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ANALYSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          upload: UploadShape | null;
          analysed: AnalyseRow[];
          filter: FilterState;
        };
        if (parsed.upload) setUpload(parsed.upload);
        if (Array.isArray(parsed.analysed)) setAnalysed(parsed.analysed);
        if (parsed.filter) setFilter(parsed.filter);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_ANALYSE_KEY,
        JSON.stringify({ upload, analysed, filter })
      );
    } catch {
      // ignore
    }
  }, [upload, analysed, filter]);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const onChooseFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as UploadShape | InventoryRow[];
      let rows: InventoryRow[] = [];
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (parsed && Array.isArray(parsed.rows)) {
        rows = parsed.rows;
      }
      if (!rows.length) {
        setAlert('Geen geldige rijen gevonden in JSON.');
        return;
      }
      setUpload({ rows });
      setAnalysed([]);
      setSelected({});
      groupRows(rows);
    } catch {
      setAlert('JSON kon niet worden gelezen.');
    } finally {
      // reset file input
      if (e.target) e.target.value = '';
    }
  };

  const loadFromLocal = () => {
    try {
      const raw = localStorage.getItem('kelderInventarisRows');
      if (!raw) {
        setAlert('Geen lokale inventaris gevonden.');
        return;
      }
      const rows = JSON.parse(raw) as InventoryRow[];
      if (!Array.isArray(rows) || rows.length === 0) {
        setAlert('Lokale inventaris is leeg of ongeldig.');
        return;
      }
      setUpload({ rows });
      setAnalysed([]);
      setSelected({});
      groupRows(rows);
    } catch {
      setAlert('Laden van lokale inventaris mislukt.');
    }
  };

  const groupRows = (rows: InventoryRow[]) => {
    const map: Record<string, LocalAgg> = {};
    for (const r of rows) {
      const key = String(r.barcode).trim();
      if (!key) continue;
      if (!map[key]) {
        map[key] = {
          scanQty: 0,
          localSalePrice: r.salePrice ?? null,
          localPurchasePrice: r.purchasePrice ?? null,
          names: [],
          variants: [],
          notes: [],
        };
      }
      map[key].scanQty += Number.isFinite(r.qty) ? r.qty : 0;
      if (map[key].localSalePrice == null && r.salePrice != null) map[key].localSalePrice = r.salePrice;
      if (map[key].localPurchasePrice == null && r.purchasePrice != null) map[key].localPurchasePrice = r.purchasePrice;
      // aggregate unique names/variants/notes
      if (r.name && !map[key].names.includes(r.name)) map[key].names.push(r.name);
      if (r.variant && !map[key].variants.includes(r.variant)) map[key].variants.push(r.variant);
      if (r.note && !map[key].notes.includes(r.note)) map[key].notes.push(r.note);
    }
    setGrouped(map);
  };

  const startAnalyse = async () => {
    const barcodes = Object.keys(grouped);
    if (barcodes.length === 0) {
      setAlert('Geen gegroepeerde barcodes om te analyseren.');
      return;
    }
    try {
      const res = await fetch('/api/odoo/analyse-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes, mode: 'activeOnly' }),
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = (await res.json()) as AnalyseApiItem[];
      const byBarcode = new Map<string, AnalyseApiItem>();
      for (const item of data) byBarcode.set(item.barcode, item);

      const rows: AnalyseRow[] = barcodes.map((code) => {
        const base = grouped[code];
        const item = byBarcode.get(code);
        const act = item?.active ?? null;
        const arc = item?.archived ?? null;
        const status: 'actief' | 'archief' | 'geen' = act ? 'actief' : arc ? 'archief' : 'geen';
        const localName = base?.names?.[0] ?? null;
        const localVariant = base?.variants?.[0] ?? null;
        const localNamesExtra = base?.names && base.names.length > 1 ? base.names.slice(1) : [];
        const localVariantsExtra = base?.variants && base.variants.length > 1 ? base.variants.slice(1) : [];
        return {
          barcode: code,
          scanQty: base?.scanQty ?? 0,
          localSalePrice: base?.localSalePrice ?? null,
          localPurchasePrice: base?.localPurchasePrice ?? null,
          localName,
          localVariant,
          localNamesExtra,
          localVariantsExtra,
          localNotes: base?.notes ?? [],
          active: act,
          archived: arc,
          status,
        };
      });
      setAnalysed(rows);
    } catch (error: unknown) {
      setAlert(error instanceof Error ? error.message : 'Analyse mislukt.');
    }
  };

  const searchArchivedFor = async (barcode: string) => {
    try {
      setArchiveLoading(prev => ({ ...prev, [barcode]: true }));
      const res = await fetch(`/api/odoo/archived-lookup?barcode=${encodeURIComponent(barcode)}`);
      if (!res.ok) return;
      const arc = (await res.json()) as OdooMatch | null;
      if (!arc) {
        setAlert('Geen archiefrecord gevonden.');
        return;
      }
      setAnalysed(prev => prev.map(r => r.barcode === barcode ? { ...r, archived: arc, status: r.active ? 'actief' : 'archief' } : r));
      setAlert('Gearchiveerd product gevonden en toegevoegd.');
      // Scroll naar gevonden tabel zodat de gebruiker de verplaatsing ziet
      if (foundTableRef.current) {
        foundTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch {
      setAlert('Archiefzoeken mislukt.');
    } finally {
      setArchiveLoading(prev => ({ ...prev, [barcode]: false }));
    }
  };

  const searchArchivedForAllNoMatch = async () => {
    const targets = analysed.filter(r => r.status === 'geen').map(r => r.barcode);
    for (const bc of targets) {
      // sequential to be gentle
      // eslint-disable-next-line no-await-in-loop
      await searchArchivedFor(bc);
    }
  };

  const openKeywordSearch = (barcode: string, seed?: string) => {
    setKeywordBarcode(barcode);
    setKeywordQuery(seed || '');
    setKeywordIncArchived(true);
    setKeywordResults([]);
    setKeywordOpen(true);
  };

  const doKeywordSearch = async () => {
    if (!keywordQuery.trim()) {
      setAlert('Geef een zoekterm in.');
      return;
    }
    try {
      setKeywordLoading(true);
      const res = await fetch(`/api/odoo/search-products?q=${encodeURIComponent(keywordQuery.trim())}&includeArchived=${keywordIncArchived ? 'true' : 'false'}`);
      const json = await res.json();
      if (!res.ok) {
        setAlert(typeof json?.error === 'string' ? json.error : 'Zoekopdracht mislukt.');
        return;
      }
      const results = (json as any[]).map(it => ({
        id: it.id,
        barcode: it.barcode ?? null,
        name: it.name,
        categId: it.categId ?? null,
        categName: it.categName ?? null,
        qtyAvailable: it.qtyAvailable ?? null,
        listPrice: it.listPrice ?? null,
        standardPrice: it.standardPrice ?? null,
        active: it.active ?? true,
      })) as OdooMatch[];
      setKeywordResults(results);
    } catch {
      setAlert('Zoekopdracht mislukt.');
    } finally {
      setKeywordLoading(false);
    }
  };

  const attachKeywordMatch = (match: OdooMatch) => {
    if (!keywordBarcode) return;
    setAnalysed(prev => prev.map(r => {
      if (r.barcode !== keywordBarcode) return r;
      if (match.active) {
        return { ...r, active: { ...match }, status: 'actief' };
      }
      return { ...r, archived: { ...match }, status: r.active ? 'actief' : 'archief' };
    }));
    setKeywordOpen(false);
    // Scroll naar gevonden tabel:
    if (foundTableRef.current) {
      foundTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const filtered = useMemo(() => {
    return analysed.filter(r => {
      if (filter.status !== 'alle' && r.status !== filter.status) return false;
      if (filter.category) {
        const cat = r.active?.categName || r.archived?.categName || '';
        if (!cat.toLowerCase().includes(filter.category.toLowerCase())) return false;
      }
      if (filter.text) {
        const hay =
          `${r.barcode} ${(r.active?.name || r.archived?.name || r.localName || '')}`.toLowerCase();
        if (!hay.includes(filter.text.toLowerCase())) return false;
      }
      return true;
    });
  }, [analysed, filter]);

  const computeName = (r: AnalyseRow) => r.active?.name || r.archived?.name || r.localName || '';
  const computeVariant = (r: AnalyseRow) => (r.active?.name ? '' : (r.localVariant || ''));
  const computeOdooQty = (r: AnalyseRow) => r.active?.qtyAvailable ?? r.archived?.qtyAvailable ?? null;
  const computeCategory = (r: AnalyseRow) => r.active?.categName || r.archived?.categName || '';
  const computeDiff = (r: AnalyseRow) => (computeOdooQty(r) ?? 0) - r.scanQty;
  const isFoundTrue = (r: AnalyseRow) => r.status !== 'geen';

  const sortRows = (rows: AnalyseRow[], sort: SortState) => {
    const sorted = [...rows].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      const val = (key: SortKey, row: AnalyseRow): number | string => {
        switch (key) {
          case 'barcode': return row.barcode;
          case 'name': return computeName(row);
          case 'variant': return computeVariant(row);
          case 'scanQty': return row.scanQty;
          case 'odooQty': return computeOdooQty(row) ?? '';
          case 'diff': return computeDiff(row);
          case 'category': return computeCategory(row);
          case 'status': return row.status;
        }
      };
      const av = val(sort.key, a);
      const bv = val(sort.key, b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return sorted;
  };

  const foundRows = useMemo(() => sortRows(filtered.filter(isFoundTrue), sortFound), [filtered, sortFound]);
  const unknownRows = useMemo(() => sortRows(filtered.filter(r => !isFoundTrue(r)), sortUnknown), [filtered, sortUnknown]);

  const totals = useMemo(() => {
    let totalCost = 0;
    let totalSale = 0;
    for (const r of foundRows) {
      const cost = (r.localPurchasePrice ?? r.active?.standardPrice ?? r.archived?.standardPrice ?? 0) * r.scanQty;
      const sale = (r.localSalePrice ?? r.active?.listPrice ?? r.archived?.listPrice ?? 0) * r.scanQty;
      totalCost += Number.isFinite(cost) ? cost : 0;
      totalSale += Number.isFinite(sale) ? sale : 0;
    }
    return { totalCost, totalSale };
  }, [foundRows]);

  const setSel = (barcode: string, value: boolean) => {
    setSelected(prev => ({ ...prev, [barcode]: value }));
  };

  const allVisibleSelected = filtered.every(r => selected[r.barcode]);
  const toggleSelectAll = () => {
    const next: Record<string, boolean> = { ...selected };
    const target = !allVisibleSelected;
    for (const r of filtered) next[r.barcode] = target;
    setSelected(next);
  };

  const openPreview = () => {
    const hasAny = Object.values(selected).some(Boolean);
    if (!hasAny) {
      setAlert('Selecteer eerst producten.');
      return;
    }
    if (!extraCategory.trim()) {
      setAlert('Vul een extra categorie in.');
      return;
    }
    setPreviewOpen(true);
  };

  const downloadCSV = () => {
    const rows = analysed.filter(r => selected[r.barcode]);
    const headers = ['barcode', 'extra_category', 'archived'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const archived = r.status === 'archief' ? 'true' : 'false';
      lines.push([r.barcode, csvEscape(extraCategory.trim()), archived].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kelder-analyse-categories-${formatTs(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setPreviewOpen(false);
  };

  const csvEscape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  if (isLoading) {
    return (
      <>
        <Head><title>Kelder Analyse</title></Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }
  if (!isLoggedIn) return null;

  return (
    <>
      <Head><title>Kelder Analyse</title></Head>
      <main style={{ padding: 16, maxWidth: 1300, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Kelder Analyse</h1>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={onChooseFile} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>Upload JSON</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onFileChange} />
          <button onClick={loadFromLocal} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>Laad uit localStorage</button>
          <button onClick={startAnalyse} style={{ padding: '6px 10px', border: '1px solid #10b981', borderRadius: 4, background: '#ecfdf5', color: '#065f46' }}>
            Analyse starten
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div><strong>Kostwaarde:</strong> {totals.totalCost.toFixed(2)}</div>
            <div><strong>Verkoopwaarde:</strong> {totals.totalSale.toFixed(2)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Status
            <select value={filter.status} onChange={e => setFilter(prev => ({ ...prev, status: e.target.value as FilterState['status'] }))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <option value="alle">Alle</option>
              <option value="actief">Actief</option>
              <option value="archief">Gearchiveerd</option>
              <option value="geen">Geen match</option>
            </select>
          </label>
          <input placeholder="Filter categorie" value={filter.category} onChange={e => setFilter(prev => ({ ...prev, category: e.target.value }))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4 }} />
          <input placeholder="Zoeken (barcode of naam)" value={filter.text} onChange={e => setFilter(prev => ({ ...prev, text: e.target.value }))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, flex: 1 }} />
          <button onClick={searchArchivedForAllNoMatch} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
            Zoek archief voor alle “geen match”
          </button>
        </div>

        {/* TABEL 1: Gevonden (actief/archief) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Gevonden (actief/archief) — {foundRows.length}</h2>
          <button
            onClick={() => setShowFound(v => !v)}
            style={{ marginLeft: 8, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
            aria-expanded={showFound}
          >
            {showFound ? 'Inklappen' : 'Uitklappen'}
          </button>
        </div>
        {showFound ? (
        <div ref={foundTableRef} style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} /></th>
                <SortableTh label="Barcode" active={sortFound.key==='barcode'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'barcode', dir: prev.key==='barcode' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Naam" active={sortFound.key==='name'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'name', dir: prev.key==='name' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Variant" active={sortFound.key==='variant'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'variant', dir: prev.key==='variant' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="ScanQty" active={sortFound.key==='scanQty'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'scanQty', dir: prev.key==='scanQty' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="OdooQty" active={sortFound.key==='odooQty'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'odooQty', dir: prev.key==='odooQty' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Verschil" active={sortFound.key==='diff'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'diff', dir: prev.key==='diff' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Categorie" active={sortFound.key==='category'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'category', dir: prev.key==='category' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Status" active={sortFound.key==='status'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'status', dir: prev.key==='status' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <th style={thStyle}>Zoek</th>
              </tr>
            </thead>
            <tbody>
              {foundRows.map((r) => {
                const name = r.active?.name || r.archived?.name || r.localName || '';
                const variant = r.active?.name ? '' : (r.localVariant || '');
                const odooQty = r.active?.qtyAvailable ?? r.archived?.qtyAvailable ?? null;
                const diff = (odooQty ?? 0) - r.scanQty;
                const cat = r.active?.categName || r.archived?.categName || '';
                const rowStyle: React.CSSProperties = { borderTop: '1px solid #e5e7eb', background: diff !== 0 ? '#f3f4f6' : undefined };
                return (
                  <tr key={r.barcode} style={rowStyle}>
                    <td style={tdStyle}><input type="checkbox" checked={!!selected[r.barcode]} onChange={e => setSel(r.barcode, e.target.checked)} /></td>
                    <td style={tdStyle} title={r.barcode}>{r.barcode}</td>
                    <td style={{ ...tdStyle, maxWidth: 320 }} title={name}>
                      {name}
                      {(r.localNamesExtra && r.localNamesExtra.length > 0) ? (
                        <span title={`Meer namen:\n${r.localNamesExtra.join('\n')}`} style={{ marginLeft: 6, color: '#6b7280', cursor: 'help' }}>ⓘ</span>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 260 }} title={variant}>
                      {variant}
                      {(r.localVariantsExtra && r.localVariantsExtra.length > 0) ? (
                        <span title={`Meer varianten:\n${r.localVariantsExtra.join('\n')}`} style={{ marginLeft: 6, color: '#6b7280', cursor: 'help' }}>ⓘ</span>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{r.scanQty}</td>
                    <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{odooQty ?? ''}</td>
                    <td style={{ ...tdStyle, width: 90, textAlign: 'right', color: diff === 0 ? '#059669' : diff > 0 ? '#2563eb' : '#dc2626' }}>{diff}</td>
                    <td style={tdStyle} title={cat}>{cat}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}><a href={`https://www.google.com/search?q=${encodeURIComponent(r.barcode)}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Google</a></td>
                  </tr>
                );
              })}
              {foundRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                    Geen gevonden producten.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}

        {/* TABEL 2: Niet gevonden */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Niet gevonden — {unknownRows.length}</h2>
          <button
            onClick={() => setShowUnknown(v => !v)}
            style={{ marginLeft: 8, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
            aria-expanded={showUnknown}
          >
            {showUnknown ? 'Inklappen' : 'Uitklappen'}
          </button>
        </div>
        {showUnknown ? (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} /></th>
                <SortableTh label="Barcode" active={sortUnknown.key==='barcode'} dir={sortUnknown.dir} onClick={() => setSortUnknown(prev => ({ key: 'barcode', dir: prev.key==='barcode' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Naam" active={sortUnknown.key==='name'} dir={sortUnknown.dir} onClick={() => setSortUnknown(prev => ({ key: 'name', dir: prev.key==='name' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Variant" active={sortUnknown.key==='variant'} dir={sortUnknown.dir} onClick={() => setSortUnknown(prev => ({ key: 'variant', dir: prev.key==='variant' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="ScanQty" active={sortUnknown.key==='scanQty'} dir={sortUnknown.dir} onClick={() => setSortUnknown(prev => ({ key: 'scanQty', dir: prev.key==='scanQty' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Categorie" active={sortUnknown.key==='category'} dir={sortUnknown.dir} onClick={() => setSortUnknown(prev => ({ key: 'category', dir: prev.key==='category' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Status" active={sortUnknown.key==='status'} dir={sortUnknown.dir} onClick={() => setSortUnknown(prev => ({ key: 'status', dir: prev.key==='status' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <th style={thStyle}>Zoek</th>
                <th style={thStyle}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {unknownRows.map((r) => {
                const name = r.active?.name || r.archived?.name || r.localName || '';
                const variant = r.active?.name ? '' : (r.localVariant || '');
                const cat = r.active?.categName || r.archived?.categName || '';
                return (
                  <tr key={r.barcode} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tdStyle}><input type="checkbox" checked={!!selected[r.barcode]} onChange={e => setSel(r.barcode, e.target.checked)} /></td>
                    <td style={tdStyle} title={r.barcode}>{r.barcode}</td>
                    <td style={{ ...tdStyle, maxWidth: 320 }} title={name}>
                      {name}
                      {(r.localNamesExtra && r.localNamesExtra.length > 0) ? (
                        <span title={`Meer namen:\n${r.localNamesExtra.join('\n')}`} style={{ marginLeft: 6, color: '#6b7280', cursor: 'help' }}>ⓘ</span>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 260 }} title={variant}>
                      {variant}
                      {(r.localVariantsExtra && r.localVariantsExtra.length > 0) ? (
                        <span title={`Meer varianten:\n${r.localVariantsExtra.join('\n')}`} style={{ marginLeft: 6, color: '#6b7280', cursor: 'help' }}>ⓘ</span>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{r.scanQty}</td>
                    <td style={tdStyle} title={cat}>{cat}</td>
                    <td style={tdStyle}>{r.status}</td>
                    <td style={tdStyle}><a href={`https://www.google.com/search?q=${encodeURIComponent(r.barcode)}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Google</a></td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => void searchArchivedFor(r.barcode)}
                        disabled={!!archiveLoading[r.barcode]}
                        style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, opacity: archiveLoading[r.barcode] ? 0.6 : 1, marginRight: 6 }}
                        aria-busy={archiveLoading[r.barcode] ? 'true' : 'false'}
                      >
                        {archiveLoading[r.barcode] ? 'Zoeken…' : 'Zoek in archief'}
                      </button>
                      <button
                        onClick={() => openKeywordSearch(r.barcode, r.localName || r.localVariant || '')}
                        style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
                      >
                        Zoek op kernwoord
                      </button>
                    </td>
                  </tr>
                );
              })}
              {unknownRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                    Geen niet-gevonden producten.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input
            placeholder="Extra categorie (vrije tekst)"
            value={extraCategory}
            onChange={e => setExtraCategory(e.target.value)}
            style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, minWidth: 300 }}
          />
          <button onClick={openPreview} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
            Voorbeeld / Verificatie (CSV)
          </button>
        </div>

        {previewOpen ? (
          <div style={modalBackdropStyle} onClick={() => setPreviewOpen(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>CSV verificatie</h3>
              <p style={{ marginTop: 0 }}>Controleer onderstaande rijen. Er wordt niets in Odoo geschreven.</p>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 8, marginBottom: 12 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead style={{ background: '#f9fafb' }}>
                    <tr>
                      <th style={thStyle}>Barcode</th>
                      <th style={thStyle}>Extra categorie</th>
                      <th style={thStyle}>Archived</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysed.filter(r => selected[r.barcode]).map(r => (
                      <tr key={r.barcode} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={tdStyle}>{r.barcode}</td>
                        <td style={tdStyle}>{extraCategory}</td>
                        <td style={tdStyle}>{r.status === 'archief' ? 'true' : 'false'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPreviewOpen(false)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
                  Annuleren
                </button>
                <button onClick={downloadCSV} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#065f46' }}>
                  Download CSV
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {keywordOpen ? (
          <div style={modalBackdropStyle} onClick={() => setKeywordOpen(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Zoek op kernwoord</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  placeholder="Zoekterm"
                  value={keywordQuery}
                  onChange={e => setKeywordQuery(e.target.value)}
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4, flex: 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={keywordIncArchived} onChange={e => setKeywordIncArchived(e.target.checked)} />
                  Inclusief archief
                </label>
                <button onClick={doKeywordSearch} disabled={keywordLoading} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
                  {keywordLoading ? 'Zoeken…' : 'Zoeken'}
                </button>
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead style={{ background: '#f9fafb' }}>
                    <tr>
                      <th style={thStyle}>Barcode</th>
                      <th style={thStyle}>Naam</th>
                      <th style={thStyle}>Categorie</th>
                      <th style={thStyle}>Actief</th>
                      <th style={thStyle}>Voorraad</th>
                      <th style={thStyle}>Kiezen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywordResults.map(item => (
                      <tr key={`${item.id}-${item.barcode ?? 'nobar'}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={tdStyle}>{item.barcode ?? ''}</td>
                        <td style={{ ...tdStyle, maxWidth: 360 }} title={item.name}>{item.name}</td>
                        <td style={tdStyle}>{item.categName ?? ''}</td>
                        <td style={tdStyle}>{item.active ? 'true' : 'false'}</td>
                        <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{item.qtyAvailable ?? ''}</td>
                        <td style={tdStyle}>
                          <button onClick={() => attachKeywordMatch(item)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#065f46' }}>
                            Selecteer
                          </button>
                        </td>
                      </tr>
                    ))}
                    {keywordResults.length === 0 && !keywordLoading ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>Geen resultaten</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setKeywordOpen(false)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
                  Sluiten
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: 8,
  verticalAlign: 'top',
};
const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};
const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 16,
  width: '100%',
  maxWidth: 720,
  boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
};

function SortableTh(props: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  const arrow = props.active ? (props.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
      onClick={props.onClick}
      title="Sorteren"
    >
      {props.label} {arrow}
    </th>
  );
}


