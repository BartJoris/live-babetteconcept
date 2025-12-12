import { useState, useRef, useMemo } from 'react';
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
  matchedWithPosSales?: boolean;
};

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

type UploadShape = {
  rows: InventoryRow[];
  settings?: unknown;
};

export default function InventarisPosMatchPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [posSalesRows, setPosSalesRows] = useState<ScannedRow[]>([]);
  const [inventoryFileName, setInventoryFileName] = useState<string>('');
  const [posSalesFileName, setPosSalesFileName] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const inventoryFileRef = useRef<HTMLInputElement | null>(null);
  const posSalesFileRef = useRef<HTMLInputElement | null>(null);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  // Create Set of barcodes from POS sales for matching
  const posSalesBarcodes = useMemo(() => {
    const barcodeSet = new Set<string>();
    for (const row of posSalesRows) {
      const barcode = String(row.barcode).trim().toLowerCase();
      if (barcode && barcode !== 'geen-barcode') {
        barcodeSet.add(barcode);
      }
    }
    return barcodeSet;
  }, [posSalesRows]);

  // Check if a barcode is matched
  const isMatched = (barcode: string): boolean => {
    const normalized = String(barcode).trim().toLowerCase();
    return normalized.length > 0 && posSalesBarcodes.has(normalized);
  };

  // Statistics
  const stats = useMemo(() => {
    const total = inventoryRows.length;
    const matched = inventoryRows.filter(row => isMatched(row.barcode)).length;
    return { total, matched };
  }, [inventoryRows, posSalesBarcodes]);

  const handleInventoryFileSelect = () => {
    inventoryFileRef.current?.click();
  };

  const handleInventoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        setAlert('Geen geldige inventaris rijen gevonden in bestand.');
        return;
      }

      setInventoryRows(rows);
      setInventoryFileName(file.name);
      setAlert(`✅ ${rows.length} inventaris items geladen.`);
    } catch (error) {
      setAlert(`Fout bij laden inventaris: ${error instanceof Error ? error.message : 'Ongeldig JSON bestand'}`);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handlePosSalesFileSelect = () => {
    posSalesFileRef.current?.click();
  };

  const handlePosSalesFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { rows?: ScannedRow[]; settings?: unknown } | ScannedRow[];
      
      let rows: ScannedRow[] = [];
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (parsed && Array.isArray(parsed.rows)) {
        rows = parsed.rows;
      }

      if (rows.length === 0) {
        setAlert('Geen geldige POS verkopen rijen gevonden in bestand.');
        return;
      }

      setPosSalesRows(rows);
      setPosSalesFileName(file.name);
      setAlert(`✅ ${rows.length} POS verkopen items geladen.`);
    } catch (error) {
      setAlert(`Fout bij laden POS verkopen: ${error instanceof Error ? error.message : 'Ongeldig JSON bestand'}`);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const clearInventory = () => {
    if (confirm('Weet je zeker dat je de inventaris lijst wil wissen?')) {
      setInventoryRows([]);
      setInventoryFileName('');
    }
  };

  const clearPosSales = () => {
    if (confirm('Weet je zeker dat je de POS verkopen lijst wil wissen?')) {
      setPosSalesRows([]);
      setPosSalesFileName('');
    }
  };

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil wissen?')) {
      setInventoryRows([]);
      setPosSalesRows([]);
      setInventoryFileName('');
      setPosSalesFileName('');
    }
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const saveInventory = () => {
    if (inventoryRows.length === 0) {
      setAlert('Geen inventaris items om op te slaan.');
      return;
    }

    try {
      // Add matchedWithPosSales flag to each row
      const rowsWithMatchInfo: InventoryRow[] = inventoryRows.map(row => ({
        ...row,
        matchedWithPosSales: isMatched(row.barcode),
      }));

      const output: UploadShape = {
        rows: rowsWithMatchInfo,
      };

      const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fileName = `inventaris-pos-match-${formatTs(new Date())}.json`;
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      
      setAlert(`✅ Inventaris opgeslagen als ${fileName}`);
    } catch {
      setAlert('Opslaan mislukt.');
    }
  };

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Inventaris POS Match</title>
        </Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head>
        <title>Inventaris POS Match</title>
      </Head>
      <main style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Inventaris POS Match</h1>
        <p style={{ marginBottom: 16, color: '#6b7280' }}>
          Upload een inventaris bestand en een POS verkopen bestand. Producten die voorkomen in beide lijsten worden gemarkeerd.
        </p>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        {/* File Upload Section */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Inventaris Bestand</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={handleInventoryFileSelect} 
                style={{ 
                  padding: '8px 12px', 
                  borderRadius: 4, 
                  border: '1px solid #3b82f6', 
                  background: '#3b82f6', 
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Kies inventaris bestand
              </button>
              <input
                ref={inventoryFileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleInventoryFileChange}
              />
              {inventoryFileName && (
                <>
                  <span style={{ color: '#6b7280' }}>{inventoryFileName}</span>
                  <button 
                    onClick={clearInventory}
                    style={{ 
                      padding: '4px 8px', 
                      borderRadius: 4, 
                      border: '1px solid #dc2626', 
                      color: '#dc2626',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Verwijderen
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 300 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>POS Verkopen Bestand</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={handlePosSalesFileSelect} 
                style={{ 
                  padding: '8px 12px', 
                  borderRadius: 4, 
                  border: '1px solid #10b981', 
                  background: '#10b981', 
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Kies POS verkopen bestand
              </button>
              <input
                ref={posSalesFileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handlePosSalesFileChange}
              />
              {posSalesFileName && (
                <>
                  <span style={{ color: '#6b7280' }}>{posSalesFileName}</span>
                  <button 
                    onClick={clearPosSales}
                    style={{ 
                      padding: '4px 8px', 
                      borderRadius: 4, 
                      border: '1px solid #dc2626', 
                      color: '#dc2626',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Verwijderen
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Statistics */}
        {inventoryRows.length > 0 && (
          <div style={{ 
            display: 'flex', 
            gap: 16, 
            alignItems: 'center', 
            marginBottom: 16,
            padding: 12,
            background: '#f9fafb',
            borderRadius: 6,
            border: '1px solid #e5e7eb'
          }}>
            <div><strong>Totaal producten:</strong> {stats.total}</div>
            <div><strong>Gematcht met POS verkopen:</strong> {stats.matched}</div>
            <div><strong>Niet gematcht:</strong> {stats.total - stats.matched}</div>
            {stats.total > 0 && (
              <div style={{ marginLeft: 'auto', color: '#059669', fontWeight: 600 }}>
                {Math.round((stats.matched / stats.total) * 100)}% gematcht
              </div>
            )}
            <button 
              onClick={saveInventory}
              disabled={inventoryRows.length === 0}
              style={{ 
                padding: '6px 12px', 
                borderRadius: 4, 
                border: '1px solid #10b981', 
                background: '#10b981', 
                color: '#fff',
                cursor: inventoryRows.length === 0 ? 'not-allowed' : 'pointer',
                opacity: inventoryRows.length === 0 ? 0.5 : 1,
                fontWeight: 600
              }}
            >
              Opslaan als JSON
            </button>
            <button 
              onClick={clearAll}
              style={{ 
                padding: '6px 12px', 
                borderRadius: 4, 
                border: '1px solid #dc2626', 
                color: '#dc2626',
                cursor: 'pointer'
              }}
            >
              Alles wissen
            </button>
          </div>
        )}

        {/* Inventory Table */}
        {inventoryRows.length > 0 ? (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Inventaris Lijst ({inventoryRows.length} producten)
            </h2>
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={thStyle}>Barcode</th>
                    <th style={thStyle}>Naam</th>
                    <th style={thStyle}>Variant</th>
                    <th style={thStyle}>Aantal</th>
                    <th style={thStyle}>Verkoopprijs</th>
                    <th style={thStyle}>Voorraad</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRows.map((row, index) => {
                    const matched = isMatched(row.barcode);
                    const rowStyle: React.CSSProperties = {
                      borderTop: '1px solid #e5e7eb',
                      background: matched ? '#d1fae5' : undefined,
                    };
                    return (
                      <tr key={`${row.barcode}-${index}`} style={rowStyle}>
                        <td style={tdStyle} title={row.barcode}>{row.barcode}</td>
                        <td style={tdStyle} title={row.name}>{row.name}</td>
                        <td style={tdStyle} title={row.variant ?? ''}>{row.variant ?? ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.qty}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.salePrice ?? ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.qtyAvailable ?? ''}</td>
                        <td style={tdStyle}>
                          {matched ? (
                            <span style={{ 
                              color: '#059669', 
                              fontWeight: 600,
                              fontSize: 14
                            }}>
                              ✓ Verkocht
                            </span>
                          ) : (
                            <span style={{ color: '#6b7280' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ 
            padding: 24, 
            textAlign: 'center', 
            color: '#6b7280',
            border: '1px dashed #e5e7eb',
            borderRadius: 6,
            background: '#f9fafb'
          }}>
            Upload een inventaris bestand om te beginnen.
          </div>
        )}
      </main>
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 12,
  borderRight: '1px solid #e5e7eb',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
  fontSize: 14,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: 12,
  borderRight: '1px solid #e5e7eb',
  verticalAlign: 'top',
  fontSize: 14,
};

