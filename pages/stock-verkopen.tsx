import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';
import * as XLSX from 'xlsx';

type StockRow = {
  productId: number | null;
  barcode: string;
  name: string;
  variant: string | null;
  qty: number;
  salePrice: number | null;
  purchasePrice: number | null;
  image: string | null;
  found: boolean;
};

type Partner = {
  id: number;
  name: string;
};

const STORAGE_KEY = 'stockVerkopenRows';
const STOCK_PERCENTAGE = 0.20;

export default function StockVerkopenPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [rows, setRows] = useState<StockRow[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Not-found modal
  const [isNotFoundOpen, setIsNotFoundOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [nfName, setNfName] = useState('');
  const [nfVariant, setNfVariant] = useState('');
  const [nfSalePrice, setNfSalePrice] = useState('');
  const [nfPurchasePrice, setNfPurchasePrice] = useState('');

  // Quotation modal
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerResults, setPartnerResults] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [isSearchingPartners, setIsSearchingPartners] = useState(false);
  const [isCreatingQuotation, setIsCreatingQuotation] = useState(false);

  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const partnerSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StockRow[];
        if (Array.isArray(parsed)) setRows(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch { /* ignore */ }
  }, [rows]);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const stockPrice = (sale: number | null) => (sale != null ? +(sale * STOCK_PERCENTAGE).toFixed(2) : null);

  const totals = useMemo(() => {
    let totalItems = 0;
    let totalPurchaseValue = 0;
    let totalSaleValue = 0;
    let totalStockValue = 0;
    for (const r of rows) {
      totalItems += r.qty;
      if (r.purchasePrice != null) totalPurchaseValue += r.purchasePrice * r.qty;
      if (r.salePrice != null) totalSaleValue += r.salePrice * r.qty;
      const sp = stockPrice(r.salePrice);
      if (sp != null) totalStockValue += sp * r.qty;
    }
    return {
      totalItems,
      totalPurchaseValue: +totalPurchaseValue.toFixed(2),
      totalSaleValue: +totalSaleValue.toFixed(2),
      totalStockValue: +totalStockValue.toFixed(2),
    };
  }, [rows]);

  const handleLookup = async (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) {
      setAlert('Lege barcode. Probeer opnieuw.');
      return;
    }

    const existingIndex = rows.findIndex(r => r.barcode === normalized);
    if (existingIndex >= 0) {
      const next = [...rows];
      next[existingIndex] = { ...next[existingIndex], qty: (next[existingIndex].qty || 0) + 1 };
      const [updated] = next.splice(existingIndex, 1);
      setRows([updated, ...next]);
      setBarcodeInput('');
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
          salePrice: data.salePrice ?? null,
          purchasePrice: data.purchasePrice ?? null,
          image: data.image ?? null,
          found: true,
        }, ...prev]);
        setBarcodeInput('');
      } else {
        setNotFoundBarcode(normalized);
        setNfName('');
        setNfVariant('');
        setNfSalePrice('');
        setNfPurchasePrice('');
        setIsNotFoundOpen(true);
      }
    } catch {
      setNotFoundBarcode(normalized);
      setNfName('');
      setNfVariant('');
      setNfSalePrice('');
      setNfPurchasePrice('');
      setIsNotFoundOpen(true);
    } finally {
      setIsLookingUp(false);
    }
  };

  const onSubmitNotFound = () => {
    if (!notFoundBarcode) {
      setIsNotFoundOpen(false);
      return;
    }
    const saleParsed = nfSalePrice.trim() ? Number(nfSalePrice.replace(',', '.')) : null;
    const purchaseParsed = nfPurchasePrice.trim() ? Number(nfPurchasePrice.replace(',', '.')) : null;
    setRows(prev => [{
      productId: null,
      barcode: notFoundBarcode,
      name: nfName.trim() || '(zonder naam)',
      variant: nfVariant.trim() || null,
      qty: 1,
      salePrice: Number.isFinite(saleParsed) ? saleParsed : null,
      purchasePrice: Number.isFinite(purchaseParsed) ? purchaseParsed : null,
      image: null,
      found: false,
    }, ...prev]);
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
    setBarcodeInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const onCancelNotFound = () => {
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<StockRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const clearAll = () => {
    if (confirm('Weet je zeker dat je alles wil leegmaken?')) {
      setRows([]);
    }
  };

  const formatTs = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const exportJSON = () => {
    try {
      const data = rows.map(r => ({
        ...r,
        stockPrice: stockPrice(r.salePrice),
        totalStock: stockPrice(r.salePrice) != null ? +(stockPrice(r.salePrice)! * r.qty).toFixed(2) : null,
      }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock-verkopen-${formatTs(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setAlert('JSON geëxporteerd.');
    } catch {
      setAlert('Export mislukt.');
    }
  };

  const exportExcel = () => {
    try {
      const exportRows = rows.map(r => ({
        Barcode: r.barcode,
        'Product Naam': r.name,
        'Variant / Maat': r.variant ?? '',
        Aantal: r.qty,
        'Aankoopprijs (€)': r.purchasePrice ?? '',
        'Verkoopprijs (€)': r.salePrice ?? '',
        'Stock Prijs (€)': stockPrice(r.salePrice) ?? '',
        'Totaal Stock (€)': stockPrice(r.salePrice) != null ? +(stockPrice(r.salePrice)! * r.qty).toFixed(2) : '',
        ProductId: r.productId ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Verkopen');
      XLSX.writeFile(wb, `stock-verkopen-${formatTs(new Date())}.xlsx`);
      setAlert('Excel geëxporteerd.');
    } catch {
      setAlert('Export mislukt.');
    }
  };

  const mergeRows = (incoming: StockRow[]) => {
    if (importMode === 'replace') {
      setRows(incoming);
      return;
    }
    setRows(prev => {
      const map = new Map<string, StockRow>();
      for (const r of prev) map.set(r.barcode, { ...r });
      for (const r of incoming) {
        const existing = map.get(r.barcode);
        if (existing) {
          map.set(r.barcode, { ...existing, qty: (existing.qty || 0) + (r.qty || 0) });
        } else {
          map.set(r.barcode, { ...r });
        }
      }
      return Array.from(map.values());
    });
  };

  const parseJsonImport = (raw: unknown[]): StockRow[] => {
    return raw.map(item => {
      const r = item as Record<string, unknown>;
      return {
        productId: typeof r.productId === 'number' ? r.productId : (typeof r.ProductId === 'number' ? r.ProductId : null),
        barcode: String(r.barcode ?? r.Barcode ?? ''),
        name: String(r.name ?? r['Product Naam'] ?? ''),
        variant: r.variant != null ? String(r.variant) : (r['Variant / Maat'] != null ? String(r['Variant / Maat']) : null),
        qty: Number(r.qty ?? r.Aantal ?? 1) || 1,
        salePrice: r.salePrice != null ? Number(r.salePrice) : (r['Verkoopprijs (€)'] != null ? Number(r['Verkoopprijs (€)']) : null),
        purchasePrice: r.purchasePrice != null ? Number(r.purchasePrice) : (r['Aankoopprijs (€)'] != null ? Number(r['Aankoopprijs (€)']) : null),
        image: typeof r.image === 'string' ? r.image : null,
        found: typeof r.found === 'boolean' ? r.found : true,
      };
    }).filter(r => r.barcode);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setAlert('Ongeldig JSON-bestand: verwacht een array.');
          return;
        }
        const imported = parseJsonImport(parsed);
        mergeRows(imported);
        setAlert(`${imported.length} producten geïmporteerd uit JSON.`);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { setAlert('Geen data gevonden in Excel.'); return; }
        const jsonData = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
        const imported = parseJsonImport(jsonData);
        mergeRows(imported);
        setAlert(`${imported.length} producten geïmporteerd uit Excel.`);
      } else {
        setAlert('Onbekend bestandsformaat. Gebruik .json of .xlsx.');
      }
    } catch {
      setAlert('Importeren mislukt. Controleer het bestand.');
    }
  };

  // Partner search with debounce
  const handlePartnerSearch = (q: string) => {
    setPartnerSearch(q);
    setSelectedPartner(null);
    if (partnerSearchTimeout.current) clearTimeout(partnerSearchTimeout.current);
    if (q.trim().length < 2) {
      setPartnerResults([]);
      return;
    }
    partnerSearchTimeout.current = setTimeout(async () => {
      setIsSearchingPartners(true);
      try {
        const res = await fetch(`/api/odoo/search-partners?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setPartnerResults(data.partners ?? []);
        }
      } catch { /* ignore */ }
      setIsSearchingPartners(false);
    }, 400);
  };

  const createQuotation = async () => {
    if (!selectedPartner) {
      setAlert('Selecteer eerst een klant.');
      return;
    }
    const validLines = rows.filter(r => r.productId != null && r.salePrice != null);
    if (validLines.length === 0) {
      setAlert('Geen producten met geldige productId en verkoopprijs.');
      return;
    }

    setIsCreatingQuotation(true);
    try {
      const res = await fetch('/api/odoo/create-stock-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: selectedPartner.id,
          lines: validLines.map(r => ({
            productId: r.productId,
            name: `${r.name}${r.variant ? ' - ' + r.variant : ''}`,
            quantity: r.qty,
            priceUnit: r.salePrice,
            discount: 80,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAlert(`Offerte ${data.orderName} aangemaakt in Odoo!`);
        setIsQuotationOpen(false);
        setSelectedPartner(null);
        setPartnerSearch('');
        setPartnerResults([]);
      } else {
        setAlert(`Fout: ${data.error || 'Onbekende fout'}`);
      }
    } catch {
      setAlert('Offerte aanmaken mislukt.');
    }
    setIsCreatingQuotation(false);
  };

  if (isLoading) {
    return (
      <>
        <Head><title>Stock verkopen</title></Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head><title>Stock verkopen</title></Head>
      <main style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Stock verkopen</h1>
        <p style={{ marginBottom: 16, color: '#6b7280' }}>
          Scan producten om ze toe te voegen aan de lijst. Stock prijs = 20% van de verkoopprijs.
        </p>

        {alertMessage && (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        )}

        {/* Barcode input */}
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
            disabled={isLookingUp}
            style={{ flex: 1, padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button
            onClick={() => void handleLookup(barcodeInput)}
            disabled={isLookingUp}
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#f3f4f6' }}
          >
            {isLookingUp ? 'Zoeken...' : 'Zoeken'}
          </button>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <select
              value={importMode}
              onChange={e => setImportMode(e.target.value as 'replace' | 'merge')}
              style={{ padding: '5px 4px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
            >
              <option value="merge">Samenvoegen</option>
              <option value="replace">Vervangen</option>
            </select>
            <button onClick={() => fileInputRef.current?.click()} style={{ ...btnStyle, background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46' }}>
              Importeer bestand
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
          <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />
          <button onClick={exportExcel} style={btnStyle}>
            Exporteer Excel
          </button>
          <button onClick={exportJSON} style={btnStyle}>
            Exporteer JSON
          </button>
          <button
            onClick={() => {
              if (rows.length === 0) { setAlert('Voeg eerst producten toe.'); return; }
              setIsQuotationOpen(true);
            }}
            style={{ ...btnStyle, background: '#3b82f6', color: '#fff', border: '1px solid #3b82f6' }}
          >
            Offerte aanmaken in Odoo
          </button>
          <button onClick={clearAll} style={{ ...btnStyle, color: '#dc2626', border: '1px solid #dc2626' }}>
            Leegmaken
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 14, display: 'flex', gap: 16 }}>
            <span><strong>Producten:</strong> {rows.length}</span>
            <span><strong>Stuks:</strong> {totals.totalItems}</span>
            <span><strong>Stock waarde:</strong> €{totals.totalStockValue.toFixed(2)}</span>
            <span><strong>Verkoopwaarde:</strong> €{totals.totalSaleValue.toFixed(2)}</span>
          </div>
        </div>

        {/* Product table */}
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ ...thStyle, width: 60 }}>Beeld</th>
                <th style={thStyle}>Product Naam</th>
                <th style={thStyle}>Variant / Maat</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Aankoopprijs</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Verkoopprijs</th>
                <th style={{ ...thStyle, textAlign: 'right', background: '#fef3c7' }}>Stock Prijs (20%)</th>
                <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Aantal</th>
                <th style={{ ...thStyle, textAlign: 'right', background: '#fef3c7' }}>Totaal</th>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sp = stockPrice(r.salePrice);
                return (
                  <tr key={`${r.barcode}-${i}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {r.image ? (
                        <img
                          src={`data:image/png;base64,${r.image}`}
                          alt={r.name}
                          style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 4 }}
                        />
                      ) : (
                        <div style={{ width: 48, height: 48, background: '#f3f4f6', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 10 }}>
                          Geen
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.barcode}</div>
                    </td>
                    <td style={tdStyle}>{r.variant ?? '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {r.purchasePrice != null ? `€${r.purchasePrice.toFixed(2)}` : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {r.salePrice != null ? `€${r.salePrice.toFixed(2)}` : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', background: '#fffbeb', fontWeight: 600 }}>
                      {sp != null ? `€${sp.toFixed(2)}` : '-'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={e => updateRow(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ width: 60, padding: 4, border: '1px solid #e5e7eb', borderRadius: 4, textAlign: 'center' }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', background: '#fffbeb', fontWeight: 600 }}>
                      {sp != null ? `€${(sp * r.qty).toFixed(2)}` : '-'}
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
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Nog geen producten. Scan een barcode om te beginnen.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot style={{ background: '#f9fafb', fontWeight: 700 }}>
                <tr style={{ borderTop: '2px solid #d1d5db' }}>
                  <td style={tdStyle} />
                  <td style={tdStyle}>Totaal</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: 'right' }}>€{totals.totalPurchaseValue.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>€{totals.totalSaleValue.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', background: '#fef3c7' }}>€{totals.totalStockValue.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{totals.totalItems}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', background: '#fef3c7' }}>€{totals.totalStockValue.toFixed(2)}</td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Not-found modal */}
        {isNotFoundOpen && (
          <div style={modalBackdropStyle} onClick={onCancelNotFound}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Product niet gevonden</h3>
              <p style={{ marginTop: 0, marginBottom: 12 }}>Barcode: <strong>{notFoundBarcode}</strong></p>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={labelStyle}>
                  Naam
                  <input value={nfName} onChange={e => setNfName(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Variant / Maat
                  <input value={nfVariant} onChange={e => setNfVariant(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Verkoopprijs
                  <input type="number" step="0.01" value={nfSalePrice} onChange={e => setNfSalePrice(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Aankoopprijs
                  <input type="number" step="0.01" value={nfPurchasePrice} onChange={e => setNfPurchasePrice(e.target.value)} style={inputStyle} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={onCancelNotFound} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc' }}>
                  Annuleren
                </button>
                <button onClick={onSubmitNotFound} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#065f46', fontWeight: 600 }}>
                  Toevoegen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quotation modal */}
        {isQuotationOpen && (
          <div style={modalBackdropStyle} onClick={() => !isCreatingQuotation && setIsQuotationOpen(false)}>
            <div style={{ ...modalStyle, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Offerte aanmaken in Odoo</h3>
              <p style={{ marginTop: 0, marginBottom: 16, color: '#6b7280', fontSize: 14 }}>
                Er wordt een offerte (concept verkooporder) aangemaakt met {rows.filter(r => r.productId != null && r.salePrice != null).length} producten aan 20% van de verkoopprijs.
              </p>

              <label style={labelStyle}>
                Klant (opkoper) zoeken
                <input
                  placeholder="Typ naam van klant..."
                  value={partnerSearch}
                  onChange={e => handlePartnerSearch(e.target.value)}
                  style={inputStyle}
                  autoFocus
                />
              </label>

              {isSearchingPartners && (
                <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0' }}>Zoeken...</p>
              )}

              {partnerResults.length > 0 && !selectedPartner && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                  {partnerResults.map(p => (
                    <div
                      key={p.id}
                      onClick={() => { setSelectedPartner(p); setPartnerSearch(p.name); setPartnerResults([]); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              )}

              {selectedPartner && (
                <p style={{ margin: '8px 0', padding: '8px 12px', background: '#ecfdf5', borderRadius: 4, fontSize: 14 }}>
                  Geselecteerd: <strong>{selectedPartner.name}</strong>
                </p>
              )}

              <div style={{ marginTop: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 4, fontSize: 13 }}>
                <strong>Samenvatting:</strong><br />
                Producten: {rows.filter(r => r.productId != null && r.salePrice != null).length} / {rows.length}<br />
                Totale stock waarde: €{totals.totalStockValue.toFixed(2)}
                {rows.some(r => r.productId == null) && (
                  <div style={{ color: '#b45309', marginTop: 4 }}>
                    Let op: {rows.filter(r => r.productId == null).length} product(en) zonder productId worden overgeslagen.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  onClick={() => { setIsQuotationOpen(false); setSelectedPartner(null); setPartnerSearch(''); setPartnerResults([]); }}
                  disabled={isCreatingQuotation}
                  style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc' }}
                >
                  Annuleren
                </button>
                <button
                  onClick={createQuotation}
                  disabled={!selectedPartner || isCreatingQuotation}
                  style={{
                    padding: '6px 16px', borderRadius: 4, border: '1px solid #3b82f6',
                    background: selectedPartner && !isCreatingQuotation ? '#3b82f6' : '#93c5fd',
                    color: '#fff', fontWeight: 600, cursor: selectedPartner && !isCreatingQuotation ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isCreatingQuotation ? 'Aanmaken...' : 'Offerte aanmaken'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
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
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: 20,
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
};
