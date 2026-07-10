import { useState, useEffect, useRef } from 'react';
import {
  getSupplier,
  getAllSuppliers,
  createParseContext,
} from '@/lib/suppliers';
import type {
  ParsedProduct,
  ProductVariant,
  Brand,
  SupplierFiles,
} from '@/lib/suppliers/types';
import { generateUniqueEAN13Batch } from '@/lib/import/shared/ean-utils';
import { determineSizeAttribute, mapSizeToOdooFormat, isUnitSize } from '@/lib/import/shared';
import { findMatchingPublicCategories } from '@/components/import/shared/CategoryMatcher';
import { transformProductForUpload, isUnitOnlyProduct } from '@/components/import/shared/product-utils';
import { compressImage } from '@/lib/import/shared/image-utils';
import type {
  Category,
  StepConfig,
  ImportResults,
  ImportProgress,
  ImagePoolItem,
  ImageImportResult,
} from '@/components/import/shared/types';

type VendorType = string | null;

const STEPS: StepConfig[] = [
  { id: 1, name: 'Upload', icon: '📤' },
  { id: 2, name: 'Mapping', icon: '🗺️' },
  { id: 3, name: 'Voorraad', icon: '📦' },
  { id: 4, name: 'Categorieën', icon: '📁' },
  { id: 5, name: 'Afbeeldingen', icon: '🖼️' },
  { id: 6, name: 'Preview', icon: '👁️' },
  { id: 7, name: 'Test', icon: '🧪' },
  { id: 8, name: 'Import', icon: '🚀' },
];

export default function useImportWizard() {
  // ─── Core wizard state ──────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedVendor, setSelectedVendor] = useState<VendorType>(null);
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set(),
  );

  // ─── AI description state ─────────────────────────────────────────────
  const [generatingDescription, setGeneratingDescription] = useState<
    Set<string>
  >(new Set());
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptCategory, setPromptCategory] = useState<
    'kinderen' | 'volwassenen'
  >('kinderen');
  const [aiTargetAudience, setAiTargetAudience] = useState<
    'auto' | 'kinderen' | 'volwassenen'
  >('auto');
  const [customPromptKinderen, setCustomPromptKinderen] = useState('');
  const [customPromptVolwassenen, setCustomPromptVolwassenen] = useState('');
  const [defaultPrompts, setDefaultPrompts] = useState<{
    kinderen: { systemPrompt: string; name: string };
    volwassenen: { systemPrompt: string; name: string };
  } | null>(null);

  // ─── Categories & brands ──────────────────────────────────────────────
  const [brands, setBrands] = useState<Brand[]>([]);
  const [internalCategories, setInternalCategories] = useState<Category[]>([]);
  const [publicCategories, setPublicCategories] = useState<Category[]>([]);
  const [productTags, setProductTags] = useState<Category[]>([]);
  const [batchBrand, setBatchBrand] = useState('');
  const [batchCategory, setBatchCategory] = useState('');
  const [batchPublicCategories, setBatchPublicCategories] = useState<number[]>(
    [],
  );
  const [batchProductTags, setBatchProductTags] = useState<number[]>([]);

  // Search filters for dropdowns
  const [brandSearch, setBrandSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [publicCategorySearch, setPublicCategorySearch] = useState('');
  const [productTagSearch, setProductTagSearch] = useState('');

  const [categoriesDataError, setCategoriesDataError] = useState<string | null>(
    null,
  );

  // ─── Import results ───────────────────────────────────────────────────
  const [importResults, setImportResults] = useState<ImportResults | null>(
    null,
  );
  const [showApiPreview, setShowApiPreview] = useState(false);
  const [apiPreviewData, setApiPreviewData] = useState<{
    product: ParsedProduct;
    testMode: boolean;
  } | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const [imageImportResults, setImageImportResults] = useState<
    ImageImportResult[]
  >([]);

  // ─── Image pool ───────────────────────────────────────────────────────
  const [imagePool, setImagePool] = useState<ImagePoolItem[]>([]);
  const imageIdCounter = useRef(0);
  const importAbortRef = useRef<AbortController | null>(null);

  // ─── Docling document import ─────────────────────────────────────────
  const [doclingResult, setDoclingResult] = useState<{
    markdown: string;
    tables: Array<{
      headers: string[];
      rows: string[][];
      pageNo: number;
      suggestedMapping: Record<string, string | null>;
    }>;
    images: Array<{
      base64?: string;
      uri?: string;
      classification?: string;
      description?: string;
      pageNo: number;
    }>;
  } | null>(null);
  const [doclingProcessing, setDoclingProcessing] = useState(false);

  // ─── Supplier files ───────────────────────────────────────────────────
  const [supplierFiles, setSupplierFiles] = useState<Record<string, string>>(
    {},
  );
  const supplierFilesRef = useRef<Record<string, string>>({});
  const [supplierFileStatus, setSupplierFileStatus] = useState<
    Record<string, boolean>
  >({});
  const [tangerinePastedText, setTangerinePastedText] = useState('');

  useEffect(() => {
    supplierFilesRef.current = supplierFiles;
  }, [supplierFiles]);

  // ─── Barcode tracking ─────────────────────────────────────────────────
  const [existingBarcodes, setExistingBarcodes] = useState<
    Map<string, { name: string; qty: number }>
  >(new Map());
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [generatingBarcodes, setGeneratingBarcodes] = useState(false);

  // ─── Credentials helper ───────────────────────────────────────────────
  const getCredentials = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (data.isLoggedIn && data.user) {
        const password = localStorage.getItem('odoo_pass');
        if (password) {
          return { uid: String(data.user.uid), password };
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }

    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  // ─── Data fetching ────────────────────────────────────────────────────
  const fetchBrands = async () => {
    try {
      setCategoriesDataError(null);
      const { uid, password } = await getCredentials();
      if (!uid || !password) {
        setCategoriesDataError(
          'Je bent niet ingelogd op Odoo. Log in op de startpagina om merken en categorieën te laden.',
        );
        return;
      }

      const response = await fetch('/api/fetch-brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      const data = await response.json();

      if (data.success && data.brands) {
        setBrands(data.brands);
        console.log(`✅ Fetched ${data.brands.length} brands`);
      } else {
        setCategoriesDataError(data.error || 'Merken laden mislukt.');
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
      setCategoriesDataError(
        'Fout bij laden van merken. Controleer je verbinding.',
      );
    }
  };

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      setCategoriesDataError(null);
      const { uid, password } = await getCredentials();
      if (!uid || !password) {
        setCategoriesDataError(
          'Je bent niet ingelogd op Odoo. Log in op de startpagina om merken en categorieën te laden.',
        );
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/debug-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      const data = await response.json();

      if (data.success) {
        setInternalCategories(data.internalCategories || []);
        setPublicCategories(data.publicCategories || []);
        setProductTags(data.productTags || []);
        console.log(
          `✅ Loaded ${data.internalCategories?.length || 0} internal, ${data.publicCategories?.length || 0} public, ${data.productTags?.length || 0} tags`,
        );
      } else {
        setCategoriesDataError(data.error || 'Categorieën laden mislukt.');
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategoriesDataError(
        'Fout bij laden van categorieën. Controleer je verbinding.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Barcode checking ─────────────────────────────────────────────────
  const checkExistingBarcodes = async (products: ParsedProduct[]) => {
    const allBarcodes = products
      .flatMap((p) => p.variants.map((v) => v.ean))
      .filter(Boolean);
    if (allBarcodes.length === 0)
      return new Map<string, { name: string; qty: number }>();

    setCheckingExisting(true);
    try {
      const response = await fetch('/api/odoo/check-existing-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes: allBarcodes }),
      });

      if (!response.ok)
        return new Map<string, { name: string; qty: number }>();

      const data = await response.json();
      if (data.error)
        return new Map<string, { name: string; qty: number }>();

      const map = new Map<string, { name: string; qty: number }>();
      for (const item of data.found || []) {
        map.set(item.barcode, { name: item.name, qty: item.qtyAvailable });
      }
      setExistingBarcodes(map);

      if (map.size > 0) {
        const existingRefs = new Set<string>();
        for (const product of products) {
          const hasExisting = product.variants.some((v) => map.has(v.ean));
          if (hasExisting) existingRefs.add(product.reference);
        }
        setSelectedProducts((prev) => {
          const next = new Set(prev);
          existingRefs.forEach((ref) => next.delete(ref));
          return next;
        });
        console.log(
          `Bestaande producten in Odoo: ${existingRefs.size} (automatisch gedeselecteerd)`,
        );
      }

      return map;
    } catch (error) {
      console.error('Error checking existing barcodes:', error);
      return new Map<string, { name: string; qty: number }>();
    } finally {
      setCheckingExisting(false);
    }
  };

  // ─── Barcode generation ───────────────────────────────────────────────
  const generateBarcodes = async () => {
    const emptyEanVariants: { productRef: string; variantIdx: number }[] = [];
    const existingEans = new Set<string>();

    for (const product of parsedProducts) {
      for (let idx = 0; idx < product.variants.length; idx++) {
        const ean = product.variants[idx].ean;
        if (!ean) {
          emptyEanVariants.push({
            productRef: product.reference,
            variantIdx: idx,
          });
        } else {
          existingEans.add(ean);
        }
      }
    }

    if (emptyEanVariants.length === 0) {
      alert('Alle varianten hebben al een EAN barcode.');
      return;
    }

    setGeneratingBarcodes(true);
    try {
      const candidates = generateUniqueEAN13Batch(
        emptyEanVariants.length,
        existingEans,
      );

      const response = await fetch('/api/odoo/check-existing-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes: candidates }),
      });

      let odooExisting = new Set<string>();
      if (response.ok) {
        const data = await response.json();
        if (data.found?.length) {
          odooExisting = new Set(
            data.found.map((f: { barcode: string }) => f.barcode),
          );
        }
      }

      const allExcluded = new Set([...existingEans, ...odooExisting]);
      const cleanCandidates = candidates.filter(
        (c) => !odooExisting.has(c),
      );

      let finalCodes = cleanCandidates;
      if (cleanCandidates.length < emptyEanVariants.length) {
        const extra = generateUniqueEAN13Batch(
          emptyEanVariants.length - cleanCandidates.length,
          allExcluded,
        );
        finalCodes = [...cleanCandidates, ...extra];
      }

      setParsedProducts((products) =>
        products.map((p) => ({
          ...p,
          variants: p.variants.map((v, idx) => {
            if (v.ean) return v;
            const entry = emptyEanVariants.find(
              (e) => e.productRef === p.reference && e.variantIdx === idx,
            );
            if (!entry) return v;
            const assignIdx = emptyEanVariants.indexOf(entry);
            return { ...v, ean: finalCodes[assignIdx] || '' };
          }),
        })),
      );

      const odooCollisions = odooExisting.size;
      alert(
        `${finalCodes.length} EAN-13 barcodes gegenereerd` +
          (odooCollisions > 0
            ? ` (${odooCollisions} al in Odoo, opnieuw gegenereerd).`
            : '.'),
      );
    } catch (error) {
      console.error('Error generating barcodes:', error);
      alert(
        'Fout bij genereren van barcodes: ' + (error as Error).message,
      );
    } finally {
      setGeneratingBarcodes(false);
    }
  };

  // ─── File handling ────────────────────────────────────────────────────
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    fileInputId?: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (e.target) {
      e.target.value = '';
    }

    const reader = new FileReader();
    reader.onerror = () => {
      console.error(`Kon bestand niet lezen: ${file.name}`);
      alert(`Kon bestand niet lezen: ${file.name}`);
    };
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!selectedVendor) return;

      const plugin = getSupplier(selectedVendor);
      if (!plugin) {
        console.warn(`No plugin found for vendor: ${selectedVendor}`);
        return;
      }

      const context = createParseContext(brands, selectedVendor);

      let targetFileInputId = fileInputId || 'main_csv';

      if (!fileInputId && plugin.fileDetection) {
        for (const rule of plugin.fileDetection) {
          if (rule.detect(text, file.name)) {
            if (
              rule.requiresExistingProducts &&
              parsedProducts.length === 0
            ) {
              alert(
                rule.orderError || 'Upload the required files first.',
              );
              return;
            }
            targetFileInputId = rule.fileInputId;
            break;
          }
        }
      }

      const updatedFiles = {
        ...supplierFilesRef.current,
        [targetFileInputId]: text,
      };
      supplierFilesRef.current = updatedFiles;
      setSupplierFiles(updatedFiles);
      setSupplierFileStatus((prev) => ({
        ...prev,
        [targetFileInputId]: true,
      }));

      try {
        const products = plugin.parse(
          updatedFiles as SupplierFiles,
          context,
        );
        if (products.length > 0) {
          setParsedProducts(products);
          setSelectedProducts(new Set(products.map((p) => p.reference)));
          checkExistingBarcodes(products);
          if (plugin.fileInputs.length <= 1) {
            setCurrentStep(2);
          }
        } else if (targetFileInputId !== 'main_csv') {
          const reparse = plugin.parse(
            updatedFiles as SupplierFiles,
            context,
          );
          if (reparse.length > 0) {
            setParsedProducts(reparse);
            setSelectedProducts(
              new Set(reparse.map((p) => p.reference)),
            );
            checkExistingBarcodes(reparse);
          }
        }
      } catch (err) {
        console.error('Parse error:', err);
        alert(`Fout bij parsen: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const handlePdfUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fileInputId: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVendor) return;

    const plugin = getSupplier(selectedVendor);
    if (!plugin?.pdfParseEndpoint) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      if (selectedVendor === 'tangerine') {
        if (fileInputId === 'order_pdf')
          formData.append('order', file);
        else formData.append('packing', file);
      } else {
        formData.append('pdf', file);
      }

      const response = await fetch(plugin.pdfParseEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (
        data.success &&
        data.costPrices &&
        selectedVendor === 'tangerine'
      ) {
        const costPrices = data.costPrices as Record<
          string,
          Record<string, number>
        >;
        const rrpPrices = (data.rrpPrices || {}) as Record<
          string,
          Record<string, number>
        >;
        const compositions = (data.compositions || {}) as Record<
          string,
          string
        >;
        let matchedCount = 0;
        setParsedProducts((prev) =>
          prev.map((p) => {
            const refKey = p.reference.replace(/\s+/g, ' ');
            const refCost =
              costPrices[p.reference] ?? costPrices[refKey];
            const refRrp =
              rrpPrices[p.reference] ?? rrpPrices[refKey];
            const composition =
              compositions[p.reference] ?? compositions[refKey];
            if (!refCost && !refRrp && !composition) return p;
            matchedCount++;
            const sizeKey = (size: string) => {
              const m = size.match(/^(\d+)\s*jaar$/);
              return m ? m[1] : size;
            };
            return {
              ...p,
              ecommerceDescription:
                composition || p.ecommerceDescription,
              variants: p.variants.map((v) => {
                const sk = sizeKey(v.size);
                const cost = refCost
                  ? (refCost[sk] ??
                      refCost[v.size] ??
                      refCost[''] ??
                      Object.values(refCost)[0] ??
                      0)
                  : 0;
                const rrp = refRrp
                  ? (refRrp[sk] ??
                      refRrp[v.size] ??
                      refRrp[''] ??
                      Object.values(refRrp)[0] ??
                      0)
                  : 0;
                return {
                  ...v,
                  price: cost > 0 ? cost : v.price,
                  rrp: rrp > 0 ? rrp : v.rrp,
                };
              }),
            };
          }),
        );
        setSupplierFileStatus((prev) => ({
          ...prev,
          [fileInputId]: true,
        }));
        if (matchedCount > 0) {
          alert(
            `Prijzen en beschrijvingen bijgewerkt voor ${matchedCount} producten.`,
          );
        }
      } else if (data.success && plugin.processPdfResults) {
        const context = createParseContext(brands, selectedVendor);
        const result = plugin.processPdfResults(
          data,
          parsedProducts,
          context,
        );

        if (result.products.length > 0) {
          setParsedProducts(result.products);
          setSelectedProducts(
            new Set(result.products.map((p) => p.reference)),
          );
          checkExistingBarcodes(result.products);
        }

        setSupplierFileStatus((prev) => ({
          ...prev,
          [fileInputId]: true,
        }));

        if (result.message) {
          alert(result.message);
        }
      } else {
        alert(
          `Fout bij parsen PDF: ${data.error || 'Onbekende fout'}`,
        );
      }
    } catch (error) {
      alert(`Fout bij uploaden PDF: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Play UP matched products loader ──────────────────────────────────
  const loadMatchedProducts = (data: {
    csvProducts: Array<{
      article: string;
      color: string;
      description: string;
      size: string;
      quantity: number;
      price: number;
    }>;
    matchedProducts: Array<{
      article: string;
      color: string;
      description: string;
      imageCount: number;
      images: string[];
    }>;
  }) => {
    try {
      const imageMap = new Map<string, string[]>();
      data.matchedProducts.forEach((mp) => {
        const key = `${mp.article}_${mp.color}`;
        imageMap.set(key, mp.images);
      });

      const productMap = new Map<string, ParsedProduct>();

      data.csvProducts.forEach((csvProduct) => {
        const key = `${csvProduct.article}_${csvProduct.color}`;

        if (!productMap.has(key)) {
          const sizeAttr = determineSizeAttribute(csvProduct.size);
          const images = imageMap.get(key) || [];

          productMap.set(key, {
            reference: csvProduct.article,
            name: `Play Up - ${csvProduct.description} - ${csvProduct.article}`,
            originalName: csvProduct.description,
            material: csvProduct.color,
            color: csvProduct.color,
            ecommerceDescription: csvProduct.description,
            variants: [],
            suggestedBrand: 'Play Up',
            publicCategories: [],
            productTags: [],
            isFavorite: false,
            isPublished: true,
            sizeAttribute: sizeAttr,
            images: images,
            imagesFetched: images.length > 0,
          });
        }

        const product = productMap.get(key)!;
        product.variants.push({
          size: csvProduct.size,
          quantity: csvProduct.quantity || 0,
          ean: '',
          price: csvProduct.price,
          rrp: 0,
        });
      });

      const products = Array.from(productMap.values());
      setParsedProducts(products);

      const withImages = products.filter(
        (p) => p.images && p.images.length > 0,
      ).length;
      const totalImages = products.reduce(
        (sum, p) => sum + (p.images?.length || 0),
        0,
      );

      alert(
        `✅ Loaded ${products.length} products from Image Matcher\n📸 ${withImages} products with images\n🖼️ ${totalImages} total images`,
      );

      setCurrentStep(2);

      console.log(
        `✅ Loaded ${products.length} products with ${totalImages} images`,
      );
    } catch (error) {
      console.error('Error loading matched products:', error);
      alert('Error loading matched products. Please try again.');
    }
  };

  // ─── Image handling for individual products ───────────────────────────
  const handleManualImageUpload = (
    productReference: string,
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (imageFiles.length === 0) {
      alert('Selecteer alleen afbeeldingen (jpg, png, etc.)');
      return;
    }

    const promises = imageFiles.map(async (file) => {
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (typeof result === 'string') {
            resolve(result);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return compressImage(rawDataUrl);
    });

    Promise.all(promises)
      .then((dataUrls) => {
        setParsedProducts((products) =>
          products.map((p) =>
            p.reference === productReference
              ? { ...p, images: [...(p.images || []), ...dataUrls] }
              : p,
          ),
        );
      })
      .catch((error) => {
        console.error('Error uploading images:', error);
        alert('Fout bij uploaden van afbeeldingen');
      });
  };

  const removeProductImage = (
    productReference: string,
    imageIndex: number,
  ) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productReference
          ? {
              ...p,
              images: p.images?.filter((_, idx) => idx !== imageIndex),
            }
          : p,
      ),
    );
  };

  // ─── Bulk image loading from files/folder ──────────────────────────────
  const addImagesFromFiles = async (files: FileList) => {
    const plugin = selectedVendor ? getSupplier(selectedVendor) : null;
    const extractRef = plugin?.imageUpload?.extractReference;

    const newImages: ImagePoolItem[] = [];

    for (const file of Array.from(files)) {
      if (!/\.(jpe?g|png|webp|gif)$/i.test(file.name)) continue;

      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(`Kon bestand niet lezen: ${file.name}`));
        reader.readAsDataURL(file);
      });
      const dataUrl = await compressImage(rawDataUrl);

      let assignedReference = '';
      if (extractRef) {
        const relativePath = (file as any).webkitRelativePath || '';
        const ref = extractRef(file.name, relativePath);
        if (ref) {
          const exactMatch = parsedProducts.find(
            (p) => selectedProducts.has(p.reference) && p.reference === ref,
          );
          const partialMatch = !exactMatch
            ? parsedProducts.find(
                (p) =>
                  selectedProducts.has(p.reference) &&
                  (p.reference.includes(ref) || ref.includes(p.reference)),
              )
            : null;
          assignedReference = (exactMatch || partialMatch)?.reference || '';
        }
      }

      if (!assignedReference) {
        const nameNoExt = file.name.replace(/\.[^.]+$/, '');
        const match = parsedProducts.find(
          (p) =>
            selectedProducts.has(p.reference) &&
            (nameNoExt.includes(p.reference) ||
              p.reference.includes(nameNoExt)),
        );
        if (match) assignedReference = match.reference;
      }

      const existingForRef =
        imagePool.filter((i) => i.assignedReference === assignedReference)
          .length +
        newImages.filter((i) => i.assignedReference === assignedReference)
          .length;

      newImages.push({
        id: `img-${++imageIdCounter.current}`,
        dataUrl,
        filename: file.name,
        file,
        assignedReference,
        order: existingForRef,
      });
    }

    setImagePool((prev) => [...prev, ...newImages]);
  };

  // ─── Product editing ──────────────────────────────────────────────────
  const toggleProduct = (reference: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(reference)) {
      newSelected.delete(reference);
    } else {
      newSelected.add(reference);
    }
    setSelectedProducts(newSelected);
  };

  const updateVariantQuantity = (
    productRef: string,
    variantIndex: number,
    newQuantity: number,
  ) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? {
              ...p,
              variants: p.variants.map((v, idx) =>
                idx === variantIndex ? { ...v, quantity: newQuantity } : v,
              ),
            }
          : p,
      ),
    );
  };

  const updateVariantField = (
    productRef: string,
    variantIndex: number,
    field: keyof ProductVariant,
    value: string | number,
  ) => {
    setParsedProducts((products) =>
      products.map((p) => {
        if (p.reference === productRef) {
          if (field === 'rrp') {
            return {
              ...p,
              variants: p.variants.map((v) => ({
                ...v,
                rrp: value as number,
              })),
            };
          }
          if (field === 'price') {
            return {
              ...p,
              variants: p.variants.map((v) => ({
                ...v,
                price: value as number,
              })),
            };
          }
          return {
            ...p,
            variants: p.variants.map((v, idx) =>
              idx === variantIndex ? { ...v, [field]: value } : v,
            ),
          };
        }
        return p;
      }),
    );
  };

  const updateProductName = (productRef: string, newName: string) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef ? { ...p, name: newName } : p,
      ),
    );
  };

  const updateProductDescription = (
    productRef: string,
    newDescription: string,
  ) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? { ...p, ecommerceDescription: newDescription }
          : p,
      ),
    );
  };

  const generateAIDescription = async (product: ParsedProduct) => {
    const productKey = product.reference;

    const isVolwassenen =
      aiTargetAudience === 'auto'
        ? product.sizeAttribute === 'MAAT Volwassenen'
        : aiTargetAudience === 'volwassenen';
    const customPrompt = isVolwassenen
      ? customPromptVolwassenen
      : customPromptKinderen;
    const defaultPrompt = isVolwassenen
      ? defaultPrompts?.volwassenen?.systemPrompt
      : defaultPrompts?.kinderen?.systemPrompt;

    const sendCustomPrompt =
      customPrompt !== defaultPrompt ? customPrompt : undefined;

    setGeneratingDescription((prev) => new Set(prev).add(productKey));

    try {
      const response = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            name: product.originalName || product.name,
            brand:
              product.selectedBrand?.name || product.suggestedBrand,
            color: product.color,
            material: product.material,
            fabricPrint: product.fabricPrint,
            description: product.ecommerceDescription,
          },
          sizeAttribute: product.sizeAttribute,
          customSystemPrompt: sendCustomPrompt,
        }),
      });

      const data = await response.json();

      if (response.ok && data.description) {
        setParsedProducts((products) =>
          products.map((p) =>
            p.reference === productKey
              ? { ...p, ecommerceDescription: data.description }
              : p,
          ),
        );
        console.log(
          `✅ AI description generated for ${product.name} (${data.promptCategory})`,
        );
      } else {
        alert(
          `Fout bij genereren beschrijving: ${data.error || 'Onbekende fout'}\n${data.message || ''}`,
        );
      }
    } catch (error) {
      console.error('Error generating description:', error);
      alert(
        'Fout bij genereren beschrijving. Controleer de console voor details.',
      );
    } finally {
      setGeneratingDescription((prev) => {
        const next = new Set(prev);
        next.delete(productKey);
        return next;
      });
    }
  };

  const generateAllDescriptions = async () => {
    const selectedProductsList = parsedProducts.filter((p) =>
      selectedProducts.has(p.reference),
    );

    if (selectedProductsList.length === 0) {
      alert(
        'Selecteer eerst producten om beschrijvingen te genereren.',
      );
      return;
    }

    if (
      !confirm(
        `Wil je AI-beschrijvingen genereren voor ${selectedProductsList.length} producten? Dit kan even duren.`,
      )
    ) {
      return;
    }

    for (const product of selectedProductsList) {
      await generateAIDescription(product);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    alert(
      `✅ Beschrijvingen gegenereerd voor ${selectedProductsList.length} producten!`,
    );
  };

  const toggleProductFavorite = (productRef: string) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? { ...p, isFavorite: !p.isFavorite }
          : p,
      ),
    );
  };

  const toggleProductPublished = (productRef: string) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? { ...p, isPublished: !p.isPublished }
          : p,
      ),
    );
  };

  const setAllFavorites = (value: boolean) => {
    setParsedProducts((products) =>
      products.map((p) => ({ ...p, isFavorite: value })),
    );
  };

  const setAllPublished = (value: boolean) => {
    setParsedProducts((products) =>
      products.map((p) => ({ ...p, isPublished: value })),
    );
  };

  const updateProductSizeAttribute = (
    productRef: string,
    newAttribute: string,
  ) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? { ...p, sizeAttribute: newAttribute }
          : p,
      ),
    );
  };

  const setAllSizeAttribute = (value: string) => {
    setParsedProducts((products) =>
      products.map((p) =>
        selectedProducts.has(p.reference)
          ? { ...p, sizeAttribute: value }
          : p,
      ),
    );
  };

  // ─── Batch assignments ────────────────────────────────────────────────
  const applyBatchBrand = () => {
    if (!batchBrand) return;
    const brand = brands.find((b) => b.id.toString() === batchBrand);
    if (!brand) return;

    setParsedProducts((products) =>
      products.map((p) =>
        selectedProducts.has(p.reference)
          ? { ...p, selectedBrand: brand }
          : p,
      ),
    );
  };

  const applyBatchCategory = () => {
    if (!batchCategory) return;
    const category = internalCategories.find(
      (c) => c.id.toString() === batchCategory,
    );
    if (!category) return;

    setParsedProducts((products) =>
      products.map((p) =>
        selectedProducts.has(p.reference) ? { ...p, category } : p,
      ),
    );
  };

  const addBatchPublicCategory = (categoryId: string) => {
    const id = parseInt(categoryId);
    if (!batchPublicCategories.includes(id)) {
      setBatchPublicCategories([...batchPublicCategories, id]);
    }
  };

  const removeBatchPublicCategory = (categoryId: number) => {
    setBatchPublicCategories(
      batchPublicCategories.filter((id) => id !== categoryId),
    );
  };

  const applyBatchPublicCategories = () => {
    if (batchPublicCategories.length === 0) return;

    const categoriesToAdd = publicCategories.filter((c) =>
      batchPublicCategories.includes(c.id),
    );

    setParsedProducts((products) =>
      products.map((p) =>
        selectedProducts.has(p.reference)
          ? {
              ...p,
              publicCategories: [
                ...p.publicCategories,
                ...categoriesToAdd.filter(
                  (cat) =>
                    !p.publicCategories.some(
                      (pc) => pc.id === cat.id,
                    ),
                ),
              ],
            }
          : p,
      ),
    );
  };

  const addBatchProductTag = (tagId: string) => {
    const id = parseInt(tagId);
    if (!batchProductTags.includes(id)) {
      setBatchProductTags([...batchProductTags, id]);
    }
  };

  const removeBatchProductTag = (tagId: number) => {
    setBatchProductTags(
      batchProductTags.filter((id) => id !== tagId),
    );
  };

  const applyBatchProductTags = () => {
    if (batchProductTags.length === 0) return;

    const tagsToAdd = productTags.filter((t) =>
      batchProductTags.includes(t.id),
    );

    setParsedProducts((products) =>
      products.map((p) =>
        selectedProducts.has(p.reference)
          ? {
              ...p,
              productTags: [
                ...p.productTags,
                ...tagsToAdd.filter(
                  (tag) =>
                    !p.productTags.some(
                      (pt) => pt.id === tag.id,
                    ),
                ),
              ],
            }
          : p,
      ),
    );
  };

  // ─── Per-product category/tag management ──────────────────────────────
  const addPublicCategory = (productRef: string, categoryId: string) => {
    const category = publicCategories.find(
      (c) => c.id.toString() === categoryId,
    );
    if (!category) return;

    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? { ...p, publicCategories: [...p.publicCategories, category] }
          : p,
      ),
    );
  };

  const removePublicCategory = (
    productRef: string,
    categoryId: number,
  ) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? {
              ...p,
              publicCategories: p.publicCategories.filter(
                (c) => c.id !== categoryId,
              ),
            }
          : p,
      ),
    );
  };

  const addProductTag = (productRef: string, tagId: string) => {
    const tag = productTags.find((t) => t.id.toString() === tagId);
    if (!tag) return;

    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? { ...p, productTags: [...p.productTags, tag] }
          : p,
      ),
    );
  };

  const removeProductTag = (productRef: string, tagId: number) => {
    setParsedProducts((products) =>
      products.map((p) =>
        p.reference === productRef
          ? {
              ...p,
              productTags: p.productTags.filter(
                (t) => t.id !== tagId,
              ),
            }
          : p,
      ),
    );
  };

  // ─── Test & import ────────────────────────────────────────────────────
  const testProduct = async (product: ParsedProduct) => {
    setApiPreviewData({ product, testMode: true });
    setShowApiPreview(true);
  };

  const IMPORT_BATCH_SIZE = 3;

  const executeImport = async (testMode: boolean = false) => {
    setShowApiPreview(false);
    setIsLoading(true);

    importAbortRef.current?.abort();
    importAbortRef.current = new AbortController();
    const { signal } = importAbortRef.current;

    try {
      const { uid, password } = await getCredentials();
      if (!uid || !password) {
        alert('Geen Odoo credentials gevonden. Log eerst in.');
        setIsLoading(false);
        return;
      }

      const productsToImport =
        testMode && apiPreviewData?.product
          ? [apiPreviewData.product]
          : parsedProducts.filter((p) =>
              selectedProducts.has(p.reference),
            );

      const productsForApi = productsToImport.map((p) => {
        const httpImages = (p.images || []).filter((img) =>
          img.startsWith('http'),
        );
        return { ...p, images: httpImages.length > 0 ? httpImages : undefined };
      });

      const totalBatches = Math.ceil(productsForApi.length / IMPORT_BATCH_SIZE);

      setImportProgress({
        current: 0,
        total: productsForApi.length,
        currentProduct: `Batch 1 van ${totalBatches}`,
      });

      let results: Array<{
        success: boolean;
        reference: string;
        name?: string;
        templateId?: number;
        variantsCreated?: number;
        variantsUpdated?: number;
        message?: string;
      }> = [];

      try {
        for (let i = 0; i < productsForApi.length; i += IMPORT_BATCH_SIZE) {
          const batch = productsForApi.slice(i, i + IMPORT_BATCH_SIZE);
          const batchNum = Math.floor(i / IMPORT_BATCH_SIZE) + 1;

          setImportProgress({
            current: i,
            total: productsForApi.length,
            currentProduct: `Batch ${batchNum} van ${totalBatches}`,
          });

          const response = await fetch('/api/import-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              products: batch.map((p) => transformProductForUpload(p)),
              testMode,
              vendor: selectedVendor || 'unknown',
              uid,
              password,
            }),
            signal,
          });

          const result = await response.json();

          if (result.success && result.results) {
            results.push(...result.results);
          } else {
            results.push(
              ...batch.map((p) => ({
                success: false,
                reference: p.reference,
                name: p.name,
                message: result.error || 'Unknown error',
              })),
            );
          }
        }
      } catch (error) {
        if (signal.aborted) {
          setImportProgress(null);
          setIsLoading(false);
          return;
        }
        console.error('Error importing products:', error);
        const imported = new Set(results.map((r) => r.reference));
        const remaining = productsToImport.filter(
          (p) => !imported.has(p.reference),
        );
        results.push(
          ...remaining.map((p) => ({
            success: false,
            reference: p.reference,
            name: p.name,
            message: String(error),
          })),
        );
      }

      setImportProgress(null);

      const summary = {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalVariantsCreated: results.reduce(
          (sum, r) => sum + (r.variantsCreated || 0),
          0,
        ),
        totalVariantsUpdated: results.reduce(
          (sum, r) => sum + (r.variantsUpdated || 0),
          0,
        ),
        vendor: selectedVendor || 'unknown',
        timestamp: new Date().toISOString(),
      };

      setImportResults({ success: true, results, summary });

      console.log('📊 Import Summary:', summary);

      if (selectedVendor === 'playup') {
        const playupResults = results
          .filter((r) => r.success && r.templateId)
          .map((r) => ({
            reference: r.reference || '',
            colorCode: r.reference?.split('-')[1] || '',
            description: r.name?.split(' - ')[1] || '',
            name: r.name || '',
            templateId: r.templateId || 0,
          }));

        if (
          typeof window !== 'undefined' &&
          playupResults.length > 0
        ) {
          sessionStorage.setItem(
            'playup_import_results',
            JSON.stringify(playupResults),
          );
          console.log(
            `💾 Saved ${playupResults.length} Play UP products to session for image upload`,
          );
        }
      }

      setCurrentStep(8);

      const hasPoolImages = productsToImport.some((p) =>
        imagePool.some((img) => img.assignedReference === p.reference),
      );
      if (hasPoolImages && results.some((r) => r.success)) {
        console.log('📸 Auto-uploading images from pool...');
        setTimeout(() => uploadAllImages(), 500);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Import failed: ' + error);
      setImportProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Image upload (post-import) ───────────────────────────────────────
  const uploadAllImages = async () => {
    if (!importResults) return;

    const grouped = new Map<string, ImagePoolItem[]>();
    for (const img of imagePool) {
      if (!img.assignedReference) continue;
      const list = grouped.get(img.assignedReference) || [];
      list.push(img);
      grouped.set(img.assignedReference, list);
    }

    const imgResults: ImageImportResult[] = [];
    const { uid, password } = await getCredentials();
    if (!uid || !password) return;

    setIsLoading(true);

    try {
      for (const [reference, images] of grouped) {
        const result = importResults.results.find(
          (r) => r.success && r.reference === reference,
        );
        if (!result?.templateId) {
          imgResults.push({
            reference,
            success: false,
            imagesUploaded: 0,
            error: 'Product niet gevonden in import resultaten',
          });
          continue;
        }

        const sorted = [...images].sort((a, b) => a.order - b.order);
        let uploaded = 0;

        for (let i = 0; i < sorted.length; i++) {
          try {
            const base64 = sorted[i].dataUrl.split(',')[1];
            const response = await fetch('/api/upload-single-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                templateId: result.templateId,
                base64Image: base64,
                imageName: sorted[i].filename,
                sequence: i + 1,
                isMainImage: i === 0,
                odooUid: uid,
                odooPassword: password,
              }),
            });

            if (response.ok) uploaded++;
          } catch (error) {
            console.error(
              `Error uploading image ${sorted[i].filename}:`,
              error,
            );
          }
        }

        imgResults.push({
          reference,
          success: uploaded > 0,
          imagesUploaded: uploaded,
        });
      }

      setImageImportResults(imgResults);
    } catch (err) {
      alert(`Fout: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Tangerine paste handler ──────────────────────────────────────────
  const handleTangerinePaste = () => {
    if (!tangerinePastedText.trim()) return;
    const plugin = getSupplier('tangerine');
    if (!plugin) return;
    const context = createParseContext(brands, 'tangerine');
    const products = plugin.parse(
      { packing_pasted: tangerinePastedText.trim() },
      context,
    );
    if (products.length > 0) {
      setParsedProducts(products);
      setSelectedProducts(new Set(products.map((p) => p.reference)));
      checkExistingBarcodes(products);
      setSupplierFileStatus((prev) => ({
        ...prev,
        packing_csv: true,
      }));
    } else {
      alert(
        'Geen producten herkend in de geplakte tekst. Zorg dat de eerste regel kolomnamen bevat (REFERENCE, PRODUCT NAME, …) en dat er regels met TG-xxx staan.',
      );
    }
  };

  // ─── Docling document processing ─────────────────────────────────────
  const processDocument = async (file: File) => {
    setDoclingProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-document', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setDoclingResult({
          markdown: data.markdown,
          tables: data.tables,
          images: data.images,
        });
      } else {
        alert(data.error || 'Document verwerking mislukt');
      }
    } catch (error) {
      console.error('Docling error:', error);
      alert('Kon document niet verwerken. Is Docling gestart? (npm run docling:start)');
    } finally {
      setDoclingProcessing(false);
    }
  };

  const applyDoclingTable = (tableIndex: number, columnMapping: Record<string, string>) => {
    if (!doclingResult) return;
    const table = doclingResult.tables[tableIndex];
    if (!table) return;

    const grouped: Record<string, ParsedProduct> = {};

    for (const row of table.rows) {
      const rowObj: Record<string, string> = {};
      table.headers.forEach((h, i) => { rowObj[h] = row[i] || ''; });

      const ref = columnMapping.reference ? rowObj[columnMapping.reference] || '' : '';
      if (!ref) continue;

      const name = columnMapping.name ? rowObj[columnMapping.name] || ref : ref;
      const price = columnMapping.price ? parseFloat(rowObj[columnMapping.price]?.replace(',', '.') || '0') || 0 : 0;
      const rrp = columnMapping.rrp ? parseFloat(rowObj[columnMapping.rrp]?.replace(',', '.') || '0') || 0 : 0;
      const size = columnMapping.size ? rowObj[columnMapping.size] || 'UNIT' : 'UNIT';
      const ean = columnMapping.ean ? rowObj[columnMapping.ean] || '' : '';
      const quantity = columnMapping.quantity ? parseInt(rowObj[columnMapping.quantity] || '0') || 0 : 0;

      if (!grouped[ref]) {
        grouped[ref] = {
          reference: ref,
          name,
          material: '',
          color: '',
          variants: [],
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };
      }

      grouped[ref].variants.push({ size, quantity, ean, price, rrp });
    }

    const productList = Object.values(grouped);
    if (productList.length > 0) {
      setParsedProducts(productList);
      setSelectedProducts(new Set(productList.map(p => p.reference)));
      setCurrentStep(2);
    }
  };

  // ─── Reset ────────────────────────────────────────────────────────────
  const resetWizard = () => {
    importAbortRef.current?.abort();
    setCurrentStep(1);
    setSelectedVendor(null);
    setParsedProducts([]);
    setSelectedProducts(new Set());
    setImportResults(null);
    setImageImportResults([]);
    setSupplierFiles({});
    setSupplierFileStatus({});
    setImagePool([]);
    setDoclingResult(null);
    setDoclingProcessing(false);
  };

  // ─── Effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchBrands();
    fetchCategories();

    fetch('/api/generate-description')
      .then((res) => res.json())
      .then((data) => {
        if (data.prompts) {
          setDefaultPrompts({
            kinderen: data.prompts.kinderen,
            volwassenen: data.prompts.volwassenen,
          });
          setCustomPromptKinderen(
            data.prompts.kinderen.systemPrompt,
          );
          setCustomPromptVolwassenen(
            data.prompts.volwassenen.systemPrompt,
          );
        }
      })
      .catch((err) =>
        console.error('Failed to load AI prompts:', err),
      );

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const vendor = urlParams.get('vendor');
      const withImages = urlParams.get('withImages');
      const smartUpload = urlParams.get('smartUpload');

      if (vendor === 'playup' && withImages === 'true') {
        const matchedData = sessionStorage.getItem(
          'playup_matched_images',
        );
        if (matchedData) {
          try {
            const data = JSON.parse(matchedData);
            console.log(
              '📸 Loading matched images from Image Matcher...',
            );
            setSelectedVendor('playup');
            loadMatchedProducts(data);
            sessionStorage.removeItem('playup_matched_images');
          } catch (error) {
            console.error('Error loading matched images:', error);
          }
        }
      }

      if (vendor && smartUpload === 'true') {
        const storedSupplier = sessionStorage.getItem(
          'smart_upload_supplier',
        );
        const storedFiles = sessionStorage.getItem(
          'smart_upload_files',
        );
        const storedProducts = sessionStorage.getItem(
          'smart_upload_products',
        );

        if (storedSupplier) {
          try {
            setSelectedVendor(storedSupplier);

            if (storedProducts) {
              const products = JSON.parse(
                storedProducts,
              ) as ParsedProduct[];
              console.log(
                `🧠 Smart Upload: Loading ${products.length} pre-parsed products for ${storedSupplier}`,
              );
              setParsedProducts(products);
              setSelectedProducts(
                new Set(products.map((p) => p.reference)),
              );
              setCurrentStep(2);

              const plugin = getSupplier(storedSupplier);
              if (plugin) {
                const statusMap: Record<string, boolean> = {};
                plugin.fileInputs.forEach((fi) => {
                  statusMap[fi.id] = true;
                });
                setSupplierFileStatus(statusMap);
              }
            }

            if (storedFiles) {
              const fileMap = JSON.parse(storedFiles) as Record<
                string,
                string
              >;
              const csvFiles: Record<string, string> = {};
              for (const [key, value] of Object.entries(fileMap)) {
                if (!key.startsWith('__pdf_')) {
                  csvFiles[key] = value;
                }
              }

              if (Object.keys(csvFiles).length > 0) {
                setSupplierFiles(csvFiles);

                if (!storedProducts) {
                  const plugin = getSupplier(storedSupplier);
                  if (plugin) {
                    console.log(
                      `🧠 Smart Upload: Parsing ${Object.keys(csvFiles).length} CSV(s) for ${storedSupplier}`,
                    );
                    const ctx = createParseContext(
                      brands.length > 0 ? brands : [],
                      storedSupplier,
                    );
                    const products = plugin.parse(csvFiles, ctx);
                    if (products.length > 0) {
                      setParsedProducts(products);
                      setSelectedProducts(
                        new Set(
                          products.map((p) => p.reference),
                        ),
                      );
                      setCurrentStep(2);

                      const statusMap: Record<
                        string,
                        boolean
                      > = {};
                      for (const key of Object.keys(csvFiles)) {
                        statusMap[key] = true;
                      }
                      setSupplierFileStatus(statusMap);
                    }
                  }
                }
              }
            }

            sessionStorage.removeItem('smart_upload_supplier');
            sessionStorage.removeItem('smart_upload_files');
            sessionStorage.removeItem('smart_upload_products');
          } catch (error) {
            console.error(
              'Error loading smart upload data:',
              error,
            );
          }
        }
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentStep === 4 && brands.length === 0) {
      fetchBrands();
    }
    if (
      currentStep === 4 &&
      (publicCategories.length === 0 || productTags.length === 0)
    ) {
      fetchCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  useEffect(() => {
    if (publicCategories.length > 0 && parsedProducts.length > 0) {
      const productsToMatch = parsedProducts.filter(
        (p) => p.csvCategory && p.publicCategories.length === 0,
      );

      if (productsToMatch.length > 0) {
        console.log(
          `🔄 Auto-matching ${productsToMatch.length} products with CSV categories...`,
        );

        setParsedProducts((products) =>
          products.map((product) => {
            if (
              product.csvCategory &&
              product.publicCategories.length === 0
            ) {
              const matchedCategories =
                findMatchingPublicCategories(
                  product.csvCategory,
                  product.sizeAttribute,
                  publicCategories,
                );
              if (matchedCategories.length > 0) {
                return {
                  ...product,
                  publicCategories: matchedCategories,
                };
              }
            }
            return product;
          }),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicCategories]);

  // ─── Derived data ─────────────────────────────────────────────────────
  const selectedCount = selectedProducts.size;
  const totalVariants = parsedProducts
    .filter((p) => selectedProducts.has(p.reference))
    .reduce((sum, p) => sum + p.variants.length, 0);

  const readyProducts = parsedProducts.filter(
    (p) =>
      selectedProducts.has(p.reference) &&
      p.selectedBrand &&
      p.category,
  );

  return {
    // Navigation
    currentStep,
    setCurrentStep,
    steps: STEPS,

    // Vendor & files
    selectedVendor,
    setSelectedVendor,
    supplierFiles,
    setSupplierFiles,
    supplierFileStatus,
    setSupplierFileStatus,
    tangerinePastedText,
    setTangerinePastedText,
    handleTangerinePaste,

    // Products
    parsedProducts,
    setParsedProducts,
    selectedProducts,
    setSelectedProducts,
    selectedCount,
    totalVariants,
    readyProducts,

    // Categories & brands
    brands,
    internalCategories,
    publicCategories,
    productTags,
    categoriesDataError,
    batchBrand,
    setBatchBrand,
    batchCategory,
    setBatchCategory,
    batchPublicCategories,
    setBatchPublicCategories,
    batchProductTags,
    setBatchProductTags,
    brandSearch,
    setBrandSearch,
    categorySearch,
    setCategorySearch,
    publicCategorySearch,
    setPublicCategorySearch,
    productTagSearch,
    setProductTagSearch,

    // Actions
    fetchBrands,
    fetchCategories,
    checkExistingBarcodes,
    generateBarcodes,
    handleFileUpload,
    handlePdfUpload,
    loadMatchedProducts,
    handleManualImageUpload,
    removeProductImage,
    addImagesFromFiles,
    toggleProduct,
    updateVariantQuantity,
    updateVariantField,
    updateProductName,
    updateProductDescription,
    generateAIDescription,
    generateAllDescriptions,
    toggleProductFavorite,
    toggleProductPublished,
    setAllFavorites,
    setAllPublished,
    updateProductSizeAttribute,
    setAllSizeAttribute,
    applyBatchBrand,
    applyBatchCategory,
    addBatchPublicCategory,
    removeBatchPublicCategory,
    applyBatchPublicCategories,
    addBatchProductTag,
    removeBatchProductTag,
    applyBatchProductTags,
    addPublicCategory,
    removePublicCategory,
    addProductTag,
    removeProductTag,
    testProduct,
    executeImport,
    uploadAllImages,
    resetWizard,

    // Import results
    importResults,
    setImportResults,
    importProgress,
    showApiPreview,
    setShowApiPreview,
    apiPreviewData,
    setApiPreviewData,
    imageImportResults,
    setImageImportResults,

    // Loading states
    isLoading,
    checkingExisting,
    existingBarcodes,
    generatingBarcodes,
    generatingDescription,

    // AI description
    showPromptModal,
    setShowPromptModal,
    promptCategory,
    setPromptCategory,
    aiTargetAudience,
    setAiTargetAudience,
    customPromptKinderen,
    setCustomPromptKinderen,
    customPromptVolwassenen,
    setCustomPromptVolwassenen,
    defaultPrompts,

    // Docling document import
    doclingResult,
    doclingProcessing,
    processDocument,
    applyDoclingTable,

    // Image pool
    imagePool,
    setImagePool,
    imageIdCounter,

    // Utilities (re-exported for step components)
    getAllSuppliers,
    getSupplier,
    createParseContext,
    determineSizeAttribute,
    mapSizeToOdooFormat,
    isUnitSize,
    isUnitOnlyProduct,
    transformProductForUpload,
  };
}

export type UseImportWizardReturn = ReturnType<typeof useImportWizard>;
