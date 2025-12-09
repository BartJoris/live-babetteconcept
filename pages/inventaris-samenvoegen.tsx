import { useState, useRef, useEffect } from 'react';
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

type LoadedFile = {
  name: string;
  rows: InventoryRow[];
  rowCount: number;
};

const STORAGE_DRAFT_NAME_KEY = 'inventarisSamenvoegenDraftName';

export default function VoorraadSamenvoegenPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [mergedRows, setMergedRows] = useState<InventoryRow[]>([]);
  const [draftName, setDraftName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load draft name from localStorage
  useEffect(() => {
    try {
      const rawDraftName = localStorage.getItem(STORAGE_DRAFT_NAME_KEY);
      if (rawDraftName) {
        setDraftName(rawDraftName);
      }
    } catch {
      // ignore
    }
  }, []);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: LoadedFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as UploadShape | InventoryRow[] | { rows?: InventoryRow[] };
        
        let rows: InventoryRow[] = [];
        if (Array.isArray(parsed)) {
          rows = parsed;
        } else if (parsed && Array.isArray(parsed.rows)) {
          rows = parsed.rows;
        } else if (parsed && 'rows' in parsed && Array.isArray((parsed as any).rows)) {
          rows = (parsed as any).rows;
        }

        if (rows.length === 0) {
          errors.push(`${file.name}: Geen geldige rijen gevonden`);
          continue;
        }

        newFiles.push({
          name: file.name,
          rows,
          rowCount: rows.length,
        });
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Ongeldig JSON bestand'}`);
      }
    }

    if (newFiles.length > 0) {
      setLoadedFiles(prev => [...prev, ...newFiles]);
      setAlert(`${newFiles.length} bestand(en) geladen.`);
    }

    if (errors.length > 0) {
      setAlert(`Fouten: ${errors.join('; ')}`);
    }

    // Reset file input
    if (e.target) e.target.value = '';
  };

  const removeFile = (index: number) => {
    setLoadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const mergeFiles = () => {
    if (loadedFiles.length === 0) {
      setAlert('Geen bestanden geladen om samen te voegen.');
      return;
    }

    // Merge all rows by barcode (like kelder-inventaris merge mode)
    const mergedMap = new Map<string, InventoryRow>();

    for (const file of loadedFiles) {
      for (const row of file.rows) {
        const barcode = String(row.barcode).trim();
        if (!barcode) continue;

        const existing = mergedMap.get(barcode);
        if (existing) {
          // Merge: sum quantities, keep other fields from first occurrence or best match
          mergedMap.set(barcode, {
            ...existing,
            qty: (existing.qty || 0) + (row.qty || 0),
            // Keep productId if available
            productId: existing.productId ?? row.productId ?? null,
            // Keep found status if true
            found: existing.found || row.found,
            // Keep qtyAvailable if available
            qtyAvailable: existing.qtyAvailable ?? row.qtyAvailable ?? null,
            // Keep prices if available
            salePrice: existing.salePrice ?? row.salePrice ?? null,
            purchasePrice: existing.purchasePrice ?? row.purchasePrice ?? null,
            // Merge notes
            note: [existing.note, row.note].filter(Boolean).join('; ') || undefined,
          });
        } else {
          mergedMap.set(barcode, { ...row });
        }
      }
    }

    const merged = Array.from(mergedMap.values());
    setMergedRows(merged);
    setAlert(`✅ ${merged.length} unieke producten samengevoegd uit ${loadedFiles.length} bestand(en).`);
  };

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil wissen?')) {
      setLoadedFiles([]);
      setMergedRows([]);
    }
  };

  const openSaveModal = () => {
    if (mergedRows.length === 0) {
      setAlert('Geen samengevoegde rijen om op te slaan.');
      return;
    }
    setShowSaveModal(true);
  };

  const saveMerged = () => {
    try {
      const baseName = draftName.trim() || 'inventaris-samenvoegen';
      const ts = new Date();
      const timestamp = formatTs(ts);
      const fileName = `${baseName}-${timestamp}.json`;
      
      // Save in format compatible with inventaris-analyse
      const output: UploadShape = {
        rows: mergedRows,
      };

      const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      
      localStorage.setItem(STORAGE_DRAFT_NAME_KEY, baseName);
      setShowSaveModal(false);
      setAlert(`✅ Bestand opgeslagen als ${fileName}`);
    } catch {
      setAlert('Opslaan mislukt.');
    }
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const totalRows = loadedFiles.reduce((sum, f) => sum + f.rowCount, 0);
  const uniqueBarcodes = new Set(loadedFiles.flatMap(f => f.rows.map(r => String(r.barcode).trim()))).size;

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Inventaris Samenvoegen</title>
        </Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head>
        <title>Inventaris Samenvoegen</title>
      </Head>
      <main style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Inventaris Samenvoegen</h1>
        <p style={{ marginBottom: 16, color: '#6b7280' }}>
          Laad meerdere draft bestanden van inventaris-maken en voeg ze samen tot één lijst. 
          Producten met dezelfde barcode worden samengevoegd (hoeveelheden worden opgeteld).
        </p>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <button 
            onClick={handleFileSelect} 
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#f3f4f6' }}
          >
            Kies inventaris bestanden (meerdere)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button 
            onClick={mergeFiles}
            disabled={loadedFiles.length === 0}
            style={{ 
              padding: '8px 12px', 
              borderRadius: 4, 
              border: '1px solid #10b981', 
              background: '#ecfdf5', 
              color: '#065f46',
              opacity: loadedFiles.length === 0 ? 0.5 : 1,
              cursor: loadedFiles.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Samenvoegen
          </button>
          <button 
            onClick={openSaveModal}
            disabled={mergedRows.length === 0}
            style={{ 
              padding: '8px 12px', 
              borderRadius: 4, 
              border: '1px solid #2563eb', 
              background: '#eff6ff', 
              color: '#1e40af',
              opacity: mergedRows.length === 0 ? 0.5 : 1,
              cursor: mergedRows.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Opslaan
          </button>
          <button 
            onClick={clearAll}
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #dc2626', color: '#dc2626' }}
          >
            Alles wissen
          </button>
          {loadedFiles.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span><strong>Bestanden:</strong> {loadedFiles.length}</span>
              <span><strong>Rijen:</strong> {totalRows}</span>
              <span><strong>Unieke barcodes:</strong> {uniqueBarcodes}</span>
            </div>
          )}
        </div>

        {/* Loaded Files List */}
        {loadedFiles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Geladen bestanden</h2>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={thStyle}>Bestandsnaam</th>
                    <th style={thStyle}>Aantal rijen</th>
                    <th style={thStyle}>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {loadedFiles.map((file, index) => (
                    <tr key={index} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>{file.name}</td>
                      <td style={tdStyle}>{file.rowCount}</td>
                      <td style={tdStyle}>
                        <button 
                          onClick={() => removeFile(index)}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #dc2626', color: '#dc2626', fontSize: 12 }}
                        >
                          Verwijderen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Merged Rows Preview */}
        {mergedRows.length > 0 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Samengevoegde lijst ({mergedRows.length} producten)
            </h2>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={thStyle}>Barcode</th>
                    <th style={thStyle}>Naam</th>
                    <th style={thStyle}>Aantal</th>
                    <th style={thStyle}>Gevonden</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.slice(0, 100).map((row, index) => (
                    <tr key={index} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>{row.barcode}</td>
                      <td style={tdStyle} title={row.name}>{row.name}</td>
                      <td style={tdStyle}>{row.qty}</td>
                      <td style={tdStyle}>{row.found ? 'Ja' : 'Nee'}</td>
                    </tr>
                  ))}
                  {mergedRows.length > 100 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                        ... en nog {mergedRows.length - 100} producten
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Save Modal */}
        {showSaveModal ? (
          <div style={modalBackdropStyle} onClick={() => setShowSaveModal(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Samengevoegde lijst opslaan</h3>
              <p style={{ marginTop: 0, marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
                Geef een naam op voor dit bestand. Het bestand kan daarna gebruikt worden bij inventaris-analyse.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={labelStyle}>
                  Bestandsnaam (zonder extensie)
                  <input 
                    value={draftName} 
                    onChange={e => setDraftName(e.target.value)} 
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveMerged();
                      }
                    }}
                    placeholder="inventaris-samenvoegen"
                    style={inputStyle} 
                    autoFocus
                  />
                  {draftName && (
                    <span style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Bestand wordt opgeslagen als: <strong>{draftName}-{formatTs(new Date())}.json</strong>
                    </span>
                  )}
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button 
                  onClick={() => setShowSaveModal(false)} 
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}
                >
                  Annuleren
                </button>
                <button 
                  onClick={saveMerged} 
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#065f46' }}
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
  zIndex: 1000,
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

