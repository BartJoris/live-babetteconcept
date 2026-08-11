import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/hooks/useAuth';
import { downloadRowsAsXlsx, readXlsxFirstSheetAsJsonRecords } from '@/lib/excelIo';

type StockRow = {
  productId: number | null;
  barcode: string;
  name: string;
  variant: string | null;
  qty: number;
  salePrice: number | null;
  purchasePrice: number | null;
  found: boolean;
  /** Actuele Odoo qty_available (na controle / bij scan) */
  qtyAvailable: number | null;
  /** Nieuwe voorraad om in Odoo te zetten (default 1) */
  setQty: number;
  /** null = nog niet gecontroleerd; true = gearchiveerd in Odoo */
  isArchived: boolean | null;
};

type Partner = {
  id: number;
  name: string;
};

type ProductSearchHit = {
  id: number;
  barcode: string | null;
  name: string;
  qtyAvailable: number | null;
  listPrice: number | null;
  standardPrice: number | null;
  active?: boolean;
};

const STORAGE_KEY = 'stockVerkopenRows';
const STOCK_PERCENTAGE = 0.20;
const STOCK_PERCENTAGE_LABEL = `${Math.round(STOCK_PERCENTAGE * 100)}%`;

/** Nieuwe vv: expliciete setQty, anders gescande hoeveelheid (geteld). */
function effectiveSetQty(row: { setQty?: number | null; qty: number }): number {
  if (typeof row.setQty === 'number' && Number.isFinite(row.setQty) && row.setQty >= 0) {
    return row.setQty;
  }
  return Math.max(0, row.qty || 0);
}

export default function StockVerkopenPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [excelExportHref, setExcelExportHref] = useState<string | null>(null);
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
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [isSettingStock, setIsSettingStock] = useState(false);
  const [settingStockProductId, setSettingStockProductId] = useState<number | null>(null);
  const [showOnlyShortages, setShowOnlyShortages] = useState(false);
  const [showOnlyArchived, setShowOnlyArchived] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [defaultSetQty, setDefaultSetQty] = useState(1);

  const [searchHits, setSearchHits] = useState<ProductSearchHit[]>([]);
  const [isSearchPickerOpen, setIsSearchPickerOpen] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const partnerSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isNotFoundOpen || isQuotationOpen || isSearchPickerOpen || isLookingUp) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isNotFoundOpen, isQuotationOpen, isSearchPickerOpen, isLookingUp]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StockRow[];
        if (Array.isArray(parsed)) {
          setRows(
            parsed.map((r) => ({
              ...r,
              qtyAvailable: typeof r.qtyAvailable === 'number' ? r.qtyAvailable : null,
              setQty: effectiveSetQty(r),
              isArchived: typeof r.isArchived === 'boolean' ? r.isArchived : null,
            })),
          );
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch { /* ignore */ }
  }, [rows]);

  const clearBarcodeInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

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

  const stockCheckSummary = useMemo(() => {
    let checked = 0;
    let ok = 0;
    let shortfall = 0;
    let noId = 0;
    let archived = 0;
    for (const r of rows) {
      if (r.productId == null) {
        noId += 1;
        continue;
      }
      if (r.isArchived === true) archived += 1;
      if (r.qtyAvailable == null) continue;
      checked += 1;
      if (r.qtyAvailable - r.qty < 0) shortfall += 1;
      else ok += 1;
    }
    return { checked, ok, shortfall, noId, archived };
  }, [rows]);

  const displayedRows = useMemo(() => {
    return rows
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => {
        if (showOnlyShortages && !(r.qtyAvailable != null && r.qtyAvailable - r.qty < 0)) {
          return false;
        }
        if (showOnlyArchived && r.isArchived !== true) {
          return false;
        }
        return true;
      });
  }, [rows, showOnlyShortages, showOnlyArchived]);

  const bumpOrAddRow = (row: StockRow) => {
    setRows((prev) => {
      const existingIndex = prev.findIndex(
        (r) =>
          (row.productId != null && r.productId === row.productId) ||
          (row.barcode && r.barcode === row.barcode),
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        const updated = {
          ...next[existingIndex],
          qty: (next[existingIndex].qty || 0) + 1,
        };
        next.splice(existingIndex, 1);
        return [updated, ...next];
      }
      return [row, ...prev];
    });
    clearBarcodeInput();
  };

  const addFromSearchHit = (hit: ProductSearchHit) => {
    bumpOrAddRow({
      productId: hit.id,
      barcode: hit.barcode || `id:${hit.id}`,
      name: hit.name,
      variant: hit.name,
      qty: 1,
      salePrice: hit.listPrice ?? null,
      purchasePrice: hit.standardPrice ?? null,
      found: true,
      qtyAvailable: typeof hit.qtyAvailable === 'number' ? hit.qtyAvailable : null,
      setQty: 1,
      isArchived: typeof hit.active === 'boolean' ? !hit.active : null,
    });
    setIsSearchPickerOpen(false);
    setSearchHits([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const openNotFound = (query: string) => {
    setNotFoundBarcode(query);
    setNfName('');
    setNfVariant('');
    setNfSalePrice('');
    setNfPurchasePrice('');
    setIsNotFoundOpen(true);
  };

  const searchByNameOrAttribute = async (query: string): Promise<ProductSearchHit[]> => {
    const res = await fetch(
      `/api/odoo/search-products?q=${encodeURIComponent(query)}&includeArchived=false`,
    );
    if (!res.ok) throw new Error(`Search API error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as ProductSearchHit[];
  };

  const handleLookup = async (rawQuery: string) => {
    const normalized = rawQuery.trim();
    if (!normalized) {
      setAlert('Lege zoekterm. Scan een barcode of typ naam/attribuut (bv. ad207d).');
      return;
    }

    // Exact barcode already in list
    const existingByBarcode = rows.findIndex((r) => r.barcode === normalized);
    if (existingByBarcode >= 0) {
      const next = [...rows];
      next[existingByBarcode] = {
        ...next[existingByBarcode],
        qty: (next[existingByBarcode].qty || 0) + 1,
      };
      const [updated] = next.splice(existingByBarcode, 1);
      setRows([updated, ...next]);
      clearBarcodeInput();
      return;
    }

    const looksLikeBarcode = /^\d{8,}$/.test(normalized);

    setIsLookingUp(true);
    setLastSearchQuery(normalized);
    try {
      if (looksLikeBarcode) {
        const res = await fetch(
          `/api/odoo/lookup-product-for-stock?barcode=${encodeURIComponent(normalized)}`,
        );
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        if (data?.found) {
          bumpOrAddRow({
            productId: data.productId ?? null,
            barcode: data.barcode ?? normalized,
            name: data.name ?? '',
            variant: data.variant ?? null,
            qty: 1,
            salePrice: data.salePrice ?? null,
            purchasePrice: data.purchasePrice ?? null,
            found: true,
            qtyAvailable: typeof data.qtyAvailable === 'number' ? data.qtyAvailable : null,
            setQty: 1,
            isArchived: null,
          });
          return;
        }
        // Barcode niet gevonden → probeer als tekstzoekopdracht
      }

      const hits = await searchByNameOrAttribute(normalized);
      if (hits.length === 0) {
        // Laatste kans: exacte barcode-lookup (ook voor niet-numerieke barcodes)
        if (!looksLikeBarcode) {
          const res = await fetch(
            `/api/odoo/lookup-product-for-stock?barcode=${encodeURIComponent(normalized)}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.found) {
              bumpOrAddRow({
                productId: data.productId ?? null,
                barcode: data.barcode ?? normalized,
                name: data.name ?? '',
                variant: data.variant ?? null,
                qty: 1,
                salePrice: data.salePrice ?? null,
                purchasePrice: data.purchasePrice ?? null,
                found: true,
                qtyAvailable: typeof data.qtyAvailable === 'number' ? data.qtyAvailable : null,
                setQty: 1,
                isArchived: null,
              });
              return;
            }
          }
        }
        openNotFound(normalized);
        return;
      }

      if (hits.length === 1) {
        addFromSearchHit(hits[0]);
        return;
      }

      setSearchHits(hits);
      setIsSearchPickerOpen(true);
    } catch {
      openNotFound(normalized);
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
      found: false,
      qtyAvailable: null,
      setQty: 1,
      isArchived: null,
    }, ...prev]);
    setIsNotFoundOpen(false);
    setNotFoundBarcode(null);
    clearBarcodeInput();
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
      setShowOnlyShortages(false);
      setShowOnlyArchived(false);
    }
  };

  const checkStockLevels = async () => {
    const productIds = [
      ...new Set(
        rows
          .map((r) => r.productId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    if (productIds.length === 0) {
      setAlert('Geen productIds om te controleren. Importeer eerst een JSON of scan producten.');
      return;
    }

    setIsCheckingStock(true);
    try {
      const res = await fetch('/api/odoo/stock-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `API error: ${res.status}`);
      }
      const levels = (data.levels || {}) as Record<number, number>;
      const activeMap = (data.active || {}) as Record<number, boolean>;
      let archivedCount = 0;
      setRows((prev) =>
        prev.map((r) => {
          if (r.productId == null) return { ...r, qtyAvailable: null, isArchived: null };
          const qty = levels[r.productId];
          const isActive = activeMap[r.productId];
          const isArchived = typeof isActive === 'boolean' ? !isActive : null;
          if (isArchived) archivedCount += 1;
          return {
            ...r,
            qtyAvailable: typeof qty === 'number' ? qty : 0,
            isArchived,
          };
        }),
      );
      setAlert(
        archivedCount > 0
          ? `Voorraad gecontroleerd voor ${productIds.length} producten. ${archivedCount} gearchiveerd.`
          : `Voorraad gecontroleerd voor ${productIds.length} producten.`,
      );
    } catch (err) {
      setAlert(
        `Voorraadcontrole mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`,
      );
    } finally {
      setIsCheckingStock(false);
    }
  };

  const unarchiveProducts = async (productIds: number[]) => {
    const unique = [...new Set(productIds.filter((id) => id > 0))];
    if (unique.length === 0) {
      setAlert('Geen gearchiveerde producten om te herstellen.');
      return;
    }

    if (
      !confirm(
        `Archivering ongedaan maken voor ${unique.length} product(en) in Odoo?`,
      )
    ) {
      return;
    }

    setIsUnarchiving(true);
    try {
      const res = await fetch('/api/odoo/unarchive-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: unique }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `API error: ${res.status}`);
      }

      const okIds = new Set(
        (data.results as Array<{ productId: number; success: boolean }> | undefined)
          ?.filter((r) => r.success)
          .map((r) => r.productId) ?? [],
      );

      setRows((prev) =>
        prev.map((r) =>
          r.productId != null && okIds.has(r.productId)
            ? { ...r, isArchived: false }
            : r,
        ),
      );

      const failed = (data.totalCount ?? unique.length) - (data.unarchivedCount ?? 0);
      setAlert(
        failed > 0
          ? `Dearchiveerd: ${data.unarchivedCount}/${data.totalCount}. ${failed} mislukt.`
          : `${data.unarchivedCount} producten opnieuw geactiveerd in Odoo.`,
      );
    } catch (err) {
      setAlert(
        `Dearchiveren mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`,
      );
    } finally {
      setIsUnarchiving(false);
    }
  };

  const unarchiveDisplayedArchived = async () => {
    const source = showOnlyArchived
      ? displayedRows.map(({ r }) => r)
      : rows;
    const ids = source
      .filter((r) => r.isArchived === true && r.productId != null)
      .map((r) => r.productId as number);
    await unarchiveProducts(ids);
  };

  const applySetQtyToOdoo = async (
    updates: Array<{ productId: number; newQuantity: number; rowIndexes: number[] }>,
  ) => {
    if (updates.length === 0) {
      setAlert('Geen producten met productId om voorraad te zetten.');
      return;
    }

    setIsSettingStock(true);
    try {
      const res = await fetch('/api/odoo/update-product-quantities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: updates.map(({ productId, newQuantity }) => ({ productId, newQuantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `API error: ${res.status}`);
      }

      const okIds = new Set(
        (data.results as Array<{ productId: number; success: boolean }> | undefined)
          ?.filter((r) => r.success)
          .map((r) => r.productId) ?? [],
      );

      setRows((prev) =>
        prev.map((r) => {
          if (r.productId == null || !okIds.has(r.productId)) return r;
          const match = updates.find((u) => u.productId === r.productId);
          if (!match) return r;
          return { ...r, qtyAvailable: match.newQuantity };
        }),
      );

      const failed = (data.totalCount ?? updates.length) - (data.updatedCount ?? 0);
      setAlert(
        failed > 0
          ? `Voorraad gezet: ${data.updatedCount}/${data.totalCount} gelukt, ${failed} mislukt.`
          : `Voorraad gezet in Odoo voor ${data.updatedCount} producten.`,
      );
    } catch (err) {
      setAlert(
        `Voorraad zetten mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`,
      );
    } finally {
      setIsSettingStock(false);
      setSettingStockProductId(null);
    }
  };

  const setStockForRow = async (index: number) => {
    const row = rows[index];
    if (!row?.productId) {
      setAlert('Geen productId voor deze regel.');
      return;
    }
    const newQuantity = effectiveSetQty(row);
    if (!confirm(`Voorraad van "${row.name}" in Odoo zetten op ${newQuantity}?`)) return;
    setSettingStockProductId(row.productId);
    await applySetQtyToOdoo([
      { productId: row.productId, newQuantity, rowIndexes: [index] },
    ]);
  };

  const setStockForDisplayed = async () => {
    const byProduct = new Map<number, { productId: number; newQuantity: number; rowIndexes: number[] }>();
    for (const { r, index } of displayedRows) {
      if (r.productId == null) continue;
      // Last row wins if duplicate productIds
      byProduct.set(r.productId, {
        productId: r.productId,
        newQuantity: effectiveSetQty(r),
        rowIndexes: [...(byProduct.get(r.productId)?.rowIndexes ?? []), index],
      });
    }
    const updates = Array.from(byProduct.values());
    if (updates.length === 0) {
      setAlert('Geen producten met productId in de huidige lijst.');
      return;
    }
    if (
      !confirm(
        `Voorraad in Odoo zetten voor ${updates.length} producten (per regel de waarde in "Nieuwe vv")?`,
      )
    ) {
      return;
    }
    await applySetQtyToOdoo(updates);
  };

  const fillAllSetQty = (value: number) => {
    const qty = Math.max(0, Number(value) || 0);
    setDefaultSetQty(qty);
    setRows((prev) => prev.map((r) => ({ ...r, setQty: qty })));
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

  const exportExcel = async () => {
    try {
      const exportRows = rows.map((r) => ({
        Barcode: r.barcode,
        'Product Naam': r.name,
        'Variant / Maat': r.variant ?? '',
        Aantal: r.qty,
        'Aankoopprijs (€)': r.purchasePrice ?? '',
        'Verkoopprijs (€)': r.salePrice ?? '',
        'Stock Prijs (€)': stockPrice(r.salePrice) ?? '',
        'Totaal Stock (€)':
          stockPrice(r.salePrice) != null ? +(stockPrice(r.salePrice)! * r.qty).toFixed(2) : '',
        ProductId: r.productId ?? '',
      }));
      await downloadRowsAsXlsx(exportRows, 'Stock Verkopen', `stock-verkopen-${formatTs(new Date())}.xlsx`);
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
      const qtyAvailableRaw = r.qtyAvailable ?? r['Op voorraad'];
      const setQtyRaw = r.setQty ?? r['Nieuwe voorraad'];
      return {
        productId: typeof r.productId === 'number' ? r.productId : (typeof r.ProductId === 'number' ? r.ProductId : null),
        barcode: String(r.barcode ?? r.Barcode ?? ''),
        name: String(r.name ?? r['Product Naam'] ?? ''),
        variant: r.variant != null ? String(r.variant) : (r['Variant / Maat'] != null ? String(r['Variant / Maat']) : null),
        qty: Number(r.qty ?? r.Aantal ?? 1) || 1,
        salePrice: r.salePrice != null ? Number(r.salePrice) : (r['Verkoopprijs (€)'] != null ? Number(r['Verkoopprijs (€)']) : null),
        purchasePrice: r.purchasePrice != null ? Number(r.purchasePrice) : (r['Aankoopprijs (€)'] != null ? Number(r['Aankoopprijs (€)']) : null),
        found: typeof r.found === 'boolean' ? r.found : true,
        qtyAvailable:
          qtyAvailableRaw != null && qtyAvailableRaw !== '' && Number.isFinite(Number(qtyAvailableRaw))
            ? Number(qtyAvailableRaw)
            : null,
        setQty:
          setQtyRaw != null && setQtyRaw !== '' && Number.isFinite(Number(setQtyRaw))
            ? Math.max(0, Number(setQtyRaw))
            : Math.max(0, Number(r.qty ?? r.Aantal ?? 1) || 1),
        isArchived: typeof r.isArchived === 'boolean' ? r.isArchived : null,
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
      } else if (file.name.endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer();
        const jsonData = await readXlsxFirstSheetAsJsonRecords(buffer);
        if (jsonData.length === 0) {
          setAlert('Geen data gevonden in Excel.');
          return;
        }
        const imported = parseJsonImport(jsonData);
        mergeRows(imported);
        setAlert(`${imported.length} producten geïmporteerd uit Excel.`);
      } else if (file.name.endsWith('.xls')) {
        setAlert('Alleen .xlsx wordt ondersteund. Sla het bestand op als .xlsx in Excel.');
      } else {
        setAlert('Onbekend bestandsformaat. Gebruik .json of .xlsx (niet .xls).');
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
        setExcelExportHref(`/offerte-excel?ref=${encodeURIComponent(String(data.orderId))}`);
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
          Scan een barcode, of zoek op naam/attribuut (bv. <code>ad207d</code>). Stock prijs = {STOCK_PERCENTAGE_LABEL} van de verkoopprijs.
        </p>

        {alertMessage && (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        )}

        {excelExportHref && (
          <div style={{ background: '#ecfdf5', color: '#065f46', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            Offerte klaar —{' '}
            <a href={excelExportHref} style={{ color: '#047857', fontWeight: 600 }}>
              download Excel (gesorteerd op merk)
            </a>
            {' · '}
            <button
              type="button"
              onClick={() => setExcelExportHref(null)}
              style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              sluiten
            </button>
          </div>
        )}

        {/* Barcode input */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            ref={inputRef}
            placeholder="Barcode scannen, of zoek op naam / attribuut (bv. ad207d)"
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
              accept=".json,.xlsx"
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
            onClick={checkStockLevels}
            disabled={isCheckingStock || rows.length === 0}
            style={{
              ...btnStyle,
              background: '#fef3c7',
              border: '1px solid #d97706',
              color: '#92400e',
              opacity: isCheckingStock || rows.length === 0 ? 0.6 : 1,
            }}
          >
            {isCheckingStock ? 'Voorraad controleren…' : 'Controleer voorraad'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
              Default vv
              <input
                type="number"
                min={0}
                value={defaultSetQty}
                onChange={(e) => setDefaultSetQty(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 52, padding: 4, border: '1px solid #ccc', borderRadius: 4, textAlign: 'center' }}
              />
            </label>
            <button
              onClick={() => fillAllSetQty(defaultSetQty)}
              disabled={rows.length === 0}
              style={btnStyle}
              title="Vul 'Nieuwe vv' op alle regels met deze default"
            >
              Vul alle
            </button>
            <button
              onClick={setStockForDisplayed}
              disabled={isSettingStock || rows.length === 0}
              style={{
                ...btnStyle,
                background: '#ecfdf5',
                border: '1px solid #10b981',
                color: '#065f46',
                opacity: isSettingStock || rows.length === 0 ? 0.6 : 1,
              }}
            >
              {isSettingStock ? 'Voorraad zetten…' : 'Zet voorraad in Odoo'}
            </button>
          </div>
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

        {(stockCheckSummary.checked > 0 || stockCheckSummary.archived > 0) && (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background:
                stockCheckSummary.archived > 0 || stockCheckSummary.shortfall > 0
                  ? '#fef2f2'
                  : '#ecfdf5',
              border: `1px solid ${
                stockCheckSummary.archived > 0 || stockCheckSummary.shortfall > 0
                  ? '#fca5a5'
                  : '#6ee7b7'
              }`,
              fontSize: 14,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <span>
              <strong>Voorraadcheck:</strong> {stockCheckSummary.checked} gecontroleerd
            </span>
            <span style={{ color: '#065f46' }}>Genoeg: {stockCheckSummary.ok}</span>
            <span style={{ color: '#991b1b' }}>Tekort: {stockCheckSummary.shortfall}</span>
            <span style={{ color: stockCheckSummary.archived > 0 ? '#9a3412' : '#6b7280' }}>
              Gearchiveerd: {stockCheckSummary.archived}
            </span>
            {stockCheckSummary.noId > 0 && (
              <span style={{ color: '#6b7280' }}>Zonder productId: {stockCheckSummary.noId}</span>
            )}
            {stockCheckSummary.archived > 0 && (
              <button
                onClick={() => void unarchiveDisplayedArchived()}
                disabled={isUnarchiving}
                style={{
                  ...btnStyle,
                  background: '#ffedd5',
                  border: '1px solid #ea580c',
                  color: '#9a3412',
                  opacity: isUnarchiving ? 0.6 : 1,
                }}
              >
                {isUnarchiving
                  ? 'Dearchiveren…'
                  : showOnlyArchived
                    ? 'Dearchiveer zichtbare'
                    : 'Dearchiveer alle gearchiveerde'}
              </button>
            )}
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showOnlyShortages}
                onChange={(e) => setShowOnlyShortages(e.target.checked)}
              />
              Alleen tekorten
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showOnlyArchived}
                onChange={(e) => setShowOnlyArchived(e.target.checked)}
              />
              Alleen gearchiveerd
            </label>
          </div>
        )}

        {/* Product table */}
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Product Naam</th>
                <th style={thStyle}>Variant / Maat</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Aankoopprijs</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Verkoopprijs</th>
                <th style={{ ...thStyle, textAlign: 'right', background: '#fef3c7' }}>Stock Prijs ({STOCK_PERCENTAGE_LABEL})</th>
                <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Gescand</th>
                <th style={{ ...thStyle, width: 90, textAlign: 'center', background: '#e0f2fe' }}>Op voorraad</th>
                <th style={{ ...thStyle, width: 80, textAlign: 'center', background: '#e0f2fe' }}>Verschil</th>
                <th style={{ ...thStyle, width: 100, textAlign: 'center', background: '#d1fae5' }}>Nieuwe vv</th>
                <th style={{ ...thStyle, width: 70, textAlign: 'center', background: '#d1fae5' }}>Zet</th>
                <th style={{ ...thStyle, textAlign: 'right', background: '#fef3c7' }}>Totaal</th>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map(({ r, index: i }) => {
                const sp = stockPrice(r.salePrice);
                const diff = r.qtyAvailable != null ? r.qtyAvailable - r.qty : null;
                const shortfall = diff != null && diff < 0;
                const archived = r.isArchived === true;
                const isSettingThis =
                  isSettingStock && settingStockProductId != null && settingStockProductId === r.productId;
                return (
                  <tr
                    key={`${r.barcode}-${i}`}
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      background: archived ? '#fff7ed' : shortfall ? '#fef2f2' : undefined,
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>
                        {r.name}
                        {archived && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#9a3412',
                              background: '#ffedd5',
                              border: '1px solid #fdba74',
                              borderRadius: 4,
                              padding: '1px 6px',
                              verticalAlign: 'middle',
                            }}
                          >
                            Gearchiveerd
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{r.barcode}</div>
                      {archived && r.productId != null && (
                        <button
                          type="button"
                          onClick={() => void unarchiveProducts([r.productId!])}
                          disabled={isUnarchiving}
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 4,
                            border: '1px solid #ea580c',
                            background: '#fff7ed',
                            color: '#9a3412',
                            cursor: isUnarchiving ? 'wait' : 'pointer',
                          }}
                        >
                          Archivering ongedaan maken
                        </button>
                      )}
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
                    <td style={{ ...tdStyle, textAlign: 'center', background: '#f0f9ff' }}>
                      {r.qtyAvailable != null ? r.qtyAvailable : '—'}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'center',
                        background: '#f0f9ff',
                        fontWeight: 600,
                        color:
                          diff == null ? '#6b7280' : shortfall ? '#991b1b' : '#065f46',
                      }}
                    >
                      {diff == null ? '—' : diff > 0 ? `+${diff}` : `${diff}`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', background: '#ecfdf5' }}>
                      <input
                        type="number"
                        min={0}
                        value={effectiveSetQty(r)}
                        onChange={(e) =>
                          updateRow(i, { setQty: Math.max(0, Number(e.target.value) || 0) })
                        }
                        style={{
                          width: 60,
                          padding: 4,
                          border: '1px solid #10b981',
                          borderRadius: 4,
                          textAlign: 'center',
                          background: '#fff',
                        }}
                        title="Nieuwe voorraad in Odoo (= gescand als default)"
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', background: '#ecfdf5' }}>
                      <button
                        onClick={() => setStockForRow(i)}
                        disabled={!r.productId || isSettingStock}
                        title={
                          r.productId
                            ? `Zet Odoo-voorraad op ${effectiveSetQty(r)}`
                            : 'Geen productId'
                        }
                        style={{
                          ...btnStyle,
                          padding: '4px 8px',
                          fontSize: 12,
                          background: '#10b981',
                          color: '#fff',
                          border: '1px solid #059669',
                          opacity: !r.productId || isSettingStock ? 0.5 : 1,
                        }}
                      >
                        {isSettingThis ? '…' : 'Zet'}
                      </button>
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
                  <td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Nog geen producten. Scan een barcode of importeer een JSON om te beginnen.
                  </td>
                </tr>
              )}
              {rows.length > 0 && displayedRows.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    Geen rijen voor dit filter. Schakel &quot;Alleen tekorten&quot; / &quot;Alleen gearchiveerd&quot; uit.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot style={{ background: '#f9fafb', fontWeight: 700 }}>
                <tr style={{ borderTop: '2px solid #d1d5db' }}>
                  <td style={tdStyle}>Totaal</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: 'right' }}>€{totals.totalPurchaseValue.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>€{totals.totalSaleValue.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', background: '#fef3c7' }}>€{totals.totalStockValue.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{totals.totalItems}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', background: '#e0f2fe' }} />
                  <td style={{ ...tdStyle, textAlign: 'center', background: '#e0f2fe' }} />
                  <td style={{ ...tdStyle, textAlign: 'center', background: '#d1fae5' }} />
                  <td style={{ ...tdStyle, textAlign: 'center', background: '#d1fae5' }} />
                  <td style={{ ...tdStyle, textAlign: 'right', background: '#fef3c7' }}>€{totals.totalStockValue.toFixed(2)}</td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Search results picker */}
        {isSearchPickerOpen && (
          <div
            style={modalBackdropStyle}
            onClick={() => {
              setIsSearchPickerOpen(false);
              setSearchHits([]);
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
          >
            <div style={{ ...modalStyle, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Kies product</h3>
              <p style={{ marginTop: 0, marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
                {searchHits.length} resultaten voor <strong>{lastSearchQuery}</strong>
              </p>
              <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                {searchHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => addFromSearchHit(hit)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid #f3f4f6',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{hit.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {hit.barcode || 'geen barcode'}
                      {hit.qtyAvailable != null ? ` · vv ${hit.qtyAvailable}` : ''}
                      {hit.listPrice != null ? ` · €${hit.listPrice.toFixed(2)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  onClick={() => {
                    setIsSearchPickerOpen(false);
                    setSearchHits([]);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#f3f4f6' }}
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Not-found modal */}
        {isNotFoundOpen && (
          <div style={modalBackdropStyle} onClick={onCancelNotFound}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Product niet gevonden</h3>
              <p style={{ marginTop: 0, marginBottom: 12 }}>Zoekterm: <strong>{notFoundBarcode}</strong></p>
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
                Er wordt een offerte (concept verkooporder) aangemaakt met {rows.filter(r => r.productId != null && r.salePrice != null).length} producten aan {STOCK_PERCENTAGE_LABEL} van de verkoopprijs.
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
