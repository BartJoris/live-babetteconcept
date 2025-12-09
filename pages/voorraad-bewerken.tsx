import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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

type LocalAgg = {
  scanQty: number;
  localSalePrice: number | null;
  localPurchasePrice: number | null;
  names: string[];
  variants: string[];
  notes: string[];
};

type OdooMatch = {
  id: number;
  barcode: string | null;
  name: string;
  categId: number | null;
  categName: string | null;
  qtyAvailable: number | null;
  listPrice: number | null;
  standardPrice: number | null;
  productTmplId?: number | null;
  active?: boolean;
};

type AnalyseApiItem = {
  barcode: string;
  active: OdooMatch | null;
  archived: OdooMatch | null;
};

type AnalyseRow = {
  barcode: string;
  scanQty: number;
  localSalePrice: number | null;
  localPurchasePrice: number | null;
  localName?: string | null;
  localVariant?: string | null;
  localNamesExtra?: string[];
  localVariantsExtra?: string[];
  localNotes?: string[];
  active?: OdooMatch | null;
  archived?: OdooMatch | null;
  status: 'actief' | 'archief' | 'geen';
  merk?: string | null;
};

type FilterState = {
  status: 'alle' | 'actief' | 'archief' | 'geen';
  category: string;
  text: string;
};

type SortKey = 'barcode' | 'name' | 'variant' | 'scanQty' | 'odooQty' | 'diff' | 'category' | 'status' | 'merk';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

type Category = {
  id: number;
  name: string;
};

type Label = {
  id: number;
  name: string;
};

type PreviewChange = {
  templateId: number;
  barcode: string;
  name: string;
  oldCategoryId: number | null;
  oldCategoryName: string | null;
  newCategoryId: number | null;
  newCategoryName: string | null;
  oldLabelIds: number[];
  oldLabelNames: string[];
  newLabelIds: number[];
  newLabelNames: string[];
};

const STORAGE_ANALYSE_KEY = 'voorraadBewerkenState';

function computeName(row: AnalyseRow) {
  return row.active?.name || row.archived?.name || row.localName || '';
}

function computeVariant(row: AnalyseRow) {
  return row.active?.name ? '' : (row.localVariant || '');
}

function computeOdooQty(row: AnalyseRow) {
  return row.active?.qtyAvailable ?? row.archived?.qtyAvailable ?? null;
}

function computeCategory(row: AnalyseRow) {
  return row.active?.categName || row.archived?.categName || '';
}

function computeDiff(row: AnalyseRow) {
  return (computeOdooQty(row) ?? 0) - row.scanQty;
}

function isFoundTrue(row: AnalyseRow) {
  return row.status !== 'geen';
}

export default function VoorraadBewerkenPage() {
  const { isLoading, isLoggedIn } = useAuth(true);
  const [upload, setUpload] = useState<UploadShape | null>(null);
  const [grouped, setGrouped] = useState<Record<string, LocalAgg>>({});
  const [analysed, setAnalysed] = useState<AnalyseRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FilterState>({ status: 'alle', category: '', text: '' });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const draftFileRef = useRef<HTMLInputElement | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [sortFound, setSortFound] = useState<SortState>({ key: 'barcode', dir: 'asc' });
  const [showFound, setShowFound] = useState(true);
  const [showUnknown, setShowUnknown] = useState(true);
  const foundTableRef = useRef<HTMLDivElement | null>(null);

  // New state for editing
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewChanges, setPreviewChanges] = useState<PreviewChange[]>([]);
  const [previewMode, setPreviewMode] = useState<'category' | 'label' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingLabels, setLoadingLabels] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ANALYSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          upload: UploadShape | null;
          analysed: AnalyseRow[];
          filter: FilterState;
        };
        if (parsed.upload) setUpload(parsed.upload);
        if (Array.isArray(parsed.analysed)) setAnalysed(parsed.analysed);
        if (parsed.filter) setFilter(parsed.filter);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_ANALYSE_KEY,
        JSON.stringify({ upload, analysed, filter })
      );
    } catch {
      // ignore
    }
  }, [upload, analysed, filter]);

  // Load categories and labels on mount
  useEffect(() => {
    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const res = await fetch('/api/odoo/fetch-categories', {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setCategories(data.categories || []);
          }
        } else {
          console.error('Failed to load categories:', res.status, await res.text());
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setLoadingCategories(false);
      }
    };

    const loadLabels = async () => {
      setLoadingLabels(true);
      try {
        const res = await fetch('/api/odoo/fetch-template-labels', {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setLabels(data.labels || []);
          }
        } else {
          console.error('Failed to load labels:', res.status, await res.text());
        }
      } catch (error) {
        console.error('Failed to load labels:', error);
      } finally {
        setLoadingLabels(false);
      }
    };

    loadCategories();
    loadLabels();
  }, []);

  const setAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  const onChooseFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as UploadShape | InventoryRow[];
      let rows: InventoryRow[] = [];
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (parsed && Array.isArray(parsed.rows)) {
        rows = parsed.rows;
      }
      if (!rows.length) {
        setAlert('Geen geldige rijen gevonden in JSON.');
        return;
      }
      setUpload({ rows });
      setAnalysed([]);
      setSelected({});
      groupRows(rows);
    } catch {
      setAlert('JSON kon niet worden gelezen.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const loadFromLocal = () => {
    try {
      const raw = localStorage.getItem('kelderInventarisRows');
      if (!raw) {
        setAlert('Geen lokale inventaris gevonden.');
        return;
      }
      const rows = JSON.parse(raw) as InventoryRow[];
      if (!Array.isArray(rows) || rows.length === 0) {
        setAlert('Lokale inventaris is leeg of ongeldig.');
        return;
      }
      setUpload({ rows });
      setAnalysed([]);
      setSelected({});
      groupRows(rows);
    } catch {
      setAlert('Laden van lokale inventaris mislukt.');
    }
  };

  const groupRows = (rows: InventoryRow[]) => {
    const map: Record<string, LocalAgg> = {};
    for (const r of rows) {
      const key = String(r.barcode).trim();
      if (!key) continue;
      if (!map[key]) {
        map[key] = {
          scanQty: 0,
          localSalePrice: r.salePrice ?? null,
          localPurchasePrice: r.purchasePrice ?? null,
          names: [],
          variants: [],
          notes: [],
        };
      }
      map[key].scanQty += Number.isFinite(r.qty) ? r.qty : 0;
      if (map[key].localSalePrice == null && r.salePrice != null) map[key].localSalePrice = r.salePrice;
      if (map[key].localPurchasePrice == null && r.purchasePrice != null) map[key].localPurchasePrice = r.purchasePrice;
      if (r.name && !map[key].names.includes(r.name)) map[key].names.push(r.name);
      if (r.variant && !map[key].variants.includes(r.variant)) map[key].variants.push(r.variant);
      if (r.note && !map[key].notes.includes(r.note)) map[key].notes.push(r.note);
    }
    setGrouped(map);
  };

  const startAnalyse = async () => {
    const barcodes = Object.keys(grouped);
    if (barcodes.length === 0) {
      setAlert('Geen gegroepeerde barcodes om te analyseren.');
      return;
    }
    try {
      const res = await fetch('/api/odoo/analyse-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes, mode: 'activeOnly' }),
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = (await res.json()) as AnalyseApiItem[];
      const byBarcode = new Map<string, AnalyseApiItem>();
      for (const item of data) byBarcode.set(item.barcode, item);

      const rows: AnalyseRow[] = barcodes.map((code) => {
        const base = grouped[code];
        const item = byBarcode.get(code);
        const act = item?.active ?? null;
        const arc = item?.archived ?? null;
        const status: 'actief' | 'archief' | 'geen' = act ? 'actief' : arc ? 'archief' : 'geen';
        const localName = base?.names?.[0] ?? null;
        const localVariant = base?.variants?.[0] ?? null;
        const localNamesExtra = base?.names && base.names.length > 1 ? base.names.slice(1) : [];
        const localVariantsExtra = base?.variants && base.variants.length > 1 ? base.variants.slice(1) : [];
        return {
          barcode: code,
          scanQty: base?.scanQty ?? 0,
          localSalePrice: base?.localSalePrice ?? null,
          localPurchasePrice: base?.localPurchasePrice ?? null,
          localName,
          localVariant,
          localNamesExtra,
          localVariantsExtra,
          localNotes: base?.notes ?? [],
          active: act,
          archived: arc,
          status,
          merk: null,
        };
      });

      // Fetch merk information
      const templateIds = new Set<number>();
      rows.forEach((row) => {
        const tmplId = row.active?.productTmplId ?? row.archived?.productTmplId ?? null;
        if (tmplId !== null) {
          templateIds.add(tmplId);
        }
      });

      if (templateIds.size > 0) {
        try {
          const brandRes = await fetch('/api/odoo/fetch-brands-for-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateIds: Array.from(templateIds) }),
          });
          if (brandRes.ok) {
            const brandMap = (await brandRes.json()) as Record<number, string | null>;
            rows.forEach((row) => {
              const tmplId = row.active?.productTmplId ?? row.archived?.productTmplId ?? null;
              if (tmplId !== null && brandMap[tmplId]) {
                row.merk = brandMap[tmplId];
              }
            });
          }
        } catch {
          // Silently fail merk fetch
        }
      }

      setAnalysed(rows);
    } catch (error: unknown) {
      setAlert(error instanceof Error ? error.message : 'Analyse mislukt.');
    }
  };

  const filtered = useMemo(() => {
    return analysed.filter(r => {
      if (filter.status !== 'alle' && r.status !== filter.status) return false;
      if (filter.category) {
        const cat = r.active?.categName || r.archived?.categName || '';
        if (!cat.toLowerCase().includes(filter.category.toLowerCase())) return false;
      }
      if (filter.text) {
        const hay =
          `${r.barcode} ${(r.active?.name || r.archived?.name || r.localName || '')}`.toLowerCase();
        if (!hay.includes(filter.text.toLowerCase())) return false;
      }
      return true;
    });
  }, [analysed, filter]);

  // Only show products with product_tmpl_id (can be updated)
  const updatableRows = useMemo(() => {
    return filtered.filter(r => {
      const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
      return tmplId !== null;
    });
  }, [filtered]);

  const extractMerkFromName = (name: string): string | null => {
    if (!name) return null;
    const parts = name.split(' - ');
    if (parts.length > 1 && parts[0].trim()) {
      return parts[0].trim();
    }
    return null;
  };

  const computeMerk = (row: AnalyseRow): { merk: string; fromName: boolean } => {
    if (row.merk) {
      return { merk: row.merk, fromName: false };
    }
    const name = row.active?.name || row.archived?.name || row.localName || '';
    const merkFromName = extractMerkFromName(name);
    return { merk: merkFromName || '', fromName: merkFromName !== null };
  };

  const sortRows = useCallback((rows: AnalyseRow[], sort: SortState) => {
    const sorted = [...rows].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      const val = (key: SortKey, row: AnalyseRow): number | string => {
        switch (key) {
          case 'barcode': return row.barcode;
          case 'name': return computeName(row);
          case 'variant': return computeVariant(row);
          case 'scanQty': return row.scanQty;
          case 'odooQty': return computeOdooQty(row) ?? '';
          case 'diff': return computeDiff(row);
          case 'category': return computeCategory(row);
          case 'status': return row.status;
          case 'merk': return computeMerk(row).merk;
        }
      };
      const av = val(sort.key, a);
      const bv = val(sort.key, b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return sorted;
  }, []);

  const foundRows = useMemo(() => sortRows(updatableRows.filter(isFoundTrue), sortFound), [updatableRows, sortFound, sortRows]);
  const unknownRows = useMemo(() => sortRows(filtered.filter(r => !isFoundTrue(r)), { key: 'barcode', dir: 'asc' }), [filtered, sortRows]);

  const stats = useMemo(() => {
    const totalItems = analysed.length;
    const totalCount = analysed.reduce((acc, r) => acc + (Number.isFinite(r.scanQty) ? r.scanQty : 0), 0);
    return { totalItems, totalCount };
  }, [analysed]);

  const setSel = (barcode: string, value: boolean) => {
    setSelected(prev => ({ ...prev, [barcode]: value }));
  };

  const allVisibleSelected = updatableRows.every(r => selected[r.barcode]);
  const toggleSelectAll = () => {
    const next: Record<string, boolean> = { ...selected };
    const target = !allVisibleSelected;
    for (const r of updatableRows) next[r.barcode] = target;
    setSelected(next);
  };

  const getSelectedTemplateIds = (): number[] => {
    const templateIds: number[] = [];
    for (const r of updatableRows) {
      if (selected[r.barcode]) {
        const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
        if (tmplId !== null) {
          templateIds.push(tmplId);
        }
      }
    }
    return templateIds;
  };

  const getAllTemplateIds = (): number[] => {
    const templateIds: number[] = [];
    for (const r of updatableRows) {
      const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
      if (tmplId !== null) {
        templateIds.push(tmplId);
      }
    }
    return templateIds;
  };

  const openPreviewCategory = async () => {
    if (!selectedCategory) {
      setAlert('Selecteer eerst een categorie.');
      return;
    }

    const templateIds = getSelectedTemplateIds();
    if (templateIds.length === 0) {
      setAlert('Selecteer eerst producten om te bewerken.');
      return;
    }

    // Build preview changes
    const changes: PreviewChange[] = [];
    const category = categories.find(c => c.id === selectedCategory);
    
    for (const r of updatableRows) {
      if (selected[r.barcode]) {
        const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
        if (tmplId !== null) {
          const oldCategId = r.active?.categId ?? r.archived?.categId ?? null;
          const oldCategName = r.active?.categName ?? r.archived?.categName ?? null;
          changes.push({
            templateId: tmplId,
            barcode: r.barcode,
            name: computeName(r),
            oldCategoryId: oldCategId,
            oldCategoryName: oldCategName,
            newCategoryId: selectedCategory,
            newCategoryName: category?.name || '',
            oldLabelIds: [],
            oldLabelNames: [],
            newLabelIds: [],
            newLabelNames: [],
          });
        }
      }
    }

    setPreviewChanges(changes);
    setPreviewMode('category');
    setPreviewOpen(true);
  };

  const openPreviewLabel = async () => {
    if (!selectedLabel) {
      setAlert('Selecteer eerst een label.');
      return;
    }

    const templateIds = getSelectedTemplateIds();
    if (templateIds.length === 0) {
      setAlert('Selecteer eerst producten om te bewerken.');
      return;
    }

    // For now, we'll show a simplified preview since we don't fetch current labels
    // In a real implementation, you'd fetch current labels from Odoo
    const changes: PreviewChange[] = [];
    const label = labels.find(l => l.id === selectedLabel);
    
    for (const r of updatableRows) {
      if (selected[r.barcode]) {
        const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
        if (tmplId !== null) {
          changes.push({
            templateId: tmplId,
            barcode: r.barcode,
            name: computeName(r),
            oldCategoryId: null,
            oldCategoryName: null,
            newCategoryId: null,
            newCategoryName: null,
            oldLabelIds: [],
            oldLabelNames: [],
            newLabelIds: [selectedLabel],
            newLabelNames: label ? [label.name] : [],
          });
        }
      }
    }

    setPreviewChanges(changes);
    setPreviewMode('label');
    setPreviewOpen(true);
  };

  const openPreviewCategoryAll = async () => {
    if (!selectedCategory) {
      setAlert('Selecteer eerst een categorie.');
      return;
    }

    const templateIds = getAllTemplateIds();
    if (templateIds.length === 0) {
      setAlert('Geen producten gevonden om te bewerken.');
      return;
    }

    const changes: PreviewChange[] = [];
    const category = categories.find(c => c.id === selectedCategory);
    
    for (const r of updatableRows) {
      const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
      if (tmplId !== null) {
        const oldCategId = r.active?.categId ?? r.archived?.categId ?? null;
        const oldCategName = r.active?.categName ?? r.archived?.categName ?? null;
        changes.push({
          templateId: tmplId,
          barcode: r.barcode,
          name: computeName(r),
          oldCategoryId: oldCategId,
          oldCategoryName: oldCategName,
          newCategoryId: selectedCategory,
          newCategoryName: category?.name || '',
          oldLabelIds: [],
          oldLabelNames: [],
          newLabelIds: [],
          newLabelNames: [],
        });
      }
    }

    setPreviewChanges(changes);
    setPreviewMode('category');
    setPreviewOpen(true);
  };

  const openPreviewLabelAll = async () => {
    if (!selectedLabel) {
      setAlert('Selecteer eerst een label.');
      return;
    }

    const templateIds = getAllTemplateIds();
    if (templateIds.length === 0) {
      setAlert('Geen producten gevonden om te bewerken.');
      return;
    }

    const changes: PreviewChange[] = [];
    const label = labels.find(l => l.id === selectedLabel);
    
    for (const r of updatableRows) {
      const tmplId = r.active?.productTmplId ?? r.archived?.productTmplId ?? null;
      if (tmplId !== null) {
        changes.push({
          templateId: tmplId,
          barcode: r.barcode,
          name: computeName(r),
          oldCategoryId: null,
          oldCategoryName: null,
          newCategoryId: null,
          newCategoryName: null,
          oldLabelIds: [],
          oldLabelNames: [],
          newLabelIds: [selectedLabel],
          newLabelNames: label ? [label.name] : [],
        });
      }
    }

    setPreviewChanges(changes);
    setPreviewMode('label');
    setPreviewOpen(true);
  };

  const applyChanges = async () => {
    if (previewChanges.length === 0) {
      setAlert('Geen wijzigingen om toe te passen.');
      return;
    }

    setIsUpdating(true);
    try {
      if (previewMode === 'category') {
        const templateIds = previewChanges.map(c => c.templateId);
        const categoryId = previewChanges[0].newCategoryId;
        if (!categoryId) {
          throw new Error('Geen categorie geselecteerd');
        }

        const res = await fetch('/api/odoo/update-product-category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateIds, categoryId }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Update mislukt');
        }

        const result = await res.json();
        setAlert(`✅ ${result.updatedCount} product(en) bijgewerkt met nieuwe categorie.`);
        
        // Refresh analysis to get updated categories
        await startAnalyse();
      } else if (previewMode === 'label') {
        const templateIds = previewChanges.map(c => c.templateId);
        const labelIds = previewChanges[0].newLabelIds;
        if (!labelIds || labelIds.length === 0) {
          throw new Error('Geen label geselecteerd');
        }

        const res = await fetch('/api/odoo/update-product-labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ templateIds, labelIds, mode: 'add' }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Update mislukt');
        }

        const result = await res.json();
        setAlert(`✅ ${result.updatedCount} product(en) bijgewerkt met nieuwe label(s).`);
      }

      setPreviewOpen(false);
      // Behoud selectie zodat gebruiker daarna ook een label/categorie kan toepassen
      // setSelected({}); // Verwijderd: selectie blijft behouden
      // Reset alleen de geselecteerde categorie/label, niet de product selectie
      if (previewMode === 'category') {
        setSelectedCategory(null);
      } else if (previewMode === 'label') {
        setSelectedLabel(null);
      }
    } catch (error: unknown) {
      setAlert(error instanceof Error ? error.message : 'Update mislukt.');
    } finally {
      setIsUpdating(false);
    }
  };

  const saveDraft = () => {
    try {
      const draft = {
        upload,
        analysed,
        filter,
        timestamp: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const formatTs = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      };
      const name = `voorraad-bewerken-draft-${formatTs(new Date())}.json`;
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setAlert('Draft opgeslagen.');
    } catch {
      setAlert('Opslaan mislukt.');
    }
  };

  const loadDraft = () => {
    draftFileRef.current?.click();
  };

  const onDraftFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        upload?: UploadShape | null;
        analysed?: AnalyseRow[];
        filter?: FilterState;
      };
      if (parsed.upload) setUpload(parsed.upload);
      if (Array.isArray(parsed.analysed)) setAnalysed(parsed.analysed);
      if (parsed.filter) setFilter(parsed.filter);
      setAlert('Draft geladen.');
      if (e.target) e.target.value = '';
    } catch {
      setAlert('Laden mislukt.');
    }
  };

  if (isLoading) {
    return (
      <>
        <Head><title>Voorraad Bewerken</title></Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }
  if (!isLoggedIn) return null;

  return (
    <>
      <Head><title>Voorraad Bewerken</title></Head>
      <main style={{ padding: 16, maxWidth: 1300, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Voorraad Bewerken</h1>

        {alertMessage ? (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 8, borderRadius: 4, marginBottom: 12 }}>
            {alertMessage}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={onChooseFile} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>Upload JSON</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onFileChange} />
          <button onClick={loadFromLocal} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>Laad uit localStorage</button>
          <button onClick={startAnalyse} style={{ padding: '6px 10px', border: '1px solid #10b981', borderRadius: 4, background: '#ecfdf5', color: '#065f46' }}>
            Analyse starten
          </button>
          <button onClick={saveDraft} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>Opslaan als draft</button>
          <button onClick={loadDraft} style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>Laad draft</button>
          <input ref={draftFileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onDraftFileChange} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div><strong>Totaal items:</strong> {stats.totalItems} &nbsp; <strong>Aantallen:</strong> {stats.totalCount}</div>
          </div>
        </div>

        {/* Edit Controls */}
        <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>Bewerkingen</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Categorie</label>
              <select
                value={selectedCategory || ''}
                onChange={e => setSelectedCategory(e.target.value ? parseInt(e.target.value) : null)}
                disabled={loadingCategories}
                style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, minWidth: 200 }}
              >
                <option value="">-- Selecteer categorie --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button
                onClick={openPreviewCategory}
                disabled={!selectedCategory || Object.keys(selected).filter(bc => selected[bc]).length === 0}
                style={{
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #10b981',
                  background: '#ecfdf5',
                  color: '#065f46',
                  opacity: (!selectedCategory || Object.keys(selected).filter(bc => selected[bc]).length === 0) ? 0.5 : 1,
                  cursor: (!selectedCategory || Object.keys(selected).filter(bc => selected[bc]).length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                Toepassen op geselecteerde ({Object.keys(selected).filter(bc => selected[bc]).length})
              </button>
              <button
                onClick={openPreviewCategoryAll}
                disabled={!selectedCategory || updatableRows.length === 0}
                style={{
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #10b981',
                  background: '#ecfdf5',
                  color: '#065f46',
                  opacity: (!selectedCategory || updatableRows.length === 0) ? 0.5 : 1,
                  cursor: (!selectedCategory || updatableRows.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                Toepassen op alle ({updatableRows.length})
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Productsjabloonlabel</label>
              <select
                value={selectedLabel || ''}
                onChange={e => setSelectedLabel(e.target.value ? parseInt(e.target.value) : null)}
                disabled={loadingLabels}
                style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, minWidth: 200 }}
              >
                <option value="">-- Selecteer label --</option>
                {labels.map(label => (
                  <option key={label.id} value={label.id}>{label.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button
                onClick={openPreviewLabel}
                disabled={!selectedLabel || Object.keys(selected).filter(bc => selected[bc]).length === 0}
                style={{
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #2563eb',
                  background: '#eff6ff',
                  color: '#1e40af',
                  opacity: (!selectedLabel || Object.keys(selected).filter(bc => selected[bc]).length === 0) ? 0.5 : 1,
                  cursor: (!selectedLabel || Object.keys(selected).filter(bc => selected[bc]).length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                Toepassen op geselecteerde ({Object.keys(selected).filter(bc => selected[bc]).length})
              </button>
              <button
                onClick={openPreviewLabelAll}
                disabled={!selectedLabel || updatableRows.length === 0}
                style={{
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: '1px solid #2563eb',
                  background: '#eff6ff',
                  color: '#1e40af',
                  opacity: (!selectedLabel || updatableRows.length === 0) ? 0.5 : 1,
                  cursor: (!selectedLabel || updatableRows.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                Toepassen op alle ({updatableRows.length})
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Status
            <select value={filter.status} onChange={e => setFilter(prev => ({ ...prev, status: e.target.value as FilterState['status'] }))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <option value="alle">Alle</option>
              <option value="actief">Actief</option>
              <option value="archief">Gearchiveerd</option>
              <option value="geen">Geen match</option>
            </select>
          </label>
          <input placeholder="Filter categorie" value={filter.category} onChange={e => setFilter(prev => ({ ...prev, category: e.target.value }))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4 }} />
          <input placeholder="Zoeken (barcode of naam)" value={filter.text} onChange={e => setFilter(prev => ({ ...prev, text: e.target.value }))} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, flex: 1 }} />
        </div>

        {/* Info: Only updatable products shown */}
        {updatableRows.length < filtered.length ? (
          <div style={{ padding: 8, background: '#eff6ff', color: '#1e40af', borderRadius: 4, marginBottom: 12 }}>
            <strong>Info:</strong> Alleen producten met product template ID worden getoond ({updatableRows.length} van {filtered.length}).
          </div>
        ) : null}

        {/* TABEL 1: Gevonden (actief/archief) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Gevonden (actief/archief) — {foundRows.length}</h2>
          <button
            onClick={() => setShowFound(v => !v)}
            style={{ marginLeft: 8, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            {showFound ? 'Inklappen' : 'Uitklappen'}
          </button>
        </div>
        {showFound ? (
        <div ref={foundTableRef} style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} /></th>
                <SortableTh label="Barcode" active={sortFound.key==='barcode'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'barcode', dir: prev.key==='barcode' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Naam" active={sortFound.key==='name'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'name', dir: prev.key==='name' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Variant" active={sortFound.key==='variant'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'variant', dir: prev.key==='variant' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Merk" active={sortFound.key==='merk'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'merk', dir: prev.key==='merk' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="ScanQty" active={sortFound.key==='scanQty'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'scanQty', dir: prev.key==='scanQty' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="OdooQty" active={sortFound.key==='odooQty'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'odooQty', dir: prev.key==='odooQty' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Verschil" active={sortFound.key==='diff'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'diff', dir: prev.key==='diff' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Categorie" active={sortFound.key==='category'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'category', dir: prev.key==='category' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
                <SortableTh label="Status" active={sortFound.key==='status'} dir={sortFound.dir} onClick={() => setSortFound(prev => ({ key: 'status', dir: prev.key==='status' && prev.dir==='asc' ? 'desc' : 'asc' }))} />
              </tr>
            </thead>
            <tbody>
              {foundRows.map((r) => {
                const name = r.active?.name || r.archived?.name || r.localName || '';
                const variant = r.active?.name ? '' : (r.localVariant || '');
                const odooQty = r.active?.qtyAvailable ?? r.archived?.qtyAvailable ?? null;
                const diff = (odooQty ?? 0) - r.scanQty;
                const cat = r.active?.categName || r.archived?.categName || '';
                const rowStyle: React.CSSProperties = { borderTop: '1px solid #e5e7eb', background: diff !== 0 ? '#f3f4f6' : undefined };
                return (
                  <tr key={r.barcode} style={rowStyle}>
                    <td style={tdStyle}><input type="checkbox" checked={!!selected[r.barcode]} onChange={e => setSel(r.barcode, e.target.checked)} /></td>
                    <td style={tdStyle} title={r.barcode}>{r.barcode}</td>
                    <td style={{ ...tdStyle, maxWidth: 320 }} title={name}>{name}</td>
                    <td style={{ ...tdStyle, maxWidth: 260 }} title={variant}>{variant}</td>
                    {(() => {
                      const merkInfo = computeMerk(r);
                      return (
                        <td 
                          style={{
                            ...tdStyle,
                            fontWeight: merkInfo.fromName ? 'bold' : undefined,
                            fontStyle: merkInfo.fromName ? 'italic' : undefined,
                          }}
                        >
                          {merkInfo.merk || ''}
                        </td>
                      );
                    })()}
                    <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{r.scanQty}</td>
                    <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{odooQty ?? ''}</td>
                    <td style={{ ...tdStyle, width: 90, textAlign: 'right', color: diff === 0 ? '#059669' : diff > 0 ? '#2563eb' : '#dc2626' }}>{diff}</td>
                    <td style={tdStyle} title={cat}>{cat}</td>
                    <td style={tdStyle}>{r.status}</td>
                  </tr>
                );
              })}
              {foundRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                    Geen gevonden producten.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}

        {/* TABEL 2: Niet gevonden */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Niet gevonden — {unknownRows.length}</h2>
          <button
            onClick={() => setShowUnknown(v => !v)}
            style={{ marginLeft: 8, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            {showUnknown ? 'Inklappen' : 'Uitklappen'}
          </button>
        </div>
        {showUnknown ? (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Barcode</th>
                <th style={thStyle}>Naam</th>
                <th style={thStyle}>Variant</th>
                <th style={thStyle}>Merk</th>
                <th style={thStyle}>ScanQty</th>
                <th style={thStyle}>Categorie</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {unknownRows.map((r) => {
                const name = r.active?.name || r.archived?.name || r.localName || '';
                const variant = r.active?.name ? '' : (r.localVariant || '');
                const cat = r.active?.categName || r.archived?.categName || '';
                return (
                  <tr key={r.barcode} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tdStyle} title={r.barcode}>{r.barcode}</td>
                    <td style={{ ...tdStyle, maxWidth: 320 }} title={name}>{name}</td>
                    <td style={{ ...tdStyle, maxWidth: 260 }} title={variant}>{variant}</td>
                    {(() => {
                      const merkInfo = computeMerk(r);
                      return (
                        <td 
                          style={{
                            ...tdStyle,
                            fontWeight: merkInfo.fromName ? 'bold' : undefined,
                            fontStyle: merkInfo.fromName ? 'italic' : undefined,
                          }}
                        >
                          {merkInfo.merk || ''}
                        </td>
                      );
                    })()}
                    <td style={{ ...tdStyle, width: 80, textAlign: 'right' }}>{r.scanQty}</td>
                    <td style={tdStyle} title={cat}>{cat}</td>
                    <td style={tdStyle}>{r.status}</td>
                  </tr>
                );
              })}
              {unknownRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                    Geen niet-gevonden producten.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}

        {/* Preview Modal */}
        {previewOpen ? (
          <div style={modalBackdropStyle} onClick={() => !isUpdating && setPreviewOpen(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>
                {previewMode === 'category' ? 'Categorie wijziging preview' : 'Label wijziging preview'}
              </h3>
              <p style={{ marginTop: 0, color: '#6b7280' }}>
                {previewChanges.length} product(en) worden gewijzigd. Controleer de wijzigingen hieronder.
              </p>
              <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 8, marginBottom: 12 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead style={{ background: '#f9fafb' }}>
                    <tr>
                      <th style={thStyle}>Barcode</th>
                      <th style={thStyle}>Naam</th>
                      {previewMode === 'category' ? (
                        <>
                          <th style={thStyle}>Huidige categorie</th>
                          <th style={thStyle}>Nieuwe categorie</th>
                        </>
                      ) : (
                        <>
                          <th style={thStyle}>Nieuwe label(s)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewChanges.map((change, idx) => (
                      <tr key={`${change.templateId}-${idx}`} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={tdStyle}>{change.barcode}</td>
                        <td style={{ ...tdStyle, maxWidth: 300 }} title={change.name}>{change.name}</td>
                        {previewMode === 'category' ? (
                          <>
                            <td style={tdStyle}>{change.oldCategoryName || '(geen)'}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: '#059669' }}>{change.newCategoryName}</td>
                          </>
                        ) : (
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#2563eb' }}>
                            {change.newLabelNames.join(', ') || '(geen)'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setPreviewOpen(false)}
                  disabled={isUpdating}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc' }}
                >
                  Annuleren
                </button>
                <button
                  onClick={applyChanges}
                  disabled={isUpdating}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid #10b981',
                    background: '#ecfdf5',
                    color: '#065f46',
                    opacity: isUpdating ? 0.5 : 1,
                    cursor: isUpdating ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isUpdating ? 'Bezig met bijwerken...' : 'Wijzigingen toepassen'}
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
  maxWidth: 900,
  boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
};

function SortableTh(props: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  const arrow = props.active ? (props.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
      onClick={props.onClick}
      title="Sorteren"
    >
      {props.label} {arrow}
    </th>
  );
}

