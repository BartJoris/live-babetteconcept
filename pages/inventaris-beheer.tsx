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

type SavedInventory = {
  id: string;
  name: string;
  timestamp: string;
  rowCount: number;
  data?: { rows: InventoryRow[]; settings?: unknown };
  storage: 'local';
};

const STORAGE_KEY = 'savedInventories';

function getLocalInventories(): SavedInventory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).map((inv: SavedInventory) => ({ ...inv, storage: 'local' as const })) : [];
  } catch {
    return [];
  }
}

function saveLocalInventories(inventories: SavedInventory[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventories));
  } catch {
    // storage quota exceeded or other error
  }
}

export default function InventarisBeheerPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [localInventories, setLocalInventories] = useState<SavedInventory[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadLocalInventories = () => {
    setLocalInventories(getLocalInventories());
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadLocalInventories();
    }
  }, [isLoggedIn]);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { rows?: InventoryRow[]; settings?: unknown } | InventoryRow[];

      let rows: InventoryRow[] = [];
      let settings: unknown = undefined;

      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (parsed && Array.isArray(parsed.rows)) {
        rows = parsed.rows;
        settings = parsed.settings;
      } else {
        setAlert('Ongeldig bestandsformaat.');
        return;
      }

      if (rows.length === 0) {
        setAlert('Geen rijen gevonden in bestand.');
        return;
      }

      const baseName = file.name.replace(/\.json$/i, '') || `inventaris-${formatTs(new Date())}`;
      setSaveName(baseName);
      setShowSaveModal(true);
      (window as any).__tempInventoryData = { rows, settings };
    } catch (error) {
      setAlert(`Fout bij lezen: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = async () => {
    const tempData = (window as any).__tempInventoryData;
    if (!tempData) {
      setAlert('Geen data om op te slaan.');
      return;
    }

    const name = saveName.trim() || `inventaris-${formatTs(new Date())}`;

    try {
      // Save to localStorage
      const id = `${name}-${Date.now()}`;
      const newInventory: SavedInventory = {
        id,
        name,
        timestamp: new Date().toISOString(),
        rowCount: tempData.rows.length,
        data: tempData,
        storage: 'local',
      };

      const updated = [...localInventories, newInventory];
      setLocalInventories(updated);
      saveLocalInventories(updated);
      setAlert(`Inventaris "${name}" lokaal opgeslagen (${tempData.rows.length} items)`);

      setShowSaveModal(false);
      setSaveName('');
      delete (window as any).__tempInventoryData;
    } catch (error) {
      setAlert(`Fout bij opslaan: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    }
  };

  const handleDelete = async (inventory: SavedInventory) => {
    if (!confirm('Weet je zeker dat je deze inventaris wilt verwijderen?')) {
      return;
    }

    try {
      const updated = localInventories.filter(inv => inv.id !== inventory.id);
      setLocalInventories(updated);
      saveLocalInventories(updated);
      setAlert('Inventaris verwijderd.');
    } catch (error) {
      setAlert(`Fout bij verwijderen: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    }
  };

  const handleDownload = async (inventory: SavedInventory) => {
    try {
      // Download from localStorage
      if (!inventory.data) {
        setAlert('Geen data beschikbaar.');
        return;
      }
      const blob = new Blob([JSON.stringify(inventory.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inventory.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setAlert(`"${inventory.name}" gedownload.`);
    } catch (error) {
      setAlert(`Fout bij downloaden: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    }
  };

  const handleQuickSave = () => {
    try {
      const rawRows = localStorage.getItem('kelderInventarisRows');
      const rawSettings = localStorage.getItem('kelderInventarisSettings');
      
      if (!rawRows) {
        setAlert('Geen actieve inventaris gevonden. Ga naar "Inventaris maken" om eerst een inventaris te scannen.');
        return;
      }

      const rows = JSON.parse(rawRows) as InventoryRow[];
      const settings = rawSettings ? JSON.parse(rawSettings) : undefined;

      if (!Array.isArray(rows) || rows.length === 0) {
        setAlert('Geen rijen gevonden in actieve inventaris.');
        return;
      }

      const name = `inventaris-${formatTs(new Date())}`;
      setSaveName(name);
      (window as any).__tempInventoryData = { rows, settings };
      setShowSaveModal(true);
    } catch (error) {
      setAlert(`Fout bij ophalen actieve inventaris: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
    }
  };

  const allInventories = [...localInventories].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Inventaris beheer</title>
        </Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head>
        <title>Inventaris beheer</title>
      </Head>
      <main style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Inventaris beheer</h1>
        <p style={{ marginBottom: 16, color: '#6b7280' }}>
          Upload inventarisbestanden of sla de actieve inventaris snel op. Beheer al je opgeslagen inventarissen op één plek.
        </p>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            onClick={handleQuickSave}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid #10b981',
              background: '#10b981',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            💾 Sla actieve inventaris op
          </button>
          <button
            onClick={handleFileSelect}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid #3b82f6',
              background: '#3b82f6',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            📤 Upload inventarisbestand
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ background: '#f9fafb', padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
              Opgeslagen inventarissen ({allInventories.length})
            </h2>
          </div>
          {allInventories.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
              Nog geen inventarissen opgeslagen. Upload een bestand of sla de actieve inventaris op.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={thStyle}>Naam</th>
                    <th style={thStyle}>Opslag</th>
                    <th style={thStyle}>Items</th>
                    <th style={thStyle}>Datum</th>
                    <th style={thStyle}>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {allInventories.map((inventory) => (
                    <tr key={inventory.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{inventory.name}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          background: '#eff6ff',
                          color: '#1e40af',
                        }}>
                          💾 Lokaal
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {inventory.rowCount > 0 ? inventory.rowCount : '-'}
                      </td>
                      <td style={tdStyle}>
                        {new Date(inventory.timestamp).toLocaleString('nl-NL', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleDownload(inventory)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: '1px solid #3b82f6',
                              background: '#eff6ff',
                              color: '#1e40af',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            Download
                          </button>
                          <button
                            onClick={() => handleDelete(inventory)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: '1px solid #dc2626',
                              background: '#fef2f2',
                              color: '#dc2626',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            Verwijder
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showSaveModal ? (
          <div style={modalBackdropStyle} onClick={() => setShowSaveModal(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Inventaris opslaan</h3>
              <p style={{ marginTop: 0, marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
                Geef een naam op voor de inventaris.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={labelStyle}>
                  Naam
                  <input
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSave();
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
                    setSaveName('');
                    delete (window as any).__tempInventoryData;
                  }}
                  style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                >
                  Annuleren
                </button>
                <button
                  onClick={() => void handleSave()}
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
