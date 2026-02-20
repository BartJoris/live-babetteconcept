import { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

interface CsvProduct {
  artNo: string;          // e.g., "11000335"
  variantNo: string;      // e.g., "75" (color code)
  variantName: string;    // e.g., "Green"
  productName: string;    // e.g., "Panther sp sweatshirt"
  category: string;       // e.g., "SWEATSHIRTS/CARDIGANS"
  uniqueKey: string;      // artNo_variantNo
}

interface ImageFile {
  filename: string;
  previewUrl: string;
  file: File;
  extractedArtNo: string;
  extractedVariantNo: string;
  imageNumber: number;
}

interface ProductWithImages {
  csvProduct: CsvProduct;
  images: ImageFile[];
  odooTemplateId?: number;
  odooProductName?: string;
  odooHasImages: boolean;
  odooImageCount: number;
  selected: boolean;
  uploaded: boolean;
}

interface UploadResult {
  productKey: string;
  productName: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

export default function MiniRodiniImagesImport() {
  const [csvProducts, setCsvProducts] = useState<CsvProduct[]>([]);
  const [allImages, setAllImages] = useState<ImageFile[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [folderName, setFolderName] = useState<string>('');
  
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [unmatchedImages, setUnmatchedImages] = useState<ImageFile[]>([]);
  
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'with-images' | 'without-images' | 'existing-odoo'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExistingWarning, setShowExistingWarning] = useState(true);
  
  const csvInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const addPhotoRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  // ============================================
  // CSV PARSING
  // ============================================
  const parseCSV = (text: string): CsvProduct[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    const artNoIdx = headers.indexOf('art. no.');
    const variantNoIdx = headers.indexOf('variant no.');
    const variantNameIdx = headers.indexOf('variant name');
    const productNameIdx = headers.indexOf('product name');
    const categoryIdx = headers.indexOf('category');

    if (artNoIdx === -1 || variantNoIdx === -1) {
      console.error('CSV missing required columns (Art. no., Variant no.)');
      return [];
    }

    const productsMap = new Map<string, CsvProduct>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map(c => c.trim());
      const artNo = cols[artNoIdx] || '';
      const variantNo = cols[variantNoIdx] || '';
      const variantName = cols[variantNameIdx] || '';
      const productName = cols[productNameIdx] || '';
      const category = cols[categoryIdx] || '';

      if (!artNo || !variantNo) continue;

      const uniqueKey = `${artNo}_${variantNo}`;
      if (!productsMap.has(uniqueKey)) {
        productsMap.set(uniqueKey, {
          artNo,
          variantNo,
          variantName,
          productName,
          category,
          uniqueKey,
        });
      }
    }

    return Array.from(productsMap.values()).sort((a, b) => 
      a.artNo.localeCompare(b.artNo) || a.variantNo.localeCompare(b.variantNo)
    );
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const products = parseCSV(text);
      setCsvProducts(products);
      console.log(`📋 Parsed ${products.length} unique products from CSV`);
    };
    reader.readAsText(file);
  };

  // ============================================
  // IMAGE PARSING
  // ============================================
  
  // Extract Art. no. and Variant no. from Mini Rodini image filenames
  // Pattern: {id}_{hash}-{artNo}-{variantNo}-{imageNumber}-original.jpg
  // Example: 18397_01bd66254b-11000335-75-1-original.jpg
  const extractImageInfo = (filename: string): { artNo: string; variantNo: string; imageNumber: number } => {
    // Remove extension and try to match pattern
    const baseName = filename.replace(/\.[^.]+$/, '');
    
    // Pattern: digits_hex-artNo-variantNo-imageNum-original
    const match = baseName.match(/^\d+_[a-f0-9]+-(\d+)-(\d+)-(\d+)-original$/i);
    if (match) {
      return {
        artNo: match[1],
        variantNo: match[2],
        imageNumber: parseInt(match[3]),
      };
    }

    // Fallback: try to extract artNo-variantNo-imageNum from anywhere in filename
    const fallbackMatch = baseName.match(/(\d{6,})-(\d{1,3})-(\d+)/);
    if (fallbackMatch) {
      return {
        artNo: fallbackMatch[1],
        variantNo: fallbackMatch[2],
        imageNumber: parseInt(fallbackMatch[3]),
      };
    }

    return { artNo: '', variantNo: '', imageNumber: 0 };
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const firstFile = files[0];
    const pathParts = firstFile.webkitRelativePath?.split('/') || [];
    setFolderName(pathParts[0] || 'Selected folder');

    const imageFiles = files.filter(f =>
      f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );

    const parsed: ImageFile[] = imageFiles.map(file => {
      const info = extractImageInfo(file.name);
      return {
        filename: file.name,
        previewUrl: URL.createObjectURL(file),
        file,
        extractedArtNo: info.artNo,
        extractedVariantNo: info.variantNo,
        imageNumber: info.imageNumber,
      };
    }).filter(img => img.extractedArtNo !== '');

    parsed.sort((a, b) => {
      const artCompare = a.extractedArtNo.localeCompare(b.extractedArtNo);
      if (artCompare !== 0) return artCompare;
      const variantCompare = a.extractedVariantNo.localeCompare(b.extractedVariantNo);
      if (variantCompare !== 0) return variantCompare;
      return a.imageNumber - b.imageNumber;
    });

    setAllImages(parsed);
    console.log(`📁 Found ${parsed.length} Mini Rodini images in folder (out of ${imageFiles.length} total images)`);
  };

  // ============================================
  // MATCHING LOGIC
  // ============================================
  const performMatching = async () => {
    if (csvProducts.length === 0) {
      alert('Upload eerst een CSV bestand');
      return;
    }
    if (allImages.length === 0) {
      alert('Selecteer eerst een map met afbeeldingen');
      return;
    }

    setLoading(true);

    const { uid, password } = getCredentials();

    const matched: ProductWithImages[] = [];
    const unmatchedImgs: ImageFile[] = [];
    const usedImages = new Set<string>();

    for (const csvProduct of csvProducts) {
      const productImages: ImageFile[] = [];

      // Match images by Art. no. + Variant no.
      for (const img of allImages) {
        if (usedImages.has(img.filename)) continue;

        if (img.extractedArtNo === csvProduct.artNo && img.extractedVariantNo === csvProduct.variantNo) {
          productImages.push(img);
          usedImages.add(img.filename);
        }
      }

      // Sort by image number
      productImages.sort((a, b) => a.imageNumber - b.imageNumber);

      // Check Odoo for existing images
      let odooHasImages = false;
      let odooImageCount = 0;
      let odooTemplateId: number | undefined;
      let odooProductName: string | undefined;

      if (uid && password && productImages.length > 0) {
        try {
          const searchResponse = await fetch('/api/search-minirodini-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: csvProduct.uniqueKey,
              color: csvProduct.variantName,
              uid,
              password,
            }),
          });
          const searchData = await searchResponse.json();

          if (searchData.found && searchData.products.length > 0) {
            const normalizedColor = csvProduct.variantName.toLowerCase().replace(/\s+/g, '');
            let bestMatch = searchData.products[0];
            
            for (const p of searchData.products) {
              const pColor = (p.color || '').toLowerCase().replace(/\s+/g, '');
              if (pColor === normalizedColor || p.name.toLowerCase().includes(normalizedColor)) {
                bestMatch = p;
                break;
              }
            }

            odooTemplateId = bestMatch.templateId;
            odooProductName = bestMatch.name;
            odooHasImages = bestMatch.hasImages || false;
            odooImageCount = bestMatch.imageCount || 0;
          }
        } catch (error) {
          console.error(`Error checking Odoo for ${csvProduct.uniqueKey}:`, error);
        }
      }

      matched.push({
        csvProduct,
        images: productImages,
        odooTemplateId,
        odooProductName,
        odooHasImages,
        odooImageCount,
        selected: productImages.length > 0 && !odooHasImages,
        uploaded: false,
      });
    }

    for (const img of allImages) {
      if (!usedImages.has(img.filename)) {
        unmatchedImgs.push(img);
      }
    }

    setProductsWithImages(matched);
    setUnmatchedImages(unmatchedImgs);
    setLoading(false);
    setCurrentStep(2);

    const withImages = matched.filter(p => p.images.length > 0).length;
    const withoutImages = matched.filter(p => p.images.length === 0).length;
    const withExistingOdooImages = matched.filter(p => p.odooHasImages).length;
    console.log(`✅ Matched: ${withImages} products with images, ${withoutImages} without images, ${withExistingOdooImages} already have images in Odoo`);
  };

  // ============================================
  // SELECTION HELPERS
  // ============================================
  const toggleProductSelection = (uniqueKey: string) => {
    setProductsWithImages(prev =>
      prev.map(p =>
        p.csvProduct.uniqueKey === uniqueKey
          ? { ...p, selected: !p.selected }
          : p
      )
    );
  };

  const selectAll = () => {
    setProductsWithImages(prev =>
      prev.map(p => ({ ...p, selected: p.images.length > 0 && !p.uploaded }))
    );
  };

  const deselectAll = () => {
    setProductsWithImages(prev =>
      prev.map(p => ({ ...p, selected: false }))
    );
  };

  // ============================================
  // IMAGE MANIPULATION
  // ============================================
  const addImageToProduct = (uniqueKey: string, file: File) => {
    const info = extractImageInfo(file.name);
    const newImage: ImageFile = {
      filename: file.name,
      previewUrl: URL.createObjectURL(file),
      file,
      extractedArtNo: info.artNo,
      extractedVariantNo: info.variantNo,
      imageNumber: 99,
    };

    setProductsWithImages(prev =>
      prev.map(p =>
        p.csvProduct.uniqueKey === uniqueKey
          ? { ...p, images: [...p.images, newImage], selected: true }
          : p
      )
    );
  };

  const removeImageFromProduct = (uniqueKey: string, imageFilename: string) => {
    setProductsWithImages(prev =>
      prev.map(p =>
        p.csvProduct.uniqueKey === uniqueKey
          ? { ...p, images: p.images.filter(img => img.filename !== imageFilename) }
          : p
      )
    );
  };

  const moveImage = (uniqueKey: string, fromIndex: number, toIndex: number) => {
    setProductsWithImages(prev =>
      prev.map(p => {
        if (p.csvProduct.uniqueKey !== uniqueKey) return p;
        const newImages = [...p.images];
        const [removed] = newImages.splice(fromIndex, 1);
        newImages.splice(toIndex, 0, removed);
        return { ...p, images: newImages };
      })
    );
  };

  // ============================================
  // UPLOAD TO ODOO
  // ============================================
  const uploadImages = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('⚠️ Odoo credentials niet gevonden. Log eerst in via Product Import.');
      return;
    }

    const toUpload = productsWithImages.filter(p => p.selected && p.images.length > 0 && !p.uploaded);
    if (toUpload.length === 0) {
      alert('Selecteer eerst producten om te uploaden');
      return;
    }

    const withExisting = toUpload.filter(p => p.odooHasImages);
    if (withExisting.length > 0) {
      const confirm = window.confirm(
        `⚠️ WAARSCHUWING: ${withExisting.length} van de ${toUpload.length} geselecteerde producten hebben al afbeeldingen in Odoo.\n\n` +
        `Deze worden OVERSCHREVEN!\n\n` +
        `Producten:\n${withExisting.slice(0, 5).map(p => `• ${p.csvProduct.artNo} - ${p.csvProduct.variantName}`).join('\n')}` +
        (withExisting.length > 5 ? `\n... en ${withExisting.length - 5} meer` : '') +
        `\n\nWeet je zeker dat je wilt doorgaan?`
      );
      
      if (!confirm) return;
    }

    setLoading(true);
    const results: UploadResult[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const product = toUpload[i];
      
      try {
        const searchResponse = await fetch('/api/search-minirodini-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: product.csvProduct.uniqueKey,
            color: product.csvProduct.variantName,
            uid,
            password,
          }),
        });
        const searchData = await searchResponse.json();

        if (!searchData.found || searchData.products.length === 0) {
          results.push({
            productKey: product.csvProduct.uniqueKey,
            productName: `${product.csvProduct.productName} - ${product.csvProduct.variantName}`,
            success: false,
            imagesUploaded: 0,
            error: 'Product niet gevonden in Odoo',
          });
          continue;
        }

        let templateId = searchData.products[0].templateId;
        const normalizedProductColor = product.csvProduct.variantName.toLowerCase().replace(/\s+/g, '');
        
        for (const p of searchData.products) {
          const pColor = (p.color || '').toLowerCase().replace(/\s+/g, '');
          if (pColor === normalizedProductColor || p.name.toLowerCase().includes(normalizedProductColor)) {
            templateId = p.templateId;
            break;
          }
        }

        let imagesUploaded = 0;
        for (let imgIdx = 0; imgIdx < product.images.length; imgIdx++) {
          const img = product.images[imgIdx];
          const buffer = await img.file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');

          const imageName = `${product.csvProduct.artNo} - ${product.csvProduct.variantName} - ${imgIdx + 1}`;

          const uploadResponse = await fetch('/api/upload-single-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId,
              base64Image: base64,
              imageName,
              sequence: imgIdx + 1,
              isMainImage: imgIdx === 0,
              odooUid: uid,
              odooPassword: password,
            }),
          });

          const uploadData = await uploadResponse.json();
          if (uploadData.success) {
            imagesUploaded++;
          }
        }

        results.push({
          productKey: product.csvProduct.uniqueKey,
          productName: `${product.csvProduct.productName} - ${product.csvProduct.variantName}`,
          success: true,
          imagesUploaded,
        });
      } catch (error) {
        results.push({
          productKey: product.csvProduct.uniqueKey,
          productName: `${product.csvProduct.productName} - ${product.csvProduct.variantName}`,
          success: false,
          imagesUploaded: 0,
          error: String(error),
        });
      }
    }

    const successfulKeys = results.filter(r => r.success).map(r => r.productKey);
    setProductsWithImages(prev =>
      prev.map(p =>
        successfulKeys.includes(p.csvProduct.uniqueKey)
          ? { ...p, selected: false, uploaded: true }
          : p
      )
    );

    setUploadResults(results);
    setLoading(false);
    setCurrentStep(3);

    const totalImages = results.reduce((sum, r) => sum + r.imagesUploaded, 0);
    alert(`✅ ${totalImages} afbeeldingen geüpload voor ${results.filter(r => r.success).length} producten`);
  };

  // ============================================
  // FILTERING & STATS
  // ============================================
  const filteredProducts = productsWithImages.filter(p => {
    if (filterMode === 'with-images' && p.images.length === 0) return false;
    if (filterMode === 'without-images' && p.images.length > 0) return false;
    if (filterMode === 'existing-odoo' && !p.odooHasImages) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.csvProduct.artNo.toLowerCase().includes(q) ||
             p.csvProduct.variantName.toLowerCase().includes(q) ||
             p.csvProduct.productName.toLowerCase().includes(q) ||
             p.csvProduct.variantNo.includes(q);
    }
    return true;
  });

  const stats = {
    totalProducts: productsWithImages.length,
    withImages: productsWithImages.filter(p => p.images.length > 0).length,
    withoutImages: productsWithImages.filter(p => p.images.length === 0).length,
    existingOdoo: productsWithImages.filter(p => p.odooHasImages).length,
    selected: productsWithImages.filter(p => p.selected && p.images.length > 0 && !p.uploaded).length,
    uploaded: productsWithImages.filter(p => p.uploaded).length,
    totalImages: productsWithImages.reduce((sum, p) => sum + p.images.length, 0),
    unmatchedImages: unmatchedImages.length,
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      <Head>
        <title>Mini Rodini - Afbeeldingen Import</title>
      </Head>

      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">🐼</span>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Mini Rodini - Afbeeldingen Import</h1>
                  <p className="text-gray-600">Upload afbeeldingen voor producten uit je CSV</p>
                </div>
              </div>
              <Link
                href="/product-import"
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                ← Terug naar Product Import
              </Link>
            </div>
          </div>

          {/* Step 1: CSV + Folder Selection */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-6">📁 Stap 1: Selecteer CSV en Afbeeldingen</h2>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-green-900 mb-2">🐼 Mini Rodini Image Matching</p>
                <p className="text-xs text-green-800">
                  Afbeeldingen worden gematcht op basis van <strong>Art. no.</strong> en <strong>Variant no.</strong> uit de bestandsnaam.
                </p>
                <p className="text-xs text-green-700 mt-1">
                  Voorbeeld: <code className="bg-white px-1 rounded">18397_01bd66254b-<strong>11000335</strong>-<strong>75</strong>-1-original.jpg</code>
                  → Art. no. 11000335, Variant 75, Foto 1
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* CSV Upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 transition-colors">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => csvInputRef.current?.click()}
                    className="w-full"
                  >
                    <div className="text-4xl mb-2">📋</div>
                    <div className="font-medium text-gray-900">
                      {csvFileName || 'Klik om CSV te uploaden'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Product_Information_*.csv</p>
                    {csvProducts.length > 0 && (
                      <div className="text-sm text-green-600 mt-2">
                        ✓ {csvProducts.length} producten geladen
                      </div>
                    )}
                  </button>
                </div>

                {/* Folder Selection */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 transition-colors">
                  <input
                    ref={folderInputRef}
                    type="file"
                    // @ts-ignore - webkitdirectory is not in types
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleFolderSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="w-full"
                  >
                    <div className="text-4xl mb-2">🖼️</div>
                    <div className="font-medium text-gray-900">
                      {folderName || 'Klik om afbeeldingen map te selecteren'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Map met *-original.jpg bestanden</p>
                    {allImages.length > 0 && (
                      <div className="text-sm text-green-600 mt-2">
                        ✓ {allImages.length} afbeeldingen gevonden
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Match Button */}
              <div className="mt-6 flex justify-center">
                <button
                  onClick={performMatching}
                  disabled={csvProducts.length === 0 || allImages.length === 0 || loading}
                  className={`px-8 py-3 rounded-lg font-bold text-lg ${
                    csvProducts.length > 0 && allImages.length > 0 && !loading
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {loading ? '⏳ Matchen & Odoo checken...' : '🔍 Match Afbeeldingen met Producten'}
                </button>
              </div>

              {loading && (
                <div className="mt-4 text-center text-gray-600">
                  <div className="animate-pulse">
                    Controleren of producten al afbeeldingen hebben in Odoo...
                  </div>
                </div>
              )}

              {/* Preview info */}
              {csvProducts.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-bold mb-2">📋 CSV Preview (eerste 10 producten)</h3>
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    {csvProducts.slice(0, 10).map(p => (
                      <div key={p.uniqueKey} className="bg-white p-2 rounded border">
                        <div className="font-mono font-bold text-green-600">{p.artNo}</div>
                        <div className="text-blue-600">#{p.variantNo} - {p.variantName}</div>
                        <div className="text-gray-600 truncate">{p.productName}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review & Edit */}
          {currentStep === 2 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">✏️ Stap 2: Controleer en Bewerk</h2>

              {/* Stats */}
              <div className="grid grid-cols-7 gap-2 mb-4">
                <div className="bg-blue-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">{stats.totalProducts}</div>
                  <div className="text-xs text-gray-600">Producten</div>
                </div>
                <div className="bg-green-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-green-600">{stats.withImages}</div>
                  <div className="text-xs text-gray-600">Met foto&apos;s</div>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-yellow-600">{stats.withoutImages}</div>
                  <div className="text-xs text-gray-600">Zonder foto&apos;s</div>
                </div>
                <div className="bg-red-50 rounded p-3 text-center border border-red-200">
                  <div className="text-xl font-bold text-red-600">{stats.existingOdoo}</div>
                  <div className="text-xs text-gray-600">In Odoo</div>
                </div>
                <div className="bg-green-50 rounded p-3 text-center border-2 border-green-300">
                  <div className="text-xl font-bold text-green-600">{stats.selected}</div>
                  <div className="text-xs text-gray-600">Geselecteerd</div>
                </div>
                <div className="bg-emerald-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-emerald-600">{stats.uploaded}</div>
                  <div className="text-xs text-gray-600">Ge&uuml;pload</div>
                </div>
                <div className="bg-orange-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-orange-600">{stats.unmatchedImages}</div>
                  <div className="text-xs text-gray-600">Niet gematcht</div>
                </div>
              </div>

              {/* Warning for existing images */}
              {stats.existingOdoo > 0 && showExistingWarning && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <div className="font-bold text-red-800">
                        {stats.existingOdoo} producten hebben al afbeeldingen in Odoo
                      </div>
                      <div className="text-sm text-red-700 mt-1">
                        Deze zijn automatisch gedeselecteerd om overschrijven te voorkomen.
                        Selecteer ze handmatig als je ze toch wilt vervangen.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowExistingWarning(false)}
                    className="text-red-400 hover:text-red-600"
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center justify-between mb-4 bg-gray-50 p-3 rounded">
                <div className="flex items-center gap-4">
                  <select
                    value={filterMode}
                    onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
                    className="border rounded px-3 py-1"
                  >
                    <option value="all">Alle producten ({stats.totalProducts})</option>
                    <option value="with-images">Met foto&apos;s ({stats.withImages})</option>
                    <option value="without-images">Zonder foto&apos;s ({stats.withoutImages})</option>
                    <option value="existing-odoo">Al in Odoo ({stats.existingOdoo})</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Zoek op art. no., kleur of naam..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border rounded px-3 py-1 w-64"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    Selecteer alle
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Deselecteer alle
                  </button>
                </div>
              </div>

              {/* Products List */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredProducts.map(({ csvProduct, images, selected, uploaded, odooHasImages, odooImageCount }) => (
                  <div
                    key={csvProduct.uniqueKey}
                    className={`border rounded-lg p-4 transition-all ${
                      uploaded
                        ? 'border-emerald-400 bg-emerald-50/50'
                        : odooHasImages
                          ? 'border-red-300 bg-red-50/30'
                          : selected && images.length > 0
                            ? 'border-green-400 bg-green-50/30'
                            : images.length === 0
                              ? 'border-yellow-300 bg-yellow-50/30'
                              : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-6 h-6 mt-1">
                        {uploaded ? (
                          <span className="text-emerald-600 text-lg">✓</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleProductSelection(csvProduct.uniqueKey)}
                            disabled={images.length === 0}
                            className="w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500 cursor-pointer disabled:opacity-50"
                          />
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {uploaded && (
                            <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                              GE&Uuml;PLOAD
                            </span>
                          )}
                          {odooHasImages && !uploaded && (
                            <span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                              {odooImageCount} IN ODOO
                            </span>
                          )}
                          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-sm font-mono font-bold">
                            {csvProduct.artNo}
                          </span>
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">
                            #{csvProduct.variantNo} {csvProduct.variantName}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {csvProduct.category}
                          </span>
                        </div>
                        <div className="font-medium text-gray-900">
                          {csvProduct.productName}
                        </div>
                      </div>

                      <div className={`px-3 py-1 rounded text-sm font-bold ${
                        images.length > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {images.length} foto{images.length !== 1 ? "'s" : ''}
                      </div>

                      <div>
                        <input
                          ref={el => { addPhotoRefs.current[csvProduct.uniqueKey] = el; }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            files.forEach(f => addImageToProduct(csvProduct.uniqueKey, f));
                            e.target.value = '';
                          }}
                        />
                        <button
                          onClick={() => addPhotoRefs.current[csvProduct.uniqueKey]?.click()}
                          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          + Foto
                        </button>
                      </div>
                    </div>

                    {/* Images */}
                    {images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3 pl-10">
                        {images.map((img, idx) => (
                          <div key={`${csvProduct.uniqueKey}-${img.filename}`} className="relative group">
                            <div className="w-20 h-20 relative rounded overflow-hidden border-2 border-gray-200">
                              <Image
                                src={img.previewUrl}
                                alt={img.filename}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <button
                              onClick={() => removeImageFromProduct(csvProduct.uniqueKey, img.filename)}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              &times;
                            </button>
                            <div className="absolute bottom-1 left-1 right-1 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {idx > 0 && (
                                <button
                                  onClick={() => moveImage(csvProduct.uniqueKey, idx, idx - 1)}
                                  className="w-5 h-5 bg-white/80 rounded text-xs"
                                >
                                  ◀
                                </button>
                              )}
                              {idx < images.length - 1 && (
                                <button
                                  onClick={() => moveImage(csvProduct.uniqueKey, idx, idx + 1)}
                                  className="w-5 h-5 bg-white/80 rounded text-xs"
                                >
                                  ▶
                                </button>
                              )}
                            </div>
                            <div className="absolute top-0 left-0 bg-black/60 text-white text-xs px-1 rounded-br">
                              {idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {images.length === 0 && (
                      <div className="mt-2 pl-10 text-sm text-yellow-600">
                        Geen afbeeldingen gevonden voor dit product
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between mt-6 pt-4 border-t">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  ← Terug
                </button>
                <button
                  onClick={uploadImages}
                  disabled={loading || stats.selected === 0}
                  className={`px-6 py-2 rounded font-bold ${
                    stats.selected > 0
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {loading ? '⏳ Uploaden...' : `Upload ${stats.selected} Producten`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">Stap 3: Resultaten</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {uploadResults.filter(r => r.success).length}
                  </div>
                  <div className="text-sm text-gray-600">Succesvol</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {uploadResults.filter(r => !r.success).length}
                  </div>
                  <div className="text-sm text-gray-600">Mislukt</div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Product</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Afbeeldingen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResults.map(result => (
                      <tr key={result.productKey} className="border-b">
                        <td className="p-2">{result.productName}</td>
                        <td className="p-2">
                          {result.success ? (
                            <span className="text-green-600">Succes</span>
                          ) : (
                            <span className="text-red-600">{result.error}</span>
                          )}
                        </td>
                        <td className="p-2">{result.imagesUploaded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {stats.withImages - stats.uploaded > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-4">
                  <p className="text-blue-800">
                    Nog <strong>{stats.withImages - stats.uploaded}</strong> producten met afbeeldingen te uploaden.
                  </p>
                </div>
              )}

              <div className="flex justify-between mt-6 pt-4 border-t">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setCsvProducts([]);
                      setAllImages([]);
                      setProductsWithImages([]);
                      setUnmatchedImages([]);
                      setUploadResults([]);
                      setCsvFileName('');
                      setFolderName('');
                    }}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    Opnieuw beginnen
                  </button>
                  {stats.withImages - stats.uploaded > 0 && (
                    <button
                      onClick={() => {
                        setUploadResults([]);
                        setCurrentStep(2);
                      }}
                      className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      ← Terug naar lijst ({stats.withImages - stats.uploaded} over)
                    </button>
                  )}
                </div>
                <Link
                  href="/product-import"
                  className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Naar Product Import →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
