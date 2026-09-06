import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';
import { downloadRowsAsXlsx } from '../lib/excelIo';

type LookupResult = {
  found: true;
  productId: number;
  barcode: string;
  name: string;
  variant: string | null;
  qtyAvailable: number | null;
  salePrice: number | null;
  purchasePrice: number | null;
};

type PendingItem = {
  id: string;
  barcode: string;
  productId: number;
  name: string;
  variant: string | null;
  odooQty: number;
  manualQty: number | null;
  salePrice: number | null;
  processing: boolean;
};

type DonationItem = {
  barcode: string;
  productId: number;
  name: string;
  variant: string | null;
  stockBefore: number;
  stockAfter: number;
  adjusted: boolean;
  timestamp: string;
};

const STORAGE_KEY = 'benefietScannerState';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function BenefietScannerPage() {
  const { isLoading, isLoggedIn } = useAuth(true);

  const [barcode, setBarcode] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [donations, setDonations] = useState<DonationItem[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'info'>('info');
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Restore state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { donations?: DonationItem[]; pending?: PendingItem[] };
        if (Array.isArray(parsed.donations)) setDonations(parsed.donations);
        if (Array.isArray(parsed.pending)) setPending(parsed.pending.map(p => ({ ...p, processing: false })));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ donations, pending }));
    } catch {
      // ignore
    }
  }, [donations, pending]);

  const showAlert = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertMessage(msg);
    setAlertType(type);
    setTimeout(() => setAlertMessage(null), 4000);
  }, []);

  const focusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 100);
  }, []);

  // Scan → add to pending list
  const lookupBarcode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLookupLoading(true);
    setLookupError(null);

    try {
      const res = await fetch(`/api/odoo/lookup-by-barcode?barcode=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      if (!data.found) {
        setLookupError(`Product met barcode "${trimmed}" niet gevonden.`);
        return;
      }
      const product = data as LookupResult;
      const item: PendingItem = {
        id: uid(),
        barcode: product.barcode,
        productId: product.productId,
        name: product.name,
        variant: product.variant,
        odooQty: product.qtyAvailable ?? 0,
        manualQty: null,
        salePrice: product.salePrice,
        processing: false,
      };
      setPending(prev => [item, ...prev]);
      setSelected(prev => ({ ...prev, [item.id]: true }));
      setBarcode('');
      showAlert(`${product.name} toegevoegd aan wachtrij.`, 'info');
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Opzoeken mislukt.');
    } finally {
      setLookupLoading(false);
      focusBarcode();
    }
  }, [focusBarcode, showAlert]);

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    lookupBarcode(barcode);
  };

  // Process a single item: decrease stock by 1
  const confirmSingle = useCallback(async (item: PendingItem) => {
    const effectiveStock = item.manualQty ?? item.odooQty;
    if (effectiveStock <= 0) {
      showAlert(`${item.name}: voorraad is 0, kan niet verminderen.`, 'error');
      return;
    }

    setPending(prev => prev.map(p => p.id === item.id ? { ...p, processing: true } : p));

    try {
      // If manual adjustment, first set the correct quantity
      if (item.manualQty !== null && item.manualQty !== item.odooQty) {
        const setRes = await fetch('/api/odoo/update-product-quantities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [{ productId: item.productId, newQuantity: item.manualQty }],
          }),
        });
        if (!setRes.ok) throw new Error('Voorraad aanpassen mislukt.');
      }

      // Decrease by 1
      const res = await fetch('/api/odoo/update-product-quantities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ productId: item.productId, newQuantity: effectiveStock - 1 }],
        }),
      });
      if (!res.ok) throw new Error('Voorraad verminderen mislukt.');

      const donation: DonationItem = {
        barcode: item.barcode,
        productId: item.productId,
        name: item.name,
        variant: item.variant,
        stockBefore: effectiveStock,
        stockAfter: effectiveStock - 1,
        adjusted: item.manualQty !== null && item.manualQty !== item.odooQty,
        timestamp: new Date().toISOString(),
      };
      setDonations(prev => [donation, ...prev]);
      setPending(prev => prev.filter(p => p.id !== item.id));
      setSelected(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      return true;
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Fout bij verwerken.', 'error');
      setPending(prev => prev.map(p => p.id === item.id ? { ...p, processing: false } : p));
      return false;
    }
  }, [showAlert]);

  // Confirm all selected items
  const confirmSelected = useCallback(async () => {
    const selectedItems = pending.filter(p => selected[p.id] && !p.processing);
    if (selectedItems.length === 0) {
      showAlert('Geen items geselecteerd.', 'info');
      return;
    }

    setBulkProcessing(true);
    let ok = 0;
    let fail = 0;
    for (const item of selectedItems) {
      const result = await confirmSingle(item);
      if (result) ok++; else fail++;
    }
    setBulkProcessing(false);

    if (fail === 0) {
      showAlert(`✓ ${ok} ${ok === 1 ? 'product' : 'producten'} verwerkt.`, 'success');
    } else {
      showAlert(`${ok} verwerkt, ${fail} mislukt.`, 'error');
    }
    focusBarcode();
  }, [pending, selected, confirmSingle, showAlert, focusBarcode]);

  const removePending = (id: string) => {
    setPending(prev => prev.filter(p => p.id !== id));
    setSelected(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const allSelected = pending.length > 0 && pending.every(p => selected[p.id]);
  const toggleSelectAll = () => {
    const target = !allSelected;
    const next: Record<string, boolean> = {};
    for (const p of pending) next[p.id] = target;
    setSelected(next);
  };

  const selectedCount = pending.filter(p => selected[p.id]).length;

  const updateManualQty = (id: string, value: number | null) => {
    setPending(prev => prev.map(p => p.id === id ? { ...p, manualQty: value } : p));
  };

  const removeDonation = (idx: number) => {
    setDonations(prev => prev.filter((_, i) => i !== idx));
  };

  const exportDonations = async () => {
    if (donations.length === 0) {
      showAlert('Geen producten om te exporteren.', 'info');
      return;
    }
    const rows = donations.map(d => ({
      Productnaam: d.name,
      Variant: d.variant ?? '',
    }));
    const ts = new Date().toISOString().slice(0, 10);
    await downloadRowsAsXlsx(rows, 'Benefiet donatie', `benefiet-donatie-${ts}.xlsx`);
    showAlert('Excel gedownload.', 'success');
  };

  const clearAll = () => {
    if (donations.length > 0 && !window.confirm(`${donations.length} gedoneerde items wissen?`)) return;
    setDonations([]);
  };

  const clearPending = () => {
    if (pending.length > 0 && !window.confirm(`${pending.length} items uit wachtrij wissen?`)) return;
    setPending([]);
    setSelected({});
  };

  const uniqueDonated = new Set(donations.map(d => d.barcode)).size;

  if (isLoading) {
    return (
      <>
        <Head><title>Benefiet Scanner</title></Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }
  if (!isLoggedIn) return null;

  return (
    <>
      <Head><title>Benefiet Scanner</title></Head>
      <main style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🎁 Benefiet Scanner</h1>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>
          Scan producten → bekijk voorraad → bevestig per lijn of alle geselecteerden.
        </p>

        {alertMessage && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 12,
            background: alertType === 'success' ? '#d1fae5' : alertType === 'error' ? '#fee2e2' : '#fff3cd',
            color: alertType === 'success' ? '#065f46' : alertType === 'error' ? '#991b1b' : '#664d03',
            fontWeight: 500,
          }}>
            {alertMessage}
          </div>
        )}

        {/* Barcode scan input — always visible */}
        <form onSubmit={handleBarcodeScan} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={barcodeRef}
              type="text"
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              placeholder="Scan barcode of typ barcode…"
              autoFocus
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: 18,
                border: '2px solid #3b82f6',
                borderRadius: 8,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={lookupLoading || !barcode.trim()}
              style={{
                padding: '12px 20px',
                fontSize: 16,
                fontWeight: 600,
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: lookupLoading ? 'wait' : 'pointer',
                opacity: lookupLoading || !barcode.trim() ? 0.6 : 1,
              }}
            >
              {lookupLoading ? 'Zoeken…' : 'Zoek'}
            </button>
          </div>
          {lookupError && (
            <p style={{ color: '#dc2626', marginTop: 8, fontWeight: 500 }}>{lookupError}</p>
          )}
        </form>

        {/* ====== PENDING / WACHTRIJ ====== */}
        {pending.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
                Wachtrij — {pending.length} {pending.length === 1 ? 'product' : 'producten'}
              </h2>
              <button
                onClick={confirmSelected}
                disabled={bulkProcessing || selectedCount === 0}
                style={{
                  padding: '8px 18px',
                  fontSize: 15,
                  fontWeight: 700,
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: bulkProcessing || selectedCount === 0 ? 'not-allowed' : 'pointer',
                  opacity: bulkProcessing || selectedCount === 0 ? 0.5 : 1,
                }}
              >
                {bulkProcessing
                  ? 'Verwerken…'
                  : `✓ Bevestig geselecteerden (${selectedCount})`}
              </button>
              <button
                onClick={clearPending}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  background: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Wis wachtrij
              </button>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 24 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={thStyle}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th style={thStyle}>Productnaam</th>
                    <th style={thStyle}>Variant</th>
                    <th style={thStyle}>Barcode</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Odoo voorraad</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Aanpassen</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Na -1</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(item => {
                    const effective = item.manualQty ?? item.odooQty;
                    const afterDecrease = effective - 1;
                    const canConfirm = effective > 0 && !item.processing;
                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderTop: '1px solid #e5e7eb',
                          background: item.processing ? '#fef9c3' : selected[item.id] ? '#f0fdf4' : undefined,
                          opacity: item.processing ? 0.7 : 1,
                        }}
                      >
                        <td style={tdStyle}>
                          <input
                            type="checkbox"
                            checked={!!selected[item.id]}
                            onChange={() => toggleSelect(item.id)}
                            disabled={item.processing}
                          />
                        </td>
                        <td style={tdStyle}>{item.name}</td>
                        <td style={tdStyle}>{item.variant ?? ''}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 13 }}>{item.barcode}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{item.odooQty}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input
                            type="number"
                            min={0}
                            value={item.manualQty ?? item.odooQty}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              if (Number.isFinite(val) && val >= 0) {
                                updateManualQty(item.id, val === item.odooQty ? null : val);
                              }
                            }}
                            disabled={item.processing}
                            style={{
                              width: 64,
                              padding: '4px 6px',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              textAlign: 'center',
                              fontSize: 14,
                              background: item.manualQty !== null ? '#fef3c7' : '#fff',
                            }}
                          />
                        </td>
                        <td style={{
                          ...tdStyle,
                          textAlign: 'center',
                          fontWeight: 700,
                          color: afterDecrease < 0 ? '#dc2626' : '#059669',
                        }}>
                          {afterDecrease < 0 ? '⚠️ 0' : afterDecrease}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => confirmSingle(item)}
                            disabled={!canConfirm}
                            style={{
                              padding: '4px 12px',
                              fontSize: 13,
                              fontWeight: 600,
                              background: canConfirm ? '#10b981' : '#d1d5db',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              cursor: canConfirm ? 'pointer' : 'not-allowed',
                              marginRight: 4,
                            }}
                          >
                            {item.processing ? '…' : '-1'}
                          </button>
                          <button
                            onClick={() => removePending(item.id)}
                            disabled={item.processing}
                            style={{
                              padding: '4px 8px',
                              fontSize: 12,
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              background: '#f9fafb',
                              color: '#6b7280',
                              cursor: 'pointer',
                            }}
                            title="Verwijder uit wachtrij"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ====== DONATED / GEDONEERD ====== */}
        <div style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '10px 14px',
          background: '#f9fafb',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          marginBottom: 12,
        }}>
          <span><strong>Gedoneerd:</strong> {donations.length} stuks</span>
          <span><strong>Unieke producten:</strong> {uniqueDonated}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={exportDonations}
              disabled={donations.length === 0}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: donations.length === 0 ? 'not-allowed' : 'pointer',
                opacity: donations.length === 0 ? 0.5 : 1,
              }}
            >
              📥 Exporteer Excel
            </button>
            <button
              onClick={clearAll}
              disabled={donations.length === 0}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: '#fee2e2',
                color: '#991b1b',
                border: '1px solid #fca5a5',
                borderRadius: 6,
                cursor: donations.length === 0 ? 'not-allowed' : 'pointer',
                opacity: donations.length === 0 ? 0.5 : 1,
              }}
            >
              Wis lijst
            </button>
          </div>
        </div>

        {donations.length > 0 && (
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Productnaam</th>
                  <th style={thStyle}>Variant</th>
                  <th style={thStyle}>Barcode</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Voorraad voor</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Voorraad na</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Aangepast</th>
                  <th style={thStyle}>Tijdstip</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d, idx) => (
                  <tr key={`${d.barcode}-${d.timestamp}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>{donations.length - idx}</td>
                    <td style={tdStyle}>{d.name}</td>
                    <td style={tdStyle}>{d.variant ?? ''}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 13 }}>{d.barcode}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{d.stockBefore}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{d.stockAfter}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {d.adjusted ? <span style={{ color: '#f59e0b' }}>✎</span> : ''}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 13, color: '#6b7280' }}>
                      {new Date(d.timestamp).toLocaleTimeString('nl-BE')}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => removeDonation(idx)}
                        style={{
                          padding: '2px 8px',
                          border: '1px solid #fca5a5',
                          borderRadius: 4,
                          background: '#fee2e2',
                          color: '#991b1b',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                        title="Verwijder uit lijst (voorraad wordt niet teruggedraaid)"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pending.length === 0 && donations.length === 0 && (
          <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: 32 }}>
            Nog geen producten gescand. Begin met scannen hierboven.
          </p>
        )}
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
  fontSize: 13,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: 8,
  verticalAlign: 'top',
  borderRight: '1px solid #e5e7eb',
};
