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

const STORAGE_ROWS_KEY = 'kelderInventarisRows';
const STORAGE_SETTINGS_KEY = 'kelderInventarisSettings';

type Settings = {
  fastScanIncrement: boolean;
  offlineMode: boolean;
};

type CachedProduct = {
  productId: number;
  barcode: string;
  name: string;
  variant: string | null;
  qtyAvailable: number | null;
  salePrice: number | null;
  purchasePrice: number | null;
};

const defaultSettings: Settings = {
  fastScanIncrement: false,
  offlineMode: false,
};

const STORAGE_CACHE_KEY = 'kelderInventarisCache';

function getCache(): Record<string, CachedProduct> {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setCache(cache: Record<string, CachedProduct>) {
  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export default function KelderInventarisPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isNotFoundOpen, setIsNotFoundOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [nfName, setNfName] = useState('');
  const [nfVariant, setNfVariant] = useState('');
  const [nfQty, setNfQty] = useState<number>(1);
  const [nfSalePrice, setNfSalePrice] = useState<string>('');
  const [nfPurchasePrice, setNfPurchasePrice] = useState<string>('');
  const [nfNote, setNfNote] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [loadMode, setLoadMode] = useState<LoadMode>('replace');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
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
    } catch {
      // ignore load errors, will be overwritten by autosave
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

  const totalCount = useMemo(() => rows.reduce((acc, r) => acc + (Number.isFinite(r.qty) ? r.qty : 0), 0), [rows]);

  const handleLookup = async (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) {
      setAlert('Lege barcode. Probeer opnieuw.');
      return;
    }
    // Bundel dubbele scans altijd tot één lijn met +1
    {
      const existingIndex = rows.findIndex(r => r.barcode === normalized);
      if (existingIndex >= 0) {
        const next = [...rows];
        next[existingIndex] = { ...next[existingIndex], qty: (next[existingIndex].qty || 0) + 1 };
        setRows(next);
        setBarcodeInput('');
        return;
      }
    }

    // Offline modus of geen internet: gebruik cache of open formulier
    if (settings.offlineMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      const cache = getCache();
      const hit = cache[normalized];
      if (hit) {
        setRows(prev => [...prev, {
          productId: hit.productId,
          barcode: hit.barcode,
          name: hit.name,
          variant: hit.variant,
          qty: 1,
          salePrice: hit.salePrice,
          purchasePrice: hit.purchasePrice,
          qtyAvailable: hit.qtyAvailable,
          found: true,
          note: '',
        }]);
        setBarcodeInput('');
        return;
      }
      setNotFoundBarcode(normalized);
      setNfName('');
      setNfVariant('');
      setNfQty(1);
      setNfSalePrice('');
      setNfPurchasePrice('');
      setNfNote('');
      setIsNotFoundOpen(true);
      return;
    }

    try {
      const res = await fetch(`/api/odoo/lookup-by-barcode?barcode=${encodeURIComponent(normalized)}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      if (data && data.found) {
        const newRow: ScannedRow = {
          productId: data.productId ?? null,
          barcode: data.barcode ?? normalized,
          name: data.name ?? '',
          variant: data.variant ?? null,
          qty: 1,
          salePrice: data.salePrice ?? null,
          purchasePrice: data.purchasePrice ?? null,
          qtyAvailable: data.qtyAvailable ?? null,
          found: true,
          note: '',
        };
        setRows(prev => [...prev, newRow]);
        // cache
        const cache = getCache();
        cache[newRow.barcode] = {
          productId: newRow.productId ?? 0,
          barcode: newRow.barcode,
          name: newRow.name,
          variant: newRow.variant,
          qtyAvailable: newRow.qtyAvailable,
          salePrice: newRow.salePrice,
          purchasePrice: newRow.purchasePrice,
        };
        setCache(cache);
        setBarcodeInput('');
      } else {
        // open not found modal
        setNotFoundBarcode(normalized);
        setNfName('');
        setNfVariant('');
        setNfQty(1);
        setNfSalePrice('');
        setNfPurchasePrice('');
        setNfNote('');
        setIsNotFoundOpen(true);
      }
    } catch {
      // Fout: probeer cache, anders open formulier
      const cache = getCache();
      const hit = cache[normalized];
      if (hit) {
        setRows(prev => [...prev, {
          productId: hit.productId,
          barcode: hit.barcode,
          name: hit.name,
          variant: hit.variant,
          qty: 1,
          salePrice: hit.salePrice,
          purchasePrice: hit.purchasePrice,
          qtyAvailable: hit.qtyAvailable,
          found: true,
          note: '',
        }]);
        setBarcodeInput('');
        return;
      }
      setNotFoundBarcode(normalized);
      setNfName('');
      setNfVariant('');
      setNfQty(1);
      setNfSalePrice('');
      setNfPurchasePrice('');
      setNfNote('');
      setIsNotFoundOpen(true);
    }
  };

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const onSubmitNotFound = () => {
    if (!notFoundBarcode) {
      setIsNotFoundOpen(false);
      return;
    }
    const qty = Number.isFinite(nfQty) && nfQty > 0 ? nfQty : 1;
    const priceParsed = nfSalePrice.trim() ? Number(nfSalePrice.replace(',', '.')) : null;
    const purchaseParsed = nfPurchasePrice.trim() ? Number(nfPurchasePrice.replace(',', '.')) : null;
    const newRow: ScannedRow = {
      productId: null,
      barcode: notFoundBarcode,
      name: nfName.trim() || '(zonder naam)',
      variant: nfVariant.trim() || null,
      qty,
      salePrice: Number.isFinite(priceParsed as number) ? (priceParsed as number) : null,
      purchasePrice: Number.isFinite(purchaseParsed as number) ? (purchaseParsed as number) : null,
      qtyAvailable: null,
      found: false,
      note: nfNote.trim() || '',
    };
    setRows(prev => [...prev, newRow]);
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
    setBarcodeInput('');
  };

  const onCancelNotFound = () => {
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
  };

  const updateRow = (index: number, patch: Partial<ScannedRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil leegmaken?')) {
      setRows([]);
    }
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(STORAGE_ROWS_KEY, JSON.stringify(rows));
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      // Also trigger JSON download as backup
      const blob = new Blob([JSON.stringify({ rows, settings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date();
      const name = `kelder-inventaris-draft-${formatTs(ts)}.json`;
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
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
      // reset input
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
        'Voorraad (Odoo)': r.qtyAvailable ?? '',
        'Opmerking': r.note ?? '',
        'ProductId': r.productId ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventaris');
      XLSX.writeFile(wb, `kelder-inventaris-${formatTs(new Date())}.xlsx`);
    } catch {
      setAlert('Export mislukt.');
    }
  };

  const syncLookups = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setAlert('Geen internet. Probeer later opnieuw.');
      return;
    }
    const unresolvedIdxs = rows
      .map((r, idx) => ({ r, idx }))
      .filter(x => !x.r.found || !x.r.productId);

    if (unresolvedIdxs.length === 0) {
      setAlert('Niets te synchroniseren.');
      return;
    }

    const cache = getCache();
    for (const { r, idx } of unresolvedIdxs) {
      try {
        const res = await fetch(`/api/odoo/lookup-by-barcode?barcode=${encodeURIComponent(r.barcode)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.found) {
          const updated: ScannedRow = {
            ...r,
            productId: data.productId ?? r.productId ?? null,
            name: data.name ?? r.name,
            variant: data.variant ?? r.variant,
            salePrice: data.salePrice ?? r.salePrice,
            purchasePrice: data.purchasePrice ?? r.purchasePrice,
            qtyAvailable: data.qtyAvailable ?? r.qtyAvailable,
            found: true,
          };
          setRows(prev => {
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
          cache[r.barcode] = {
            productId: updated.productId ?? 0,
            barcode: updated.barcode,
            name: updated.name,
            variant: updated.variant,
            qtyAvailable: updated.qtyAvailable,
            salePrice: updated.salePrice,
            purchasePrice: updated.purchasePrice,
          };
        }
      } catch {
        // ignore and continue
      }
    }
    setCache(cache);
    setAlert('Synchronisatie voltooid (waar mogelijk).');
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Kelder Inventaris</title>
        </Head>
        <main style={{ padding: 16 }}>
          Laden...
        </main>
      </>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Kelder Inventaris</title>
      </Head>
      <main style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Kelder Inventaris</h1>
        <p style={{ marginBottom: 16 }}>
          Scan barcodes met je barcodescanner. Bij een bestaande barcode wordt de hoeveelheid verhoogd. Onbestaand product kan je eenvoudig aanmaken en toevoegen aan de lijst.
        </p>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            ref={inputRef}
            placeholder="Scan of typ barcode en druk Enter"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleLookup(barcodeInput);
              }
            }}
            style={{ flex: 1, padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button
            onClick={() => void handleLookup(barcodeInput)}
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#f3f4f6' }}
          >
            Zoeken
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.fastScanIncrement}
              onChange={e => setSettings(prev => ({ ...prev, fastScanIncrement: e.target.checked }))}
            />
            Snelle scan (dubbel scannen verhoogt hoeveelheid)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.offlineMode}
              onChange={e => setSettings(prev => ({ ...prev, offlineMode: e.target.checked }))}
            />
            Offline modus (lookup overslaan)
          </label>
          <button onClick={syncLookups} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
            Synchroniseer lookups
          </button>
          <button onClick={saveDraft} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
            Opslaan (concept)
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Laden:</span>
            <select value={loadMode} onChange={e => setLoadMode(e.target.value as LoadMode)} style={{ padding: 4 }}>
              <option value="replace">Vervangen</option>
              <option value="merge">Samenvoegen</option>
            </select>
            <button onClick={loadDraftFromFile} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
              Kies JSON
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
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Barcode</th>
                <th style={thStyle}>Naam</th>
                <th style={thStyle}>Variant</th>
                <th style={thStyle}>Aantal</th>
                <th style={thStyle}>Verkoopprijs</th>
                <th style={thStyle}>Aankoopprijs</th>
                <th style={thStyle}>Gevonden</th>
                <th style={thStyle}>Voorraad (Odoo)</th>
                <th style={thStyle}>Opmerking</th>
                <th style={thStyle}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.barcode}-${i}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={tdStyle} title={r.barcode}>{r.barcode}</td>
                  <td style={tdStyle} title={r.name}>
                    <input
                      value={r.name}
                      onChange={e => updateRow(i, { name: e.target.value })}
                      title={r.name}
                      style={{ ...cellInputStyle, width: 320 }}
                    />
                  </td>
                  <td style={tdStyle} title={r.variant ?? ''}>
                    <input
                      value={r.variant ?? ''}
                      onChange={e => updateRow(i, { variant: e.target.value })}
                      title={r.variant ?? ''}
                      style={{ ...cellInputStyle, width: 240 }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      min={0}
                      value={r.qty}
                      onChange={e => updateRow(i, { qty: Number(e.target.value) || 0 })}
                      title={String(r.qty)}
                      style={{ ...cellInputStyle, width: 80 }}
                    />
                  </td>
                  <td style={tdStyle} title={r.salePrice == null ? '' : String(r.salePrice)}>
                    <input
                      type="number"
                      step="0.01"
                      value={r.salePrice ?? ''}
                      onChange={e => updateRow(i, { salePrice: e.target.value === '' ? null : Number(e.target.value) })}
                      title={r.salePrice == null ? '' : String(r.salePrice)}
                      style={{ ...cellInputStyle, width: 100 }}
                    />
                  </td>
                  <td style={tdStyle} title={r.purchasePrice == null ? '' : String(r.purchasePrice)}>
                    <input
                      type="number"
                      step="0.01"
                      value={r.purchasePrice ?? ''}
                      onChange={e => updateRow(i, { purchasePrice: e.target.value === '' ? null : Number(e.target.value) })}
                      title={r.purchasePrice == null ? '' : String(r.purchasePrice)}
                      style={{ ...cellInputStyle, width: 100 }}
                    />
                  </td>
                  <td style={tdStyle} title={r.found ? 'true' : 'false'}>{r.found ? 'true' : 'false'}</td>
                  <td style={{ ...tdStyle, width: 80, textAlign: 'right' }} title={r.qtyAvailable == null ? '' : String(r.qtyAvailable)}>{r.qtyAvailable ?? ''}</td>
                  <td style={tdStyle} title={r.note ?? ''}>
                    <input
                      value={r.note ?? ''}
                      onChange={e => updateRow(i, { note: e.target.value })}
                      title={r.note ?? ''}
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => removeRow(i)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
                      Verwijderen
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                    Nog geen items. Scan een barcode om te beginnen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {isNotFoundOpen ? (
          <div style={modalBackdropStyle} onClick={onCancelNotFound}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Niet gevonden</h3>
              <p style={{ marginTop: 0, marginBottom: 12 }}>Barcode: <strong>{notFoundBarcode}</strong></p>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={labelStyle}>
                  Naam
                  <input value={nfName} onChange={e => setNfName(e.target.value)} style={inputStyle} title={nfName} />
                </label>
                <label style={labelStyle}>
                  Variant
                  <input value={nfVariant} onChange={e => setNfVariant(e.target.value)} style={inputStyle} title={nfVariant} />
                </label>
                <label style={labelStyle}>
                  Aantal
                  <input type="number" min={1} value={nfQty} onChange={e => setNfQty(Number(e.target.value) || 1)} style={inputStyle} title={String(nfQty)} />
                </label>
                <label style={labelStyle}>
                  Verkoopprijs
                  <input type="number" step="0.01" value={nfSalePrice} onChange={e => setNfSalePrice(e.target.value)} style={inputStyle} title={nfSalePrice} />
                </label>
                <label style={labelStyle}>
                  Aankoopprijs
                  <input type="number" step="0.01" value={nfPurchasePrice} onChange={e => setNfPurchasePrice(e.target.value)} style={inputStyle} title={nfPurchasePrice} />
                </label>
                <label style={labelStyle}>
                  Opmerking
                  <input value={nfNote} onChange={e => setNfNote(e.target.value)} style={inputStyle} title={nfNote} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={onCancelNotFound} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}>
                  Annuleren
                </button>
                <button onClick={onSubmitNotFound} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#065f46' }}>
                  Toevoegen
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
};
const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 16,
  width: '100%',
  maxWidth: 520,
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
};


