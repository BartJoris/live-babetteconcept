import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';
import * as XLSX from 'xlsx';

type ScannedRow = {
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

type LoadMode = 'replace' | 'merge';

const STORAGE_ROWS_KEY = 'posVerkopenRows';
const STORAGE_SETTINGS_KEY = 'posVerkopenSettings';
const STORAGE_LAST_FILENAME_KEY = 'posVerkopenLastFilename';
const STORAGE_RECENT_FILENAMES_KEY = 'posVerkopenRecentFilenames';

type Settings = {
  fastScanIncrement: boolean;
  offlineMode: boolean;
};

const defaultSettings: Settings = {
  fastScanIncrement: false,
  offlineMode: false,
};

export default function PosVerkopenOphalenPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [loadMode, setLoadMode] = useState<LoadMode>('replace');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [recentFilenames, setRecentFilenames] = useState<string[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [columnWidths, setColumnWidths] = useState({
    barcode: 150,
    variant: 300,
    qty: 80,
    stock: 120,
    note: 200,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Set default dates (today)
  useEffect(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setStartDate(todayStr);
    setEndDate(todayStr);
  }, []);

  useEffect(() => {
    try {
      const rawRows = localStorage.getItem(STORAGE_ROWS_KEY);
      const rawSettings = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (rawRows) {
        const parsed = JSON.parse(rawRows) as ScannedRow[];
        if (Array.isArray(parsed)) {
          setRows(parsed);
        }
      }
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings) as Settings;
        setSettings({ ...defaultSettings, ...parsedSettings });
      }
      // Load last used filename
      const lastFilename = localStorage.getItem(STORAGE_LAST_FILENAME_KEY);
      if (lastFilename) {
        setSaveFileName(lastFilename);
      }
      // Load recent filenames
      try {
        const recentRaw = localStorage.getItem(STORAGE_RECENT_FILENAMES_KEY);
        if (recentRaw) {
          const recent = JSON.parse(recentRaw) as string[];
          setRecentFilenames(recent);
        }
      } catch {
        // Ignore errors
      }
    } catch {
      // ignore load errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ROWS_KEY, JSON.stringify(rows));
    } catch {
      // storage quota or other error
    }
  }, [rows]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage quota or other error
    }
  }, [settings]);

  const handleResizeStart = (column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[column as keyof typeof columnWidths]);
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(50, resizeStartWidth + diff);
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth, columnWidths]);

  const totalCount = useMemo(() => rows.reduce((acc, r) => acc + (Number.isFinite(r.qty) ? r.qty : 0), 0), [rows]);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const handleFetchSales = async () => {
    if (!startDate || !endDate) {
      setAlert('Selecteer zowel start- als einddatum.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setAlert('Startdatum moet voor einddatum liggen.');
      return;
    }

    setIsLoadingSales(true);
    try {
      const res = await fetch('/api/pos-sales-by-date-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || `Failed to fetch: ${res.status}`);
      }

      const data = await res.json();
      const fetchedRows: ScannedRow[] = (data.rows || []).map((r: any) => ({
        productId: r.productId ?? null,
        barcode: r.barcode ?? 'GEEN-BARCODE',
        name: r.name ?? '',
        variant: r.variant ?? null,
        qty: r.qty ?? 0,
        salePrice: r.salePrice ?? null,
        purchasePrice: r.purchasePrice ?? null,
        qtyAvailable: r.qtyAvailable ?? null,
        found: r.found ?? true,
        note: r.note ?? '',
      }));

      if (loadMode === 'replace') {
        setRows(fetchedRows);
        setAlert(`${fetchedRows.length} POS verkopen opgehaald voor periode ${startDate} tot ${endDate}.`);
      } else {
        // merge: by barcode; if exists, sum qty
        setRows(prev => {
          const map = new Map<string, ScannedRow>();
          for (const r of prev) map.set(r.barcode, { ...r });
          for (const r of fetchedRows) {
            const existing = map.get(r.barcode);
            if (existing) {
              map.set(r.barcode, { ...existing, qty: (existing.qty || 0) + (r.qty || 0) });
            } else {
              map.set(r.barcode, { ...r });
            }
          }
          return Array.from(map.values());
        });
        setAlert(`${fetchedRows.length} POS verkopen toegevoegd aan bestaande lijst.`);
      }
    } catch (error) {
      console.error('Error fetching POS sales:', error);
      setAlert(`Fout bij ophalen: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      setIsLoadingSales(false);
    }
  };

  const updateRow = (index: number, patch: Partial<ScannedRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeRow = (index: number) => {
    if (confirm('Weet je zeker dat je deze regel wilt verwijderen?')) {
      setRows(prev => prev.filter((_, i) => i !== index));
    }
  };

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil leegmaken?')) {
      setRows([]);
    }
  };

  const saveDraft = () => {
    try {
      const lastFilename = localStorage.getItem(STORAGE_LAST_FILENAME_KEY);
      const defaultName = lastFilename || `pos-verkopen-${formatTs(new Date())}`;
      setSaveFileName(defaultName);
    } catch {
      const defaultName = `pos-verkopen-${formatTs(new Date())}`;
      setSaveFileName(defaultName);
    }
    setShowSaveModal(true);
  };

  const handleSaveConfirm = () => {
    try {
      localStorage.setItem(STORAGE_ROWS_KEY, JSON.stringify(rows));
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      
      const blob = new Blob([JSON.stringify({ rows, settings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      let fileName = saveFileName.trim() || `pos-verkopen-${formatTs(new Date())}`;
      
      // Update timestamp in filename if it contains a timestamp pattern
      const timestampPattern = /\d{8}-\d{4}/;
      if (timestampPattern.test(fileName)) {
        fileName = fileName.replace(timestampPattern, formatTs(new Date()));
      } else if (!fileName.includes(formatTs(new Date()))) {
        fileName = `${fileName}-${formatTs(new Date())}`;
      }
      
      const finalName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
      a.href = url;
      a.download = finalName;
      a.click();
      URL.revokeObjectURL(url);
      
      // Save filename for next time (without .json extension and without timestamp)
      const nameWithoutExt = fileName.replace(/\.json$/i, '').replace(/-\d{8}-\d{4}$/, '');
      localStorage.setItem(STORAGE_LAST_FILENAME_KEY, nameWithoutExt);
      
      // Add to recent filenames list
      try {
        const recentRaw = localStorage.getItem(STORAGE_RECENT_FILENAMES_KEY);
        const recent: string[] = recentRaw ? JSON.parse(recentRaw) : [];
        const updated = [nameWithoutExt, ...recent.filter(n => n !== nameWithoutExt)].slice(0, 10);
        localStorage.setItem(STORAGE_RECENT_FILENAMES_KEY, JSON.stringify(updated));
        setRecentFilenames(updated);
      } catch {
        // Ignore errors
      }
      
      setShowSaveModal(false);
      setAlert('Concept opgeslagen.');
    } catch {
      setAlert('Opslaan mislukt.');
    }
  };

  const loadDraftFromFile = () => {
    fileInputRef.current?.click();
  };

  const onChangeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { rows?: ScannedRow[]; settings?: Settings };
      if (!parsed || !Array.isArray(parsed.rows)) {
        setAlert('Ongeldig bestand.');
        return;
      }
      if (loadMode === 'replace') {
        setRows(parsed.rows);
      } else {
        // merge: by barcode; if exists, sum qty
        setRows(prev => {
          const map = new Map<string, ScannedRow>();
          for (const r of prev) map.set(r.barcode, { ...r });
          for (const r of parsed.rows!) {
            const existing = map.get(r.barcode);
            if (existing) {
              map.set(r.barcode, { ...existing, qty: (existing.qty || 0) + (r.qty || 0) });
            } else {
              map.set(r.barcode, { ...r });
            }
          }
          return Array.from(map.values());
        });
      }
      if (parsed.settings) {
        setSettings(prev => ({ ...prev, ...parsed.settings! }));
      }
      setAlert('Concept geladen.');
      e.target.value = '';
    } catch {
      setAlert('Laden mislukt.');
    }
  };

  const exportExcel = () => {
    try {
      const exportRows = rows.map(r => ({
        Barcode: r.barcode,
        Naam: r.name,
        Variant: r.variant ?? '',
        Aantal: r.qty,
        'Verkoopprijs': r.salePrice ?? '',
        'Aankoopprijs': r.purchasePrice ?? '',
        'Gevonden': r.found ? 'true' : 'false',
        'Voorraad': r.qtyAvailable ?? '',
        'Opmerking': r.note ?? '',
        'ProductId': r.productId ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'POS Verkopen');
      XLSX.writeFile(wb, `pos-verkopen-${formatTs(new Date())}.xlsx`);
    } catch {
      setAlert('Export mislukt.');
    }
  };

  if (isLoading) {
    return (
      <>
        <Head>
          <title>POS verkopen ophalen</title>
        </Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head>
        <title>POS verkopen ophalen</title>
      </Head>
      <main style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>POS verkopen ophalen</h1>
        <p style={{ marginBottom: 16 }}>
          Haal POS verkopen op uit Odoo voor een bepaalde tijdsperiode. Deze data kan worden gebruikt voor inventaris analyse.
        </p>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Van:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Tot:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
          <button
            onClick={handleFetchSales}
            disabled={isLoadingSales}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid #3b82f6',
              background: '#3b82f6',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: isLoadingSales ? 'wait' : 'pointer',
              opacity: isLoadingSales ? 0.6 : 1,
            }}
          >
            {isLoadingSales ? 'Ophalen...' : '📥 Ophalen POS verkopen'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <button onClick={saveDraft} style={{ 
            padding: '8px 16px', 
            borderRadius: 6, 
            border: '1px solid #10b981', 
            background: '#10b981', 
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer'
          }}>
            Opslaan
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Laden:</span>
            <select value={loadMode} onChange={e => setLoadMode(e.target.value as LoadMode)} style={{ padding: 4 }}>
              <option value="replace">Vervangen</option>
              <option value="merge">Samenvoegen</option>
            </select>
            <button onClick={loadDraftFromFile} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
              Kies vorig bestand
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={onChangeFile}
            />
          </div>
          <button onClick={exportExcel} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
            Exporteer naar Excel
          </button>
          <button onClick={clearAll} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #dc2626', color: '#dc2626' }}>
            Leegmaken
          </button>
          <div style={{ marginLeft: 'auto' }}>
            <strong>Totaal items:</strong> {rows.length} &nbsp; <strong>Aantallen:</strong> {totalCount}
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ ...thStyle, borderLeft: '1px solid #e5e7eb', width: columnWidths.barcode, position: 'relative' }}>
                  Barcode
                  <div
                    onMouseDown={(e) => handleResizeStart('barcode', e)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      userSelect: 'none',
                      background: resizingColumn === 'barcode' ? '#3b82f6' : 'transparent',
                    }}
                  />
                </th>
                <th style={{ ...thStyle, width: columnWidths.variant, position: 'relative' }}>
                  Variant
                  <div
                    onMouseDown={(e) => handleResizeStart('variant', e)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      userSelect: 'none',
                      background: resizingColumn === 'variant' ? '#3b82f6' : 'transparent',
                    }}
                  />
                </th>
                <th style={{ ...thStyle, width: columnWidths.qty, position: 'relative' }}>
                  Aantal
                  <div
                    onMouseDown={(e) => handleResizeStart('qty', e)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      userSelect: 'none',
                      background: resizingColumn === 'qty' ? '#3b82f6' : 'transparent',
                    }}
                  />
                </th>
                <th style={{ ...thStyle, width: columnWidths.stock, position: 'relative' }}>
                  Voorraad
                  <div
                    onMouseDown={(e) => handleResizeStart('stock', e)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      userSelect: 'none',
                      background: resizingColumn === 'stock' ? '#3b82f6' : 'transparent',
                    }}
                  />
                </th>
                <th style={{ ...thStyle, width: columnWidths.note, position: 'relative' }}>
                  Opmerking
                  <div
                    onMouseDown={(e) => handleResizeStart('note', e)}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      userSelect: 'none',
                      background: resizingColumn === 'note' ? '#3b82f6' : 'transparent',
                    }}
                  />
                </th>
                <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>Actie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.barcode}-${i}`} style={{ borderTop: '1px solid #e5e7eb', fontWeight: i === 0 ? 'bold' : undefined }}>
                  <td style={{ ...tdStyle, borderLeft: '1px solid #e5e7eb', width: columnWidths.barcode }} title={r.barcode}>{r.barcode}</td>
                  <td style={{ ...tdStyle, width: columnWidths.variant, padding: 0 }} title={r.variant ?? ''}>
                    <input
                      value={r.variant ?? ''}
                      onChange={e => updateRow(i, { variant: e.target.value })}
                      title={r.variant ?? ''}
                      style={{ ...cellInputStyle, width: '100%', border: 'none', borderRadius: 0, padding: 8 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, width: columnWidths.qty, padding: 0 }}>
                    <input
                      type="number"
                      min={0}
                      value={r.qty}
                      onChange={e => updateRow(i, { qty: Number(e.target.value) || 0 })}
                      title={String(r.qty)}
                      style={{ ...cellInputStyle, width: '100%', border: 'none', borderRadius: 0, padding: 8 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, width: columnWidths.stock, textAlign: 'right' }} title={r.qtyAvailable == null ? '' : String(r.qtyAvailable)}>{r.qtyAvailable ?? ''}</td>
                  <td style={{ ...tdStyle, width: columnWidths.note, padding: 0 }} title={r.note ?? ''}>
                    <input
                      value={r.note ?? ''}
                      onChange={e => updateRow(i, { note: e.target.value })}
                      title={r.note ?? ''}
                      style={{ ...cellInputStyle, width: '100%', border: 'none', borderRadius: 0, padding: 8 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 50, textAlign: 'center', padding: 8 }}>
                    <button
                      onClick={() => removeRow(i)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid #dc2626',
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                      title="Verwijder regel"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, textAlign: 'center', color: '#6b7280', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                    Nog geen items. Selecteer een periode en klik op "Ophalen POS verkopen".
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {showSaveModal ? (
          <div style={modalBackdropStyle} onClick={() => setShowSaveModal(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>POS verkopen opslaan</h3>
              <p style={{ marginTop: 0, marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
                Geef een naam op voor dit bestand.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={labelStyle}>
                  Bestandsnaam
                  <input
                    value={saveFileName}
                    onChange={e => setSaveFileName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveConfirm();
                      }
                    }}
                    style={inputStyle}
                    autoFocus
                    placeholder="pos-verkopen-naam"
                    list="recent-filenames"
                  />
                  {recentFilenames.length > 0 && (
                    <datalist id="recent-filenames">
                      {recentFilenames.map((name, idx) => (
                        <option key={idx} value={name} />
                      ))}
                    </datalist>
                  )}
                </label>
                {recentFilenames.length > 0 && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: -4 }}>
                    Recent gebruikte namen: {recentFilenames.slice(0, 3).join(', ')}
                    {recentFilenames.length > 3 && '...'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    setSaveFileName('');
                  }}
                  style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSaveConfirm}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: '1px solid #10b981',
                    background: '#10b981',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Opslaan
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
  padding: 12,
  borderRight: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
  fontSize: 14,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: 12,
  borderRight: '1px solid #e5e7eb',
  verticalAlign: 'middle',
  fontSize: 14,
};

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  padding: 6,
  border: '1px solid #e5e7eb',
  borderRadius: 4,
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
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 16,
  width: '100%',
  maxWidth: 480,
  boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: 14,
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  fontSize: 14,
};

