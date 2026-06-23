import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';

type LabelRow = {
  productId: number | null;
  barcode: string;
  name: string;
  variant: string | null;
  qty: number;
  price: number | null;
  qtyAvailable: number | null;
  found: boolean;
};

const STORAGE_KEY = 'labelPrintenRows';

export default function LabelPrintenPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<'info' | 'success' | 'error'>('info');
  const [isLookingUp, setIsLookingUp] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isLookingUp) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isLookingUp]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LabelRow[];
        if (Array.isArray(parsed)) setRows(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
  }, [rows]);

  const setAlert = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setAlertMessage(msg);
    setAlertType(type);
    setTimeout(() => setAlertMessage(null), 4000);
  };

  const clearBarcodeInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const totals = useMemo(() => {
    let totalItems = 0;
    for (const r of rows) totalItems += r.qty;
    return { totalItems, uniqueProducts: rows.length };
  }, [rows]);

  const handleLookup = async (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) {
      setAlert('Lege barcode. Probeer opnieuw.', 'error');
      return;
    }

    const existingIndex = rows.findIndex(r => r.barcode === normalized);
    if (existingIndex >= 0) {
      const next = [...rows];
      next[existingIndex] = { ...next[existingIndex], qty: next[existingIndex].qty + 1 };
      const [updated] = next.splice(existingIndex, 1);
      setRows([updated, ...next]);
      clearBarcodeInput();
      return;
    }

    setIsLookingUp(true);
    try {
      const res = await fetch(`/api/odoo/lookup-product-for-stock?barcode=${encodeURIComponent(normalized)}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      if (data && data.found) {
        setRows(prev => [{
          productId: data.productId ?? null,
          barcode: data.barcode ?? normalized,
          name: data.name ?? '',
          variant: data.variant ?? null,
          qty: 1,
          price: data.salePrice ?? null,
          qtyAvailable: data.qtyAvailable ?? null,
          found: true,
        }, ...prev]);
        clearBarcodeInput();
      } else {
        setAlert(`Product niet gevonden: ${normalized}`, 'error');
        clearBarcodeInput();
      }
    } catch {
      setAlert('Fout bij opzoeken product.', 'error');
    } finally {
      setIsLookingUp(false);
    }
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil leegmaken?')) {
      setRows([]);
    }
  };

  const handlePrintLabels = () => {
    if (rows.length === 0) {
      setAlert('Geen producten om labels voor te printen.', 'error');
      return;
    }

    const labelRows: { name: string; barcode: string; price: string }[] = [];
    for (const r of rows) {
      for (let i = 0; i < r.qty; i++) {
        labelRows.push({
          name: r.name,
          barcode: r.barcode,
          price: r.price != null ? `€${r.price.toFixed(2)}` : '',
        });
      }
    }

    const labelsHtml = labelRows.map((l, idx) =>
      `<div class="l">` +
      `<span class="n">${escapeHtml(l.name)}</span>` +
      `<span class="np">${escapeHtml(l.price)}</span>` +
      `<svg class="bc" data-barcode="${escapeHtml(l.barcode)}" id="bc${idx}"></svg>` +
      `</div>`
    ).join('');

    const html =
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Labels</title>` +
      `<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>` +
      `<style>` +
      `@page{size:89mm 36mm;margin:0!important}` +
      `*{margin:0;padding:0;box-sizing:border-box}` +
      `html,body{margin:0;padding:0;font-family:Arial,sans-serif}` +
      `.l{width:81mm;height:32mm;margin:2mm 2mm 2mm 6mm;position:relative;overflow:hidden;page-break-after:always;page-break-inside:avoid}` +
      `.l:last-child{page-break-after:auto}` +
      `.n{position:absolute;top:3mm;left:0;width:50mm;font-size:10pt;font-weight:700;line-height:1.2;overflow:hidden;max-height:8mm;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}` +
      `.np{position:absolute;top:3mm;right:0;font-size:18pt;font-weight:900;line-height:1}` +
      `.bc{position:absolute;bottom:0;left:0;right:0;height:14mm;overflow:hidden}` +
      `.bc svg{width:100%;height:14mm}` +
      `</style></head><body>` +
      labelsHtml +
      `<script>` +
      `document.querySelectorAll("svg.bc").forEach(function(el){` +
      `var bc=el.dataset.barcode,fmt=(/^\d{13}$/.test(bc)?"EAN13":/^\d{12}$/.test(bc)?"UPC":"CODE128");try{JsBarcode(el,bc,{width:2,height:40,fontSize:12,displayValue:true,margin:0,background:"#ffffff",lineColor:"#000000",format:fmt})}catch(e){try{JsBarcode(el,bc,{width:2,height:40,fontSize:12,displayValue:true,margin:0,background:"#ffffff",lineColor:"#000000",format:"CODE128"})}catch(e2){}}` +
      `});` +
      `setTimeout(function(){window.print()},200);` +
      `<\/script>` +
      `</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      setAlert('Pop-up geblokkeerd. Sta pop-ups toe voor deze site.', 'error');
    }
  };

  if (isLoading) {
    return (
      <>
        <Head><title>Label printen</title></Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  const alertBg = alertType === 'success' ? '#ecfdf5' : alertType === 'error' ? '#fef2f2' : '#fff3cd';
  const alertColor = alertType === 'success' ? '#065f46' : alertType === 'error' ? '#991b1b' : '#664d03';

  return (
    <>
      <Head><title>Label printen</title></Head>
      <main style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Label printen</h1>
        <p style={{ marginBottom: 16, color: '#6b7280' }}>
          Scan producten en print prijslabels met de huidige verkoopprijs.
        </p>

        {alertMessage && (
          <div style={{ background: alertBg, color: alertColor, padding: 8, borderRadius: 4, marginBottom: 12, fontSize: 14 }}>
            {alertMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            ref={inputRef}
            placeholder="Scan of typ barcode en druk Enter"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleLookup(e.currentTarget.value);
              }
            }}
            disabled={isLookingUp}
            style={{ flex: 1, padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button
            onClick={() => void handleLookup(inputRef.current?.value ?? '')}
            disabled={isLookingUp}
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#f3f4f6' }}
          >
            {isLookingUp ? 'Zoeken...' : 'Zoeken'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <button
            onClick={handlePrintLabels}
            disabled={rows.length === 0}
            style={{
              ...btnStyle,
              background: '#ecfdf5',
              border: '1px solid #10b981',
              color: '#065f46',
              cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Labels printen
          </button>
          <button
            onClick={clearAll}
            disabled={rows.length === 0}
            style={{ ...btnStyle, color: '#dc2626', border: '1px solid #dc2626' }}
          >
            Leegmaken
          </button>

          <div style={{ marginLeft: 'auto', fontSize: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span><strong>Producten:</strong> {totals.uniqueProducts}</span>
            <span><strong>Stuks:</strong> {totals.totalItems}</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Product</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Prijs</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 80 }}>Aantal</th>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.barcode}-${i}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    {r.variant && r.variant !== r.name && (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{r.variant}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.barcode}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {r.price != null ? `€${r.price.toFixed(2)}` : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="number"
                      min={1}
                      value={r.qty}
                      onChange={e => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setRows(prev => {
                          const next = [...prev];
                          next[i] = { ...next[i], qty: val };
                          return next;
                        });
                      }}
                      style={{ width: 60, padding: 4, border: '1px solid #e5e7eb', borderRadius: 4, textAlign: 'center' }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => removeRow(i)}
                      title="Verwijderen"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18, lineHeight: 1 }}
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Nog geen producten. Scan een barcode om te beginnen.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot style={{ background: '#f9fafb', fontWeight: 700 }}>
                <tr style={{ borderTop: '2px solid #d1d5db' }}>
                  <td style={tdStyle}>Totaal</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{totals.totalItems}</td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </>
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid #e5e7eb',
  borderRight: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  padding: 8,
  verticalAlign: 'middle',
  borderRight: '1px solid #e5e7eb',
  fontSize: 14,
};
