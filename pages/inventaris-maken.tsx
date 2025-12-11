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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
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
        // move updated row to the top so newest scan appears first
        const [updated] = next.splice(existingIndex, 1);
        setRows([updated, ...next]);
        setBarcodeInput('');
        return;
      }
    }

    // Geen internet: gebruik cache of open formulier
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cache = getCache();
      const hit = cache[normalized];
      if (hit) {
        setRows(prev => [{
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
        }, ...prev]);
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
      playBeep();
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
        setRows(prev => [newRow, ...prev]);
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
        playBeep();
        setIsNotFoundOpen(true);
      }
    } catch {
      // Fout: probeer cache, anders open formulier
      const cache = getCache();
      const hit = cache[normalized];
      if (hit) {
        setRows(prev => [{
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
        }, ...prev]);
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
      playBeep();
      setIsNotFoundOpen(true);
    }
  };

  const playBeep = () => {
    try {
      // Create audio context for beep sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure beep sound (440Hz, 200ms)
      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      // Fallback: try to play a simple beep using Audio
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8OUKjk8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUqgc7y2Yk2CBtpvfDkn00PDlCo5PC2YxwGOJHX8sx5LAUkd8fw3ZBAC');
        audio.volume = 0.3;
        void audio.play();
      } catch {
        // Silently fail if audio is not supported
      }
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
    setRows(prev => [newRow, ...prev]);
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
    setBarcodeInput('');
    setTimeout(() => { inputRef.current?.focus(); }, 100);
  };

  const onCancelNotFound = () => {
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
    setTimeout(() => { inputRef.current?.focus(); }, 100);
  };

  const updateRow = (index: number, patch: Partial<ScannedRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  // removeRow - kept for future UI integration
  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };
  // Mark as used to satisfy TypeScript strict mode
  if (false) void removeRow;

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil leegmaken?')) {
      setRows([]);
    }
  };

  const saveDraft = () => {
    // Show modal to let user choose filename
    const defaultName = `inventaris-${formatTs(new Date())}`;
    setSaveFileName(defaultName);
    setShowSaveModal(true);
  };

  const handleSaveConfirm = () => {
    try {
      localStorage.setItem(STORAGE_ROWS_KEY, JSON.stringify(rows));
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      
      // Trigger JSON download with user-chosen name
      const blob = new Blob([JSON.stringify({ rows, settings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fileName = saveFileName.trim() || `inventaris-${formatTs(new Date())}`;
      const finalName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
      a.href = url;
      a.download = finalName;
      a.click();
      URL.revokeObjectURL(url);
      setShowSaveModal(false);
      setSaveFileName('');
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


  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Inventaris maken</title>
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
        <title>Inventaris maken</title>
      </Head>
      <main style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Inventaris maken</h1>
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
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ ...thStyle, borderLeft: '1px solid #e5e7eb' }}>Barcode</th>
                <th style={thStyle}>Variant</th>
                <th style={thStyle}>Aantal</th>
                <th style={thStyle}>Voorraad (Odoo)</th>
                <th style={thStyle}>Opmerking</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.barcode}-${i}`} style={{ borderTop: '1px solid #e5e7eb', fontWeight: i === 0 ? 'bold' : undefined }}>
                  <td style={{ ...tdStyle, borderLeft: '1px solid #e5e7eb' }} title={r.barcode}>{r.barcode}</td>
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
                      onBlur={() => setTimeout(() => { inputRef.current?.focus(); }, 100)}
                      title={String(r.qty)}
                      style={{ ...cellInputStyle, width: 80 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 80, textAlign: 'right' }} title={r.qtyAvailable == null ? '' : String(r.qtyAvailable)}>{r.qtyAvailable ?? ''}</td>
                  <td style={tdStyle} title={r.note ?? ''}>
                    <input
                      value={r.note ?? ''}
                      onChange={e => updateRow(i, { note: e.target.value })}
                      onBlur={() => setTimeout(() => { inputRef.current?.focus(); }, 100)}
                      title={r.note ?? ''}
                      style={cellInputStyle}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#6b7280', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                    Nog geen items. Scan een barcode om te beginnen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {showSaveModal ? (
          <div style={modalBackdropStyle} onClick={() => setShowSaveModal(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Inventaris opslaan</h3>
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
                    placeholder="inventaris-naam"
                  />
                </label>
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
  borderRight: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: 8,
  verticalAlign: 'top',
  borderRight: '1px solid #e5e7eb',
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


