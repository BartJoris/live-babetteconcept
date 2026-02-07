import { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

// Product from CSV
interface CsvProduct {
  reference: string;      // e.g., AD207B
  colorName: string;      // e.g., LIZERON
  productName: string;    // e.g., CHAPEAU
  category: string;       // e.g., ACCESSORIES
  uniqueKey: string;      // reference_color for uniqueness
}

// Matched image
interface ImageFile {
  filename: string;
  previewUrl: string;
  file: File;
  extractedRef: string;
  extractedColor: string;
  isLifestyle: boolean;
  imageNumber: number;
}

// Product with matched images
interface ProductWithImages {
  csvProduct: CsvProduct;
  images: ImageFile[];
  odooTemplateId?: number;
  odooProductName?: string;
  odooHasImages: boolean;      // Does product already have images in Odoo?
  odooImageCount: number;      // How many images in Odoo?
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

export default function EmileEtIdaImagesImport() {
  // Step 1: CSV + Folder selection
  const [csvProducts, setCsvProducts] = useState<CsvProduct[]>([]);
  const [allImages, setAllImages] = useState<ImageFile[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [folderName, setFolderName] = useState<string>('');
  
  // Step 2: Matched products
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [unmatchedImages, setUnmatchedImages] = useState<ImageFile[]>([]);
  
  // Step 3: Upload
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  
  // UI State
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'with-images' | 'without-images' | 'existing-odoo'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExistingWarning, setShowExistingWarning] = useState(true);
  
  // Refs
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
    const refIndex = headers.indexOf('product reference');
    const colorIndex = headers.indexOf('color name');
    const nameIndex = headers.indexOf('product name');
    const categoryIndex = headers.indexOf('category');

    if (refIndex === -1 || colorIndex === -1) {
      console.error('CSV missing required columns');
      return [];
    }

    const productsMap = new Map<string, CsvProduct>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map(c => c.trim());
      const reference = cols[refIndex]?.toUpperCase() || '';
      const colorName = cols[colorIndex]?.toUpperCase() || '';
      const productName = cols[nameIndex] || '';
      const category = cols[categoryIndex] || '';

      if (!reference) continue;

      const uniqueKey = `${reference}_${colorName}`;
      if (!productsMap.has(uniqueKey)) {
        productsMap.set(uniqueKey, {
          reference,
          colorName,
          productName,
          category,
          uniqueKey,
        });
      }
    }

    return Array.from(productsMap.values()).sort((a, b) => 
      a.reference.localeCompare(b.reference) || a.colorName.localeCompare(b.colorName)
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
  
  // Known colors for better matching
  const KNOWN_COLORS = [
    'creme', 'abricot', 'lizeron', 'tulipe', 'paquerette', 'fraise', 'cerise',
    'mistigri', 'guariguette', 'vichy', 'rouge', 'bleu', 'rose', 'jaune',
    'blossom', 'ciel', 'mimosa', 'dore', 'nuage', 'coquelicot', 'marine',
    'corail', 'macaron', 'wisteria', 'tournesol', 'chambray', 'denim', 'brownie',
    'galet', 'mer', 'poussin', 'rayure', 'betsy', 'michelle', 'althea', 'rosier',
    'bergere', 'margot', 'fantasia', 'champetre', 'cerisette', 'banane', 'radis',
    'chine', 'beige', 'light', 'fine', 'noir', 'vivi', 'bb'
  ];

  const extractImageInfo = (filename: string): { ref: string; color: string; isLifestyle: boolean; imageNumber: number } => {
    // Format 1: Hyphen-separated product photos like "AD008-creme-01.jpg" or "AD207B-lizeron-BB.jpg"
    // Handle multiple hyphens like "AD042A-mimosa-03.jpg", "AD015-creme-BB-01.jpg"
    const hyphenMatch = filename.match(/^(AD[A-Z0-9]+)-(.+?)(?:-(?:BB|\d+))?(?:-\d+)?\.[^.]+$/i);
    if (hyphenMatch) {
      const ref = hyphenMatch[1].toUpperCase();
      // Extract color, removing BB and numbers
      let colorPart = hyphenMatch[2].toLowerCase();
      // Remove trailing numbers and BB
      colorPart = colorPart.replace(/-(?:bb|\d+).*$/i, '').replace(/\d+$/, '');
      
      // Get image number
      let imageNum = 0;
      const numMatch = filename.match(/-(\d+)\.[^.]+$/);
      if (numMatch) imageNum = parseInt(numMatch[1]);
      
      return {
        ref,
        color: colorPart,
        isLifestyle: false,
        imageNumber: imageNum,
      };
    }

    // Format 2: Space-separated lifestyle photos like "EMILE IDA E26 AD019 AD009..."
    const isLifestyle = filename.toUpperCase().startsWith('EMILE');
    
    // Extract all AD references from lifestyle photos
    const refs: string[] = [];
    const colors: string[] = [];
    
    const baseName = filename.replace(/\.[^.]+$/, '')
      .replace(/\s*\(\d+[°]?\)\s*$/, '')
      .replace(/\s*\(\d+\s*$/, '');
    
    const parts = baseName.split(/\s+/);
    
    for (const part of parts) {
      const upper = part.toUpperCase();
      const lower = part.toLowerCase();
      
      if (['EMILE', 'IDA', 'E26', 'E25'].includes(upper)) continue;
      
      // AD references
      if (/^AD[A-Z0-9]+$/i.test(upper)) {
        refs.push(upper);
      }
      // Colors
      else if (KNOWN_COLORS.includes(lower)) {
        colors.push(lower);
      }
    }

    // Get image number from (1), (2) etc.
    const parenMatch = filename.match(/\((\d+)\)/);
    const imageNum = parenMatch ? parseInt(parenMatch[1]) : 0;

    return {
      ref: refs[0] || '', // Primary ref
      color: colors[0] || '',
      isLifestyle,
      imageNumber: imageNum,
    };
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Get folder name from path
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
        extractedRef: info.ref,
        extractedColor: info.color,
        isLifestyle: info.isLifestyle,
        imageNumber: info.imageNumber,
      };
    });

    // Sort by reference, then by image number
    parsed.sort((a, b) => {
      const refCompare = a.extractedRef.localeCompare(b.extractedRef);
      if (refCompare !== 0) return refCompare;
      return a.imageNumber - b.imageNumber;
    });

    setAllImages(parsed);
    console.log(`📁 Found ${parsed.length} images in folder`);
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

    // Normalize color for comparison
    const normalizeColor = (color: string): string => {
      return color.toLowerCase()
        .replace(/[-_\s]/g, '')
        .replace(/rouge$/, '') // "vichy rouge" -> "vichy"
        .replace(/clair$/, '') // "beige clair" -> "beige"
        .replace(/light$/, '');
    };

    // Get credentials for Odoo lookup
    const { uid, password } = getCredentials();

    // Build matching map
    const matched: ProductWithImages[] = [];
    const unmatchedImgs: ImageFile[] = [];
    const usedImages = new Set<string>();

    // For each CSV product, find matching images
    for (const csvProduct of csvProducts) {
      const productImages: ImageFile[] = [];
      const normalizedProductColor = normalizeColor(csvProduct.colorName);
      const productRef = csvProduct.reference.toUpperCase();

      // Find product photos (exact ref match + color match)
      for (const img of allImages) {
        if (usedImages.has(img.filename)) continue;
        if (img.isLifestyle) continue;

        const imgRef = img.extractedRef.toUpperCase();
        const normalizedImgColor = normalizeColor(img.extractedColor);

        // Reference must match
        if (imgRef !== productRef) continue;

        // Color must match (partial match allowed)
        const colorMatches = 
          normalizedProductColor === normalizedImgColor ||
          normalizedProductColor.includes(normalizedImgColor) ||
          normalizedImgColor.includes(normalizedProductColor) ||
          // Handle special cases
          (normalizedProductColor === 'guariguette' && normalizedImgColor === 'gariguette') ||
          (normalizedProductColor === 'gariguette' && normalizedImgColor === 'guariguette');

        if (!colorMatches) continue;

        productImages.push(img);
        usedImages.add(img.filename);
      }

      // Sort product images by image number
      productImages.sort((a, b) => a.imageNumber - b.imageNumber);

      // Find lifestyle photos for this product
      const lifestyleImages: ImageFile[] = [];
      for (const img of allImages) {
        if (!img.isLifestyle) continue;
        if (usedImages.has(img.filename)) continue;

        // Check if any ref in the lifestyle photo matches our product
        // Lifestyle photos can contain multiple refs in filename
        const filenameUpper = img.filename.toUpperCase();
        if (!filenameUpper.includes(productRef)) continue;

        // If lifestyle has a color, it must match our product
        if (img.extractedColor) {
          const normalizedImgColor = normalizeColor(img.extractedColor);
          const colorMatches = 
            normalizedProductColor.includes(normalizedImgColor) ||
            normalizedImgColor.includes(normalizedProductColor);
          
          if (!colorMatches) continue;
        }

        lifestyleImages.push(img);
        // Don't mark as used - lifestyle can match multiple products
      }

      // Sort lifestyle by image number
      lifestyleImages.sort((a, b) => a.imageNumber - b.imageNumber);

      // Combine: product photos first, then lifestyle
      const allProductImages = [...productImages, ...lifestyleImages];

      // Check Odoo for existing images (if credentials available)
      let odooHasImages = false;
      let odooImageCount = 0;
      let odooTemplateId: number | undefined;
      let odooProductName: string | undefined;

      if (uid && password && allProductImages.length > 0) {
        try {
          const searchResponse = await fetch('/api/search-emileetida-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: csvProduct.reference,
              color: csvProduct.colorName,
              uid,
              password,
            }),
          });
          const searchData = await searchResponse.json();

          if (searchData.found && searchData.products.length > 0) {
            // Find best matching product by color
            const normalizedColor = csvProduct.colorName.toLowerCase().replace(/\s+/g, '');
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
          console.error(`Error checking Odoo for ${csvProduct.reference}:`, error);
        }
      }

      matched.push({
        csvProduct,
        images: allProductImages,
        odooTemplateId,
        odooProductName,
        odooHasImages,
        odooImageCount,
        // Auto-select ONLY if has images AND no existing images in Odoo
        selected: allProductImages.length > 0 && !odooHasImages,
        uploaded: false,
      });
    }

    // Find truly unmatched images (not used by any product)
    for (const img of allImages) {
      if (usedImages.has(img.filename)) continue;
      if (img.isLifestyle) continue; // Lifestyle photos handled separately
      unmatchedImgs.push(img);
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
      extractedRef: info.ref,
      extractedColor: info.color,
      isLifestyle: info.isLifestyle,
      imageNumber: 99, // Put manual additions at the end
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

    // Check for products with existing images
    const withExisting = toUpload.filter(p => p.odooHasImages);
    if (withExisting.length > 0) {
      const confirm = window.confirm(
        `⚠️ WAARSCHUWING: ${withExisting.length} van de ${toUpload.length} geselecteerde producten hebben al afbeeldingen in Odoo.\n\n` +
        `Deze worden OVERSCHREVEN!\n\n` +
        `Producten:\n${withExisting.slice(0, 5).map(p => `• ${p.csvProduct.reference} - ${p.csvProduct.colorName}`).join('\n')}` +
        (withExisting.length > 5 ? `\n... en ${withExisting.length - 5} meer` : '') +
        `\n\nWeet je zeker dat je wilt doorgaan?`
      );
      
      if (!confirm) {
        return;
      }
    }

    setLoading(true);
    const results: UploadResult[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const product = toUpload[i];
      
      try {
        // First, find the Odoo product template ID
        const searchResponse = await fetch('/api/search-emileetida-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: product.csvProduct.reference,
            color: product.csvProduct.colorName,
            uid,
            password,
          }),
        });
        const searchData = await searchResponse.json();

        if (!searchData.found || searchData.products.length === 0) {
          results.push({
            productKey: product.csvProduct.uniqueKey,
            productName: `${product.csvProduct.productName} - ${product.csvProduct.colorName}`,
            success: false,
            imagesUploaded: 0,
            error: 'Product niet gevonden in Odoo',
          });
          continue;
        }

        // Find the best matching product (by color)
        let templateId = searchData.products[0].templateId;
        const normalizedProductColor = product.csvProduct.colorName.toLowerCase().replace(/\s+/g, '');
        
        for (const p of searchData.products) {
          const pColor = (p.color || '').toLowerCase().replace(/\s+/g, '');
          if (pColor === normalizedProductColor || p.name.toLowerCase().includes(normalizedProductColor)) {
            templateId = p.templateId;
            break;
          }
        }

        // Upload each image
        let imagesUploaded = 0;
        for (let imgIdx = 0; imgIdx < product.images.length; imgIdx++) {
          const img = product.images[imgIdx];
          const buffer = await img.file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');

          const imageType = img.isLifestyle ? 'Lifestyle' : 'Product';
          const imageName = `${product.csvProduct.reference} - ${product.csvProduct.colorName} - ${imageType} ${imgIdx + 1}`;

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
          productName: `${product.csvProduct.productName} - ${product.csvProduct.colorName}`,
          success: true,
          imagesUploaded,
        });
      } catch (error) {
        results.push({
          productKey: product.csvProduct.uniqueKey,
          productName: `${product.csvProduct.productName} - ${product.csvProduct.colorName}`,
          success: false,
          imagesUploaded: 0,
          error: String(error),
        });
      }
    }

    // Mark uploaded products
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
    // Filter by mode
    if (filterMode === 'with-images' && p.images.length === 0) return false;
    if (filterMode === 'without-images' && p.images.length > 0) return false;
    if (filterMode === 'existing-odoo' && !p.odooHasImages) return false;
    
    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.csvProduct.reference.toLowerCase().includes(q) ||
             p.csvProduct.colorName.toLowerCase().includes(q) ||
             p.csvProduct.productName.toLowerCase().includes(q);
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
        <title>Emile et Ida - Afbeeldingen Import</title>
      </Head>

      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">🌸</span>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Emile et Ida - Afbeeldingen Import</h1>
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

              <div className="grid grid-cols-2 gap-6">
                {/* CSV Upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-pink-400 transition-colors">
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
                    {csvProducts.length > 0 && (
                      <div className="text-sm text-green-600 mt-2">
                        ✓ {csvProducts.length} producten geladen
                      </div>
                    )}
                  </button>
                </div>

                {/* Folder Selection */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-pink-400 transition-colors">
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
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
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
                        <div className="font-mono font-bold text-pink-600">{p.reference}</div>
                        <div className="text-blue-600">{p.colorName}</div>
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
                  <div className="text-xs text-gray-600">Met foto's</div>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-yellow-600">{stats.withoutImages}</div>
                  <div className="text-xs text-gray-600">Zonder foto's</div>
                </div>
                <div className="bg-red-50 rounded p-3 text-center border border-red-200">
                  <div className="text-xl font-bold text-red-600">{stats.existingOdoo}</div>
                  <div className="text-xs text-gray-600">⚠️ In Odoo</div>
                </div>
                <div className="bg-pink-50 rounded p-3 text-center border-2 border-pink-300">
                  <div className="text-xl font-bold text-pink-600">{stats.selected}</div>
                  <div className="text-xs text-gray-600">Geselecteerd</div>
                </div>
                <div className="bg-emerald-50 rounded p-3 text-center">
                  <div className="text-xl font-bold text-emerald-600">{stats.uploaded}</div>
                  <div className="text-xs text-gray-600">✓ Geüpload</div>
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
                    ×
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
                    <option value="with-images">Met foto's ({stats.withImages})</option>
                    <option value="without-images">Zonder foto's ({stats.withoutImages})</option>
                    <option value="existing-odoo">⚠️ Al in Odoo ({stats.existingOdoo})</option>
                  </select>
                  <input
                    type="text"
                    placeholder="🔍 Zoek op referentie, kleur of naam..."
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
                    ✓ Selecteer alle
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    ✗ Deselecteer alle
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
                      {/* Selection / Upload Status */}
                      <div className="flex items-center justify-center w-6 h-6 mt-1">
                        {uploaded ? (
                          <span className="text-emerald-600 text-lg">✓</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleProductSelection(csvProduct.uniqueKey)}
                            disabled={images.length === 0}
                            className="w-5 h-5 rounded border-gray-300 text-pink-500 focus:ring-pink-500 cursor-pointer disabled:opacity-50"
                          />
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {uploaded && (
                            <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                              ✓ GEÜPLOAD
                            </span>
                          )}
                          {odooHasImages && !uploaded && (
                            <span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                              ⚠️ {odooImageCount} IN ODOO
                            </span>
                          )}
                          <span className="bg-pink-100 text-pink-800 px-2 py-0.5 rounded text-sm font-mono font-bold">
                            {csvProduct.reference}
                          </span>
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">
                            🎨 {csvProduct.colorName}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {csvProduct.category}
                          </span>
                        </div>
                        <div className="font-medium text-gray-900">
                          {csvProduct.productName}
                        </div>
                      </div>

                      {/* Image Count Badge */}
                      <div className={`px-3 py-1 rounded text-sm font-bold ${
                        images.length > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {images.length} foto{images.length !== 1 ? "'s" : ''}
                      </div>

                      {/* Add Photo Button */}
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
                              {img.isLifestyle && (
                                <div className="absolute bottom-0 left-0 right-0 bg-purple-500 text-white text-xs text-center py-0.5">
                                  Lifestyle
                                </div>
                              )}
                            </div>
                            {/* Delete button */}
                            <button
                              onClick={() => removeImageFromProduct(csvProduct.uniqueKey, img.filename)}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                            {/* Move buttons */}
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
                            {/* Image number badge */}
                            <div className="absolute top-0 left-0 bg-black/60 text-white text-xs px-1 rounded-br">
                              {idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No images warning */}
                    {images.length === 0 && (
                      <div className="mt-2 pl-10 text-sm text-yellow-600">
                        ⚠️ Geen afbeeldingen gevonden voor dit product
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
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {loading ? '⏳ Uploaden...' : `🚀 Upload ${stats.selected} Producten`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">✅ Stap 3: Resultaten</h2>

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
                            <span className="text-green-600">✅ Succes</span>
                          ) : (
                            <span className="text-red-600">❌ {result.error}</span>
                          )}
                        </td>
                        <td className="p-2">{result.imagesUploaded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Remaining products info */}
              {stats.withImages - stats.uploaded > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-4">
                  <p className="text-blue-800">
                    📋 Nog <strong>{stats.withImages - stats.uploaded}</strong> producten met afbeeldingen te uploaden.
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
                    🔄 Opnieuw beginnen
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
                  className="px-6 py-2 bg-pink-500 text-white rounded hover:bg-pink-600"
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
