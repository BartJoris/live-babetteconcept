import { useState, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

// Product from CSV
interface CsvProduct {
  reference: string;      // e.g., B126AK001
  colorCode: string;      // e.g., 611
  colorName: string;      // e.g., Red (mapped)
  description: string;    // e.g., Red patent-leather cross sandal
  uniqueKey: string;      // reference_colorCode for uniqueness
}

// Matched image
interface ImageFile {
  filename: string;
  previewUrl: string;
  file: File;
  extractedRef: string;   // e.g., B126AD001
  imageNumber: number;    // e.g., 1, 2, 3
}

// Product with matched images
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

// Color code to name mapping for Bobo Choses
const COLOR_MAP: Record<string, string> = {
  '199': 'Off White',
  '211': 'Light Blue',
  '311': 'Green',
  '411': 'Yellow',
  '511': 'Orange',
  '611': 'Red',
  '711': 'Pink',
  '811': 'Purple',
  '911': 'Brown',
  '991': 'Multi',
  '999': 'Black',
};

const getColorName = (colorCode: string): string => {
  return COLOR_MAP[colorCode] || colorCode;
};

export default function BobochosesImagesImport() {
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
  const [uploadMode, setUploadMode] = useState<'csv' | 'direct'>('csv');
  
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
  // CSV PARSING - Bobo Choses Packing List format
  // ============================================
  const parseCSV = (text: string): CsvProduct[] => {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Find the header line (BOX;REFERENCE;DESCRIPTION;COLOR;SIZE;EAN...)
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i].toUpperCase();
      if (line.includes('BOX') && line.includes('REFERENCE') && line.includes('DESCRIPTION')) {
        headerLineIdx = i;
        break;
      }
    }
    
    if (headerLineIdx === -1) {
      console.error('CSV missing header line');
      return [];
    }

    const headers = lines[headerLineIdx].split(';').map(h => h.trim().toUpperCase());
    const refIndex = headers.indexOf('REFERENCE');
    const colorIndex = headers.indexOf('COLOR');
    const descIndex = headers.indexOf('DESCRIPTION');

    if (refIndex === -1) {
      console.error('CSV missing REFERENCE column');
      return [];
    }

    const productsMap = new Map<string, CsvProduct>();

    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map(c => c.trim());
      const reference = cols[refIndex]?.toUpperCase() || '';
      const colorCode = cols[colorIndex] || '';
      const description = cols[descIndex] || '';

      if (!reference) continue;

      // Get base reference (without any suffixes)
      const baseRef = reference.split('_')[0];
      const uniqueKey = `${baseRef}_${colorCode}`;
      
      if (!productsMap.has(uniqueKey)) {
        productsMap.set(uniqueKey, {
          reference: baseRef,
          colorCode,
          colorName: getColorName(colorCode),
          description: description.trim(),
          uniqueKey,
        });
      }
    }

    return Array.from(productsMap.values()).sort((a, b) => 
      a.reference.localeCompare(b.reference)
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
      console.log(`🎪 Parsed ${products.length} unique products from CSV`);
    };
    reader.readAsText(file);
  };

  // ============================================
  // IMAGE PARSING
  // Format: B126AD001_1.jpg, B126AD001_2.jpg, etc.
  // ============================================
  const extractImageInfo = (filename: string): { ref: string; imageNumber: number } => {
    // Pattern: B126XX###_N.jpg where N is image number
    // Handle variations like:
    // - B126AD001_1.jpg
    // - B126AD038_1-2.jpg
    // - B126AD055_1b.jpg
    // - B126AD101_1 2.jpg (with space)
    // - B999CD008_1 .jpg (with space before extension)
    
    // Remove extension and clean up
    const baseName = filename.replace(/\.[^.]+$/, '').trim();
    
    // Match reference and image number
    // Reference: B followed by 3 digits, 2 letters, 3 digits (B126AD001)
    const match = baseName.match(/^(B\d{3}[A-Z]{2}\d{3})_(\d+)/i);
    
    if (match) {
      return {
        ref: match[1].toUpperCase(),
        imageNumber: parseInt(match[2]) || 1,
      };
    }
    
    // Fallback: try to extract just the reference
    const refMatch = baseName.match(/^(B\d{3}[A-Z]{2}\d{3})/i);
    if (refMatch) {
      return {
        ref: refMatch[1].toUpperCase(),
        imageNumber: 1,
      };
    }
    
    return { ref: '', imageNumber: 0 };
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
        imageNumber: info.imageNumber,
      };
    }).filter(img => img.extractedRef !== ''); // Filter out unparseable files

    // Sort by reference, then by image number
    parsed.sort((a, b) => {
      const refCompare = a.extractedRef.localeCompare(b.extractedRef);
      if (refCompare !== 0) return refCompare;
      return a.imageNumber - b.imageNumber;
    });

    setAllImages(parsed);
    console.log(`🎪 Found ${parsed.length} images in folder`);
  };

  // ============================================
  // DIRECT UPLOAD MODE - Match images directly to Odoo products
  // ============================================
  const performDirectMatching = async () => {
    if (allImages.length === 0) {
      alert('Selecteer eerst een map met afbeeldingen');
      return;
    }

    setLoading(true);

    const { uid, password } = getCredentials();
    
    // Group images by reference
    const imagesByRef = new Map<string, ImageFile[]>();
    for (const img of allImages) {
      if (!img.extractedRef) continue;
      const existing = imagesByRef.get(img.extractedRef) || [];
      existing.push(img);
      imagesByRef.set(img.extractedRef, existing);
    }

    console.log(`🎪 Found ${imagesByRef.size} unique references in images`);

    const matched: ProductWithImages[] = [];

    // For each unique reference, search Odoo
    for (const [ref, images] of imagesByRef) {
      // Sort images by number
      images.sort((a, b) => a.imageNumber - b.imageNumber);

      let odooTemplateId: number | undefined;
      let odooProductName: string | undefined;
      let odooHasImages = false;
      let odooImageCount = 0;

      if (uid && password) {
        try {
          const searchResponse = await fetch('/api/search-bobochoses-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: ref,
              uid,
              password,
            }),
          });
          const searchData = await searchResponse.json();

          if (searchData.found && searchData.products.length > 0) {
            const bestMatch = searchData.products[0];
            odooTemplateId = bestMatch.templateId;
            odooProductName = bestMatch.name;
            odooHasImages = bestMatch.hasImages || false;
            odooImageCount = bestMatch.imageCount || 0;
          }
        } catch (error) {
          console.error(`Error checking Odoo for ${ref}:`, error);
        }
      }

      // Create a pseudo-product for this reference
      matched.push({
        csvProduct: {
          reference: ref,
          colorCode: '',
          colorName: odooProductName ? '' : 'Unknown',
          description: odooProductName || ref,
          uniqueKey: ref,
        },
        images,
        odooTemplateId,
        odooProductName,
        odooHasImages,
        odooImageCount,
        // Auto-select if found in Odoo and no existing images
        selected: !!odooTemplateId && !odooHasImages,
        uploaded: false,
      });
    }

    // Sort by reference
    matched.sort((a, b) => a.csvProduct.reference.localeCompare(b.csvProduct.reference));

    setProductsWithImages(matched);
    setUnmatchedImages([]);
    setLoading(false);
    setCurrentStep(2);

    const foundInOdoo = matched.filter(p => p.odooTemplateId).length;
    const notInOdoo = matched.filter(p => !p.odooTemplateId).length;
    console.log(`✅ Direct mode: ${foundInOdoo} found in Odoo, ${notInOdoo} not found`);
    
    if (notInOdoo > 0) {
      alert(`⚠️ ${notInOdoo} van de ${matched.length} producten niet gevonden in Odoo.\n\nDeze producten moeten eerst worden geïmporteerd via de Product Import pagina.`);
    }
  };

  // ============================================
  // MATCHING LOGIC (CSV mode)
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

    // Get credentials for Odoo lookup
    const { uid, password } = getCredentials();

    // Build matching map
    const matched: ProductWithImages[] = [];
    const usedImages = new Set<string>();

    // For each CSV product, find matching images by reference
    for (const csvProduct of csvProducts) {
      const productImages: ImageFile[] = [];
      const productRef = csvProduct.reference.toUpperCase();

      // Find images that match this reference
      for (const img of allImages) {
        if (usedImages.has(img.filename)) continue;

        // Reference must match
        if (img.extractedRef === productRef) {
          productImages.push(img);
          usedImages.add(img.filename);
        }
      }

      // Sort by image number
      productImages.sort((a, b) => a.imageNumber - b.imageNumber);

      // Check Odoo for existing images (if credentials available)
      let odooHasImages = false;
      let odooImageCount = 0;
      let odooTemplateId: number | undefined;
      let odooProductName: string | undefined;

      if (uid && password) {
        try {
          const searchResponse = await fetch('/api/search-bobochoses-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: csvProduct.reference,
              colorCode: csvProduct.colorCode,
              uid,
              password,
            }),
          });
          const searchData = await searchResponse.json();

          if (searchData.found && searchData.products.length > 0) {
            const bestMatch = searchData.products[0];
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
        images: productImages,
        odooTemplateId,
        odooProductName,
        odooHasImages,
        odooImageCount,
        // Auto-select ONLY if has images AND no existing images in Odoo
        selected: productImages.length > 0 && !odooHasImages,
        uploaded: false,
      });
    }

    // Find truly unmatched images (not used by any product)
    const unmatchedImgs: ImageFile[] = [];
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
      extractedRef: info.ref,
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

    for (const product of toUpload) {
      try {
        let templateId = product.odooTemplateId;
        
        // If we don't have a template ID yet (from matching step), search for it
        if (!templateId) {
          const searchResponse = await fetch('/api/search-bobochoses-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: product.csvProduct.reference,
              colorCode: product.csvProduct.colorCode || undefined,
              uid,
              password,
            }),
          });
          const searchData = await searchResponse.json();

          if (!searchData.found || searchData.products.length === 0) {
            // Try searching by just the base reference (without color code)
            const fallbackResponse = await fetch('/api/search-bobochoses-products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reference: product.csvProduct.reference,
                uid,
                password,
              }),
            });
            const fallbackData = await fallbackResponse.json();
            
            if (!fallbackData.found || fallbackData.products.length === 0) {
              results.push({
                productKey: product.csvProduct.uniqueKey,
                productName: product.odooProductName || `Bobo Choses - ${product.csvProduct.description} - ${product.csvProduct.colorName}`,
                success: false,
                imagesUploaded: 0,
                error: `Product niet gevonden in Odoo (ref: ${product.csvProduct.reference})`,
              });
              continue;
            }
            
            templateId = fallbackData.products[0].templateId;
          } else {
            templateId = searchData.products[0].templateId;
          }
        }

        // Validate template ID
        if (!templateId) {
          results.push({
            productKey: product.csvProduct.uniqueKey,
            productName: product.odooProductName || `Bobo Choses - ${product.csvProduct.description}`,
            success: false,
            imagesUploaded: 0,
            error: `Geen template ID gevonden voor ${product.csvProduct.reference}`,
          });
          continue;
        }

        console.log(`🎪 Uploading ${product.images.length} images for ${product.csvProduct.reference} (template ${templateId})...`);

        // Upload each image
        let imagesUploaded = 0;
        const uploadErrors: string[] = [];
        
        for (let imgIdx = 0; imgIdx < product.images.length; imgIdx++) {
          const img = product.images[imgIdx];
          
          try {
            const buffer = await img.file.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            const colorPart = product.csvProduct.colorName ? ` - ${product.csvProduct.colorName}` : '';
            const imageName = `${product.csvProduct.reference}${colorPart} - ${imgIdx + 1}`;

            console.log(`  📷 Uploading image ${imgIdx + 1}/${product.images.length}: ${img.filename}`);

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
              console.log(`  ✅ Image ${imgIdx + 1} uploaded successfully`);
            } else {
              const errorMsg = uploadData.error || 'Unknown error';
              uploadErrors.push(`Image ${imgIdx + 1}: ${errorMsg}`);
              console.error(`  ❌ Image ${imgIdx + 1} failed: ${errorMsg}`);
            }
          } catch (imgError) {
            const errorMsg = String(imgError);
            uploadErrors.push(`Image ${imgIdx + 1}: ${errorMsg}`);
            console.error(`  ❌ Image ${imgIdx + 1} exception: ${errorMsg}`);
          }
        }

        const displayName = product.odooProductName || `Bobo Choses - ${product.csvProduct.description}${product.csvProduct.colorName ? ' - ' + product.csvProduct.colorName : ''}`;
        
        // Consider it a success if at least one image was uploaded
        const isSuccess = imagesUploaded > 0;
        
        results.push({
          productKey: product.csvProduct.uniqueKey,
          productName: displayName,
          success: isSuccess,
          imagesUploaded,
          error: uploadErrors.length > 0 ? uploadErrors.join('; ') : undefined,
        });
        
        console.log(`🎪 ${product.csvProduct.reference}: ${imagesUploaded}/${product.images.length} images uploaded`);
      } catch (error) {
        const displayName = product.odooProductName || `Bobo Choses - ${product.csvProduct.description}${product.csvProduct.colorName ? ' - ' + product.csvProduct.colorName : ''}`;
        console.error(`❌ Error uploading ${product.csvProduct.reference}:`, error);
        results.push({
          productKey: product.csvProduct.uniqueKey,
          productName: displayName,
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
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    if (failedCount > 0) {
      const failedProducts = results.filter(r => !r.success).slice(0, 5);
      alert(
        `⚠️ Upload gedeeltelijk gelukt:\n\n` +
        `✅ ${successCount} producten succesvol (${totalImages} afbeeldingen)\n` +
        `❌ ${failedCount} producten mislukt\n\n` +
        `Eerste fouten:\n${failedProducts.map(p => `• ${p.productName}: ${p.error}`).join('\n')}`
      );
    } else {
      alert(`✅ ${totalImages} afbeeldingen geüpload voor ${successCount} producten`);
    }
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
             p.csvProduct.description.toLowerCase().includes(q);
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
        <title>Bobo Choses - Afbeeldingen Import</title>
      </Head>

      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">🎪</span>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Bobo Choses - Afbeeldingen Import</h1>
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
              <h2 className="text-xl font-bold mb-4">📁 Stap 1: Selecteer Afbeeldingen</h2>

              {/* Mode Selection */}
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setUploadMode('direct')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    uploadMode === 'direct'
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-gray-200 hover:border-yellow-300'
                  }`}
                >
                  <div className="text-2xl mb-1">🚀</div>
                  <div className="font-bold text-gray-900">Direct Upload</div>
                  <div className="text-xs text-gray-500">
                    Upload direct naar Odoo (producten moeten al bestaan)
                  </div>
                </button>
                <button
                  onClick={() => setUploadMode('csv')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                    uploadMode === 'csv'
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-gray-200 hover:border-yellow-300'
                  }`}
                >
                  <div className="text-2xl mb-1">📋</div>
                  <div className="font-bold text-gray-900">CSV + Afbeeldingen</div>
                  <div className="text-xs text-gray-500">
                    Match afbeeldingen met CSV packing list
                  </div>
                </button>
              </div>

              {uploadMode === 'direct' ? (
                <>
                  {/* Direct Mode - Only folder selection */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-yellow-400 transition-colors">
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-expect-error - webkitdirectory is not in types
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
                      <div className="text-5xl mb-3">🖼️</div>
                      <div className="font-medium text-gray-900 text-lg">
                        {folderName || 'Klik om afbeeldingen map te selecteren'}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Bijv: PRODUCT PICTURES WOMAN SS26
                      </div>
                      {allImages.length > 0 && (
                        <div className="text-sm text-green-600 mt-3 font-bold">
                          ✓ {allImages.length} afbeeldingen gevonden
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Direct Match Button */}
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={performDirectMatching}
                      disabled={allImages.length === 0 || loading}
                      className={`px-8 py-3 rounded-lg font-bold text-lg ${
                        allImages.length > 0 && !loading
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {loading ? '⏳ Zoeken in Odoo...' : '🔍 Zoek Producten in Odoo'}
                    </button>
                  </div>

                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>💡 Direct Upload mode:</strong> Afbeeldingen worden direct gekoppeld aan producten in Odoo op basis van de referentie code in de bestandsnaam.
                      De producten moeten al geïmporteerd zijn via Product Import.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* CSV Mode - Both CSV and folder selection */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* CSV Upload */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-yellow-400 transition-colors">
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
                          {csvFileName || 'Klik om Packing List CSV te uploaden'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Bijv: Packing-list_SO25-01066.csv
                        </div>
                        {csvProducts.length > 0 && (
                          <div className="text-sm text-green-600 mt-2">
                            ✓ {csvProducts.length} producten geladen
                          </div>
                        )}
                      </button>
                    </div>

                    {/* Folder Selection */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-yellow-400 transition-colors">
                      <input
                        ref={folderInputRef}
                        type="file"
                        // @ts-expect-error - webkitdirectory is not in types
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
                        <div className="text-xs text-gray-500 mt-1">
                          Bijv: PRODUCT PICTURES WOMAN SS26
                        </div>
                        {allImages.length > 0 && (
                          <div className="text-sm text-green-600 mt-2">
                            ✓ {allImages.length} afbeeldingen gevonden
                          </div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* CSV Match Button */}
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={performMatching}
                      disabled={csvProducts.length === 0 || allImages.length === 0 || loading}
                      className={`px-8 py-3 rounded-lg font-bold text-lg ${
                        csvProducts.length > 0 && allImages.length > 0 && !loading
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {loading ? '⏳ Matchen & Odoo checken...' : '🔍 Match Afbeeldingen met Producten'}
                    </button>
                  </div>

                  {/* Preview info */}
                  {csvProducts.length > 0 && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                      <h3 className="font-bold mb-2">📋 CSV Preview (eerste 10 producten)</h3>
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        {csvProducts.slice(0, 10).map(p => (
                          <div key={p.uniqueKey} className="bg-white p-2 rounded border">
                            <div className="font-mono font-bold text-yellow-600">{p.reference}</div>
                            <div className="text-blue-600">🎨 {p.colorName}</div>
                            <div className="text-gray-600 truncate text-[10px]">{p.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {loading && (
                <div className="mt-4 text-center text-gray-600">
                  <div className="animate-pulse">
                    Controleren of producten al afbeeldingen hebben in Odoo...
                  </div>
                </div>
              )}

              {/* Info box */}
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-bold text-yellow-800 mb-2">📝 Bestandsnaam formaat</h3>
                <p className="text-sm text-yellow-700 mb-2">
                  Afbeeldingen worden gematcht op basis van de referentie code in de bestandsnaam:
                </p>
                <div className="bg-white rounded p-2 text-xs font-mono">
                  <div><strong>B126AD001_1.jpg</strong> → Reference: B126AD001, Image 1 (hoofdfoto)</div>
                  <div><strong>B126AD001_2.jpg</strong> → Reference: B126AD001, Image 2</div>
                  <div><strong>B126AK004_3.jpg</strong> → Reference: B126AK004, Image 3</div>
                </div>
              </div>
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
                  <div className="text-xs text-gray-600">⚠️ In Odoo</div>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center border-2 border-yellow-300">
                  <div className="text-xl font-bold text-yellow-600">{stats.selected}</div>
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
                    <option value="with-images">Met foto&apos;s ({stats.withImages})</option>
                    <option value="without-images">Zonder foto&apos;s ({stats.withoutImages})</option>
                    <option value="existing-odoo">⚠️ Al in Odoo ({stats.existingOdoo})</option>
                  </select>
                  <input
                    type="text"
                    placeholder="🔍 Zoek op referentie, kleur of beschrijving..."
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
                            className="w-5 h-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500 cursor-pointer disabled:opacity-50"
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
                          {!productsWithImages.find(p => p.csvProduct.uniqueKey === csvProduct.uniqueKey)?.odooTemplateId && (
                            <span className="bg-orange-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                              ⚠️ NIET IN ODOO
                            </span>
                          )}
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-sm font-mono font-bold">
                            {csvProduct.reference}
                          </span>
                          {csvProduct.colorName && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm">
                              🎨 {csvProduct.colorName}
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-gray-900">
                          {productsWithImages.find(p => p.csvProduct.uniqueKey === csvProduct.uniqueKey)?.odooProductName || `Bobo Choses - ${csvProduct.description}`}
                        </div>
                      </div>

                      {/* Image Count Badge */}
                      <div className={`px-3 py-1 rounded text-sm font-bold ${
                        images.length > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {images.length} foto{images.length !== 1 ? "&apos;s" : ''}
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
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
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
                  className="px-6 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
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
