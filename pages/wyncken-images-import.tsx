import { useState } from 'react';
import Head from 'next/head';

interface ProductWithImages {
  style: string;
  colour: string;
  description: string;
  templateId: number | null;
  name: string;
  foundInOdoo: boolean;
  images: File[];
  imageCount: number;
  productKey: string; // Format: "style-colour" (normalized)
}

interface UploadResult {
  productKey: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

export default function WynckenImagesImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfProducts, setPdfProducts] = useState<Array<{
    style: string;
    fabric: string;
    colour: string;
    materialContent: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [localImages, setLocalImages] = useState<File[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [productFilter, setProductFilter] = useState<'all' | 'found' | 'notFound'>('all');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/parse-wyncken-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.products) {
        setPdfProducts(data.products);
        alert(`✅ ${data.products.length} producten geparsed uit PDF invoice`);
      } else {
        alert(`❌ Fout bij parsen PDF: ${data.error || 'Unknown error'}`);
        setPdfFile(null);
      }
    } catch (error) {
      alert(`❌ Fout bij uploaden PDF: ${(error as Error).message}`);
      setPdfFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    console.log('📄 CSV file selected');
  };

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLocalImages(files);
    console.log(`📁 Selected ${files.length} images`);
  };

  // Normalize style: extract style code (e.g., "MW20J01" from "MW20J01 MINI BON BON SWEAT")
  const normalizeStyle = (style: string): string => {
    if (!style) return '';
    // Extract style code (first part before space, e.g., "MW20J01")
    const match = style.match(/^([A-Z]{2,}\d+[A-Z0-9]*)/i);
    return match ? match[1].toUpperCase() : style.toUpperCase().trim();
  };

  // Normalize colour for matching (remove spaces, handle special characters)
  const normalizeColour = (colour: string): string => {
    if (!colour) return '';
    return colour
      .toUpperCase()
      .trim()
      .replace(/\s+/g, '') // Remove spaces
      .replace(/[:/]/g, '') // Remove colons and slashes
      .replace(/[_-]/g, ''); // Remove dashes and underscores
  };

  // Create product key from style and colour (normalized)
  const createProductKey = (style: string, colour: string): string => {
    const normalizedStyle = normalizeStyle(style);
    const normalizedColour = normalizeColour(colour);
    return `${normalizedStyle}-${normalizedColour}`.toLowerCase();
  };

  const parseCSVAndMatchImages = async () => {
    if (pdfProducts.length === 0) {
      alert('⚠️ Upload eerst de PDF invoice (verplicht)');
      return;
    }
    
    if (localImages.length === 0) {
      alert('⚠️ Selecteer eerst images');
      return;
    }

    setLoading(true);
    try {
      // Start with products from PDF (these are the products we have)
      const productsMap = new Map<string, { 
        style: string;
        colour: string;
        description: string;
        rawStyle: string; // Original style from PDF
        rawColour: string; // Original colour from PDF
      }>();
      
      // Add products from PDF
      for (const pdfProduct of pdfProducts) {
        const productKey = createProductKey(pdfProduct.style, pdfProduct.colour);
        if (!productsMap.has(productKey)) {
          productsMap.set(productKey, { 
            style: pdfProduct.style,
            colour: pdfProduct.colour || '',
            description: '', // Will be filled from CSV if available
            rawStyle: pdfProduct.style,
            rawColour: pdfProduct.colour || '',
          });
        }
      }

      console.log(`📦 Found ${productsMap.size} unique products from PDF`);

      // If CSV is loaded, use it to add extra information (descriptions) to PDF products
      if (csvFile) {
        const csvText = await csvFile.text();
        const lines = csvText.split('\n').filter(l => l.trim());
        
        if (lines.length >= 2) {
          const headers = lines[0].split(';').map(h => h.trim());
          const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
          const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour' || h.toLowerCase() === 'color');
          const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
          
          if (styleIdx !== -1 && colourIdx !== -1) {
            // Create a map of CSV products for lookup
            const csvProductsMap = new Map<string, { style: string; colour: string; description: string }>();
            
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(';').map(v => v.trim());
              if (values.length < headers.length) continue;
              
              const style = values[styleIdx] || '';
              const colour = values[colourIdx] || '';
              const description = descriptionIdx >= 0 ? (values[descriptionIdx] || '') : '';
              
              if (!style || !colour) continue;
              
              const csvProductKey = createProductKey(style, colour);
              csvProductsMap.set(csvProductKey, { style, colour, description });
            }

            // Match CSV products with PDF products and add descriptions
            for (const [productKey, pdfProduct] of productsMap) {
              const csvProduct = csvProductsMap.get(productKey);
              if (csvProduct && csvProduct.description) {
                pdfProduct.description = csvProduct.description;
                console.log(`✅ Added description from CSV for ${productKey}`);
              }
            }
          }
        }
      }

      // Match images with products
      // Image format: "MW20J01-ARTISTS BLUE-2.jpg" or "MW20J01-ARTISTS BLUE.jpg"
      // Pattern: {STYLE}-{COLOUR}[-{VARIANT}].{ext}
      const imageMap = new Map<string, File[]>();
      
      localImages.forEach(file => {
        const filename = file.name;
        const filenameWithoutExt = filename.replace(/\.[^.]+$/, '').trim();
        
        // Extract style and colour from filename
        // Pattern: {STYLE}-{COLOUR}[-{VARIANT}]
        // Examples:
        // - "MW20J01-ARTISTS BLUE-2" -> style: "MW20J01", colour: "ARTISTS BLUE"
        // - "MW20J01-ARTISTS BLUE" -> style: "MW20J01", colour: "ARTISTS BLUE"
        // - "WK20J46-VIOLET" -> style: "WK20J46", colour: "VIOLET"
        // - "MW20J04-PILLERRED:ECRU-2" -> style: "MW20J04", colour: "PILLERRED:ECRU"
        
        const match = filenameWithoutExt.match(/^([A-Z]{2,}\d+[A-Z0-9]*)[-_](.+?)(?:[-_](\d+))?$/i);
        if (match) {
          const imageStyle = match[1].toUpperCase(); // e.g., "MW20J01"
          const imageColour = match[2].trim(); // e.g., "ARTISTS BLUE" or "PILLERRED:ECRU"
          
          // Normalize image colour for matching
          const normalizedImageColour = normalizeColour(imageColour);
          
          // Try to match with products - MUST match both style AND colour exactly
          let matchedProductKey: string | null = null;
          let matchedProduct: { style: string; colour: string } | null = null;
          
          // First pass: exact match by style code and normalized colour
          for (const [productKey, product] of productsMap) {
            const normalizedStyle = normalizeStyle(product.style);
            const normalizedProductColour = normalizeColour(product.colour);
            
            // CRITICAL: Must match both style AND colour exactly
            if (normalizedStyle === imageStyle && normalizedProductColour === normalizedImageColour) {
              matchedProductKey = productKey;
              matchedProduct = product;
              console.log(`  ✅ Image matched (exact): ${file.name} → ${productKey} (${product.style} - ${product.colour})`);
              break;
            }
          }
          
          // Fallback: try matching with raw style (full style name) if style code didn't match
          // BUT STILL REQUIRE EXACT COLOUR MATCH
          if (!matchedProductKey) {
            for (const [productKey, product] of productsMap) {
              const normalizedProductColour = normalizeColour(product.colour);
              
              // Check if image style code matches any part of product style
              // AND colour must match exactly
              const productStyleUpper = product.style.toUpperCase();
              if (productStyleUpper.includes(imageStyle) && normalizedProductColour === normalizedImageColour) {
                matchedProductKey = productKey;
                matchedProduct = product;
                console.log(`  ✅ Image matched (fallback): ${file.name} → ${productKey} (${product.style} - ${product.colour})`);
                break;
              }
            }
          }
          
          // Only add image if we found an exact match (style + colour)
          if (matchedProductKey && matchedProduct) {
            // Double-check: verify the colour really matches
            const finalNormalizedProductColour = normalizeColour(matchedProduct.colour);
            if (finalNormalizedProductColour === normalizedImageColour) {
              if (!imageMap.has(matchedProductKey)) {
                imageMap.set(matchedProductKey, []);
              }
              imageMap.get(matchedProductKey)!.push(file);
              console.log(`  📸 Added image ${file.name} to product ${matchedProductKey} (${matchedProduct.style} - ${matchedProduct.colour})`);
            } else {
              console.log(`  ⚠️ Colour mismatch prevented match: image colour "${imageColour}" (normalized: ${normalizedImageColour}) vs product colour "${matchedProduct.colour}" (normalized: ${finalNormalizedProductColour})`);
            }
          } else {
            console.log(`  ⚠️ Image not matched with product: ${file.name} (style: ${imageStyle}, colour: ${imageColour}, normalized colour: ${normalizedImageColour})`);
            // Log available products with same style for debugging
            const productsWithSameStyle = Array.from(productsMap.entries())
              .filter(([_, p]) => normalizeStyle(p.style) === imageStyle)
              .map(([key, p]) => `${key}: ${p.colour} (normalized: ${normalizeColour(p.colour)})`)
              .slice(0, 5);
            if (productsWithSameStyle.length > 0) {
              console.log(`     Available products with style ${imageStyle}:`, productsWithSameStyle);
            }
          }
        } else {
          console.log(`  ❌ Image NOT matched (pattern failed): ${file.name}`);
        }
      });

      console.log(`📸 Matched images for ${imageMap.size} products`);

      // Find products in Odoo
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        alert('Geen Odoo credentials gevonden');
        setLoading(false);
        return;
      }

      // Batch search for products in Odoo
      // Collect all references to search for (both full style names and style codes)
      const referencesToSearch: string[] = [];
      const referenceToProductKey: Map<string, string> = new Map(); // Map reference -> productKey
      
      for (const [productKey, product] of productsMap) {
        const styleReference = product.style;
        const styleCode = normalizeStyle(product.style);
        
        // Add both full style and style code to search list
        if (!referenceToProductKey.has(styleReference)) {
          referencesToSearch.push(styleReference);
          referenceToProductKey.set(styleReference, productKey);
        }
        if (styleCode !== styleReference && !referenceToProductKey.has(styleCode)) {
          referencesToSearch.push(styleCode);
          referenceToProductKey.set(styleCode, productKey);
        }
        
        // Also add "Wynken - {style}" format for better matching
        // Products are stored as "Wynken - {style} - {colour}" so searching for "Wynken - {style}" should work
        const wynkenStyleReference = `Wynken - ${styleReference}`;
        if (!referenceToProductKey.has(wynkenStyleReference)) {
          referencesToSearch.push(wynkenStyleReference);
          referenceToProductKey.set(wynkenStyleReference, productKey);
        }
      }

      console.log(`🔍 Batch searching for ${referencesToSearch.length} references...`);

      // Batch search all references at once
      const batchSearchResponse = await fetch('/api/search-products-by-reference-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          references: referencesToSearch,
          uid,
          password,
        }),
      });

      const batchSearchData = await batchSearchResponse.json();
      
      if (!batchSearchData.success) {
        throw new Error(batchSearchData.error || 'Batch search failed');
      }

      // Create a map of reference -> search result
      const searchResultsMap = new Map<string, any>();
      batchSearchData.results.forEach((result: any) => {
        searchResultsMap.set(result.reference, result);
      });

      console.log(`✅ Batch search complete: ${batchSearchData.foundCount}/${referencesToSearch.length} references found`);

      // Match products with search results
      const matched: ProductWithImages[] = [];
      
      for (const [productKey, product] of productsMap) {
        const images = imageMap.get(productKey) || [];
        
        // Try to find product by full style name first
        const styleReference = product.style;
        const styleCode = normalizeStyle(product.style);
        
        let templateId: number | null = null;
        let foundInOdoo = false;
        let searchMethod = '';
        
        // Try multiple search strategies
        const wynkenStyleReference = `Wynken - ${styleReference}`;
        
        // Strategy 1: Try "Wynken - {style}" format first (most likely match)
        const wynkenStyleResult = searchResultsMap.get(wynkenStyleReference);
        if (wynkenStyleResult && wynkenStyleResult.found) {
          templateId = wynkenStyleResult.templateId;
          foundInOdoo = true;
          searchMethod = wynkenStyleResult.matchedField || 'wynken-style';
          console.log(`✅ Found product ${wynkenStyleReference} in Odoo via ${searchMethod}: Template ID ${templateId}`);
        } else {
          // Strategy 2: Try full style name
          const fullStyleResult = searchResultsMap.get(styleReference);
          if (fullStyleResult && fullStyleResult.found) {
            templateId = fullStyleResult.templateId;
            foundInOdoo = true;
            searchMethod = fullStyleResult.matchedField || 'style';
            console.log(`✅ Found product ${styleReference} in Odoo via ${searchMethod}: Template ID ${templateId}`);
          } else if (styleCode !== styleReference) {
            // Strategy 3: Try style code as fallback
            const styleCodeResult = searchResultsMap.get(styleCode);
            if (styleCodeResult && styleCodeResult.found) {
              templateId = styleCodeResult.templateId;
              foundInOdoo = true;
              searchMethod = styleCodeResult.matchedField || 'styleCode';
              console.log(`✅ Found product ${styleCode} (fallback) in Odoo via ${searchMethod}: Template ID ${templateId}`);
            } else {
              // Fallback: Try individual search for this product (more thorough)
              console.log(`🔍 Trying individual search for ${styleReference}...`);
              try {
                const individualSearchResponse = await fetch('/api/search-product-by-reference', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    reference: styleReference,
                    uid,
                    password,
                  }),
                });
                
                const individualSearchData = await individualSearchResponse.json();
                if (individualSearchData.success && individualSearchData.found) {
                  templateId = individualSearchData.templateId;
                  foundInOdoo = true;
                  searchMethod = individualSearchData.matchedField || 'individual';
                  console.log(`✅ Found product ${styleReference} via individual search: Template ID ${templateId}`);
                } else {
                  // Try style code with individual search
                  const individualSearchResponse2 = await fetch('/api/search-product-by-reference', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      reference: styleCode,
                      uid,
                      password,
                    }),
                  });
                  
                  const individualSearchData2 = await individualSearchResponse2.json();
                  if (individualSearchData2.success && individualSearchData2.found) {
                    templateId = individualSearchData2.templateId;
                    foundInOdoo = true;
                    searchMethod = individualSearchData2.matchedField || 'individual-styleCode';
                    console.log(`✅ Found product ${styleCode} via individual search: Template ID ${templateId}`);
                  } else {
                    console.log(`❌ Product not found: ${styleReference} (tried batch and individual: ${styleReference}, ${styleCode})`);
                  }
                }
              } catch (error) {
                console.error(`Error in individual search for ${styleReference}:`, error);
              }
            }
          } else {
            // Fallback: Try individual search when style code equals style reference
            console.log(`🔍 Trying individual search for ${styleReference}...`);
            try {
              const individualSearchResponse = await fetch('/api/search-product-by-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: styleReference,
                  uid,
                  password,
                }),
              });
              
              const individualSearchData = await individualSearchResponse.json();
              if (individualSearchData.success && individualSearchData.found) {
                templateId = individualSearchData.templateId;
                foundInOdoo = true;
                searchMethod = individualSearchData.matchedField || 'individual';
                console.log(`✅ Found product ${styleReference} via individual search: Template ID ${templateId}`);
              } else {
                console.log(`❌ Product not found: ${styleReference}`);
              }
            } catch (error) {
              console.error(`Error in individual search for ${styleReference}:`, error);
            }
          }
        }

        matched.push({
          style: product.style,
          colour: product.colour,
          description: product.description,
          templateId,
          name: `Wynken - ${product.style} - ${product.colour}`,
          foundInOdoo,
          images,
          imageCount: images.length,
          productKey,
        });
        
        if (foundInOdoo) {
          console.log(`  📦 Product ${productKey}: ${images.length} images matched, Template ID: ${templateId} (found via ${searchMethod || 'unknown'})`);
        } else {
          console.log(`  ⚠️ Product ${productKey}: ${images.length} images matched, but NOT found in Odoo`);
        }
      }

      matched.sort((a, b) => b.imageCount - a.imageCount);
      setProductsWithImages(matched);
      setCurrentStep(2);

      const withImages = matched.filter(p => p.imageCount > 0).length;
      const found = matched.filter(p => p.foundInOdoo).length;
      
      alert(`✅ Matching compleet!\n\n✅ Gevonden in Odoo: ${found}/${matched.length}\n📸 Producten met images: ${withImages}/${matched.length}`);
    } catch (error) {
      console.error('Error parsing files:', error);
      alert(`Fout bij parsen: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const addImageToProduct = (productIndex: number, files: FileList | null, inputElement?: HTMLInputElement) => {
    if (!files || files.length === 0) return;
    const newProducts = [...productsWithImages];
    const newImages = Array.from(files);
    newProducts[productIndex].images = [...newProducts[productIndex].images, ...newImages];
    newProducts[productIndex].imageCount = newProducts[productIndex].images.length;
    setProductsWithImages(newProducts);
    
    if (inputElement) {
      inputElement.value = '';
    }
  };

  const removeImageFromProduct = (productIndex: number, imageIndex: number) => {
    const newProducts = [...productsWithImages];
    newProducts[productIndex].images.splice(imageIndex, 1);
    newProducts[productIndex].imageCount = newProducts[productIndex].images.length;
    setProductsWithImages(newProducts);
  };

  const uploadImagesToOdoo = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden');
      return;
    }

    const productsToUpload = productsWithImages.filter(p => p.foundInOdoo && p.images.length > 0);
    
    if (productsToUpload.length === 0) {
      alert('Geen producten met images gevonden om te uploaden');
      return;
    }

    if (!confirm(`Upload ${productsToUpload.reduce((sum, p) => sum + p.images.length, 0)} images voor ${productsToUpload.length} producten?`)) {
      return;
    }

    setLoading(true);
    setUploadProgress({ current: 0, total: productsToUpload.reduce((sum, p) => sum + p.images.length, 0) });

    try {
      // Build product key to template ID mapping
      const productKeyToTemplateId: Record<string, number> = {};
      productsToUpload.forEach(p => {
        if (p.templateId) {
          productKeyToTemplateId[p.productKey] = p.templateId;
        }
      });

      // Convert images to base64
      const imagesToUpload: Array<{ base64: string; filename: string; productKey: string }> = [];
      
      for (const product of productsToUpload) {
        for (const imageFile of product.images) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });
          
          imagesToUpload.push({
            base64,
            filename: imageFile.name,
            productKey: product.productKey,
          });
        }
      }

      console.log(`🌻 Preparing to upload ${imagesToUpload.length} images...`);

      // Upload images in batches to avoid exceeding request size limits
      const BATCH_SIZE = 2; // Process 2 images per request
      const batches = [];
      
      for (let i = 0; i < imagesToUpload.length; i += BATCH_SIZE) {
        batches.push(imagesToUpload.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`📦 Split into ${batches.length} batch(es) of max ${BATCH_SIZE} images`);
      
      let totalSize = 0;
      for (const img of imagesToUpload) {
        totalSize += img.base64.length;
      }
      console.log(`📊 Total image data size: ~${(totalSize / 1024 / 1024).toFixed(2)}MB`);

      const allResults: any[] = [];
      let totalUploaded = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        let batchSize = 0;
        for (const img of batch) {
          batchSize += img.base64.length;
        }
        console.log(`🌻 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images (~${(batchSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        setUploadProgress({ current: batchIndex * BATCH_SIZE, total: imagesToUpload.length });
        
        // Upload batch
        const response = await fetch('/api/wyncken-upload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batch,
            productKeyToTemplateId,
            odooUid: uid,
            odooPassword: password,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Batch ${batchIndex + 1} failed with status ${response.status}:`, errorText.substring(0, 200));
          // Add failed results for this batch
          for (const img of batch) {
            allResults.push({
              productKey: img.productKey,
              success: false,
              error: `Batch ${batchIndex + 1} upload failed with status ${response.status}`,
            });
          }
          continue;
        }

        const data = await response.json();
        
        if (!data.success) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, data.error);
          for (const img of batch) {
            allResults.push({
              productKey: img.productKey,
              success: false,
              error: data.error || 'Unknown error',
            });
          }
        } else {
          console.log(`✅ Batch ${batchIndex + 1} complete: ${data.imagesUploaded}/${data.totalImages} uploaded`);
          totalUploaded += data.imagesUploaded;
          if (data.results) {
            allResults.push(...data.results);
          }
        }
      }

      console.log(`🎉 Total uploaded: ${totalUploaded}/${imagesToUpload.length} images`);

      // Group results by product key
      const resultsByProductKey: Record<string, UploadResult> = {};
      allResults.forEach((r: any) => {
        if (!resultsByProductKey[r.productKey]) {
          resultsByProductKey[r.productKey] = {
            productKey: r.productKey,
            success: true,
            imagesUploaded: 0,
          };
        }
        if (r.success) {
          resultsByProductKey[r.productKey].imagesUploaded++;
        } else {
          resultsByProductKey[r.productKey].success = false;
          resultsByProductKey[r.productKey].error = r.error;
        }
      });

      setUploadResults(Object.values(resultsByProductKey));
      setCurrentStep(3);
      
      const successCount = allResults.filter((r: any) => r.success).length;
      alert(`✅ Upload compleet!\n\n${successCount}/${imagesToUpload.length} images geüpload`);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`❌ Upload fout: ${(error as Error).message}`);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const filteredProducts = productsWithImages.filter(p => {
    if (productFilter === 'found') return p.foundInOdoo;
    if (productFilter === 'notFound') return !p.foundInOdoo;
    return true;
  });

  return (
    <>
      <Head>
        <title>Wynken - Image Upload</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              🌻 Wynken - Image Upload
            </h1>

            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Stap 1: Upload Bestanden</h2>
                  
                  <div className="mb-4 p-3 bg-gray-100 rounded">
                    <p className="text-sm font-semibold mb-2">📊 Upload Status:</p>
                    <p className="text-sm">
                      <span className={pdfProducts.length > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        PDF Invoice: {pdfProducts.length > 0 ? `✅ ${pdfProducts.length} producten` : '❌ Verplicht'}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Descriptions CSV: {csvFile ? '✅ Geladen (optioneel)' : '⭕ Optioneel'} | 
                      Images: {localImages.length > 0 ? `✅ ${localImages.length} images` : '⭕ Nog niet geselecteerd'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Tip: Upload eerst de PDF invoice. De CSV is optioneel en wordt alleen gebruikt om extra beschrijvingen toe te voegen.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        📄 Upload PDF Invoice <span className="text-red-500">*</span> (Verplicht)
                      </label>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handlePdfUpload}
                        disabled={loading}
                        className="block w-full text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-white dark:bg-gray-700 focus:outline-none disabled:opacity-50"
                      />
                      {pdfProducts.length > 0 && (
                        <p className="mt-2 text-sm text-green-600">✅ {pdfFile?.name} - {pdfProducts.length} producten geparsed</p>
                      )}
                      {loading && (
                        <p className="mt-2 text-sm text-blue-600">⏳ PDF wordt verwerkt...</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        📋 Upload PRODUCT DESCRIPTIONS.csv (Optioneel)
                      </label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvUpload}
                        className="block w-full text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-white dark:bg-gray-700 focus:outline-none"
                      />
                      {csvFile && (
                        <p className="mt-2 text-sm text-green-600">✅ {csvFile.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        📁 Selecteer Images (meerdere folders mogelijk)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImagesUpload}
                        className="block w-full text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-white dark:bg-gray-700 focus:outline-none"
                      />
                      {localImages.length > 0 && (
                        <p className="mt-2 text-sm text-green-600">✅ {localImages.length} images geselecteerd</p>
                      )}
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-900 dark:text-blue-300 mb-2">
                        <strong>📋 Image naam formaat:</strong>
                      </p>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 list-disc ml-5 space-y-1">
                        <li><code>MW20J01-ARTISTS BLUE-2.jpg</code> → Style: MW20J01, Colour: ARTISTS BLUE</li>
                        <li><code>WK20J46-VIOLET.jpg</code> → Style: WK20J46, Colour: VIOLET</li>
                        <li><code>MW20J04-PILLERRED:ECRU.jpg</code> → Style: MW20J04, Colour: PILLERRED:ECRU</li>
                      </ul>
                    </div>

                    <button
                      onClick={parseCSVAndMatchImages}
                      disabled={pdfProducts.length === 0 || localImages.length === 0 || loading}
                      className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                    >
                      {loading ? '⏳ Bezig met matchen...' : '🔍 Match Images met Producten'}
                    </button>
                    {pdfProducts.length === 0 && (
                      <p className="text-xs text-red-600 mt-2">
                        ⚠️ Upload eerst de PDF invoice om door te gaan
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stap 2: Review & Upload</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setProductFilter('all')}
                      className={`px-4 py-2 rounded ${productFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                      Alles ({productsWithImages.length})
                    </button>
                    <button
                      onClick={() => setProductFilter('found')}
                      className={`px-4 py-2 rounded ${productFilter === 'found' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                      Gevonden ({productsWithImages.filter(p => p.foundInOdoo).length})
                    </button>
                    <button
                      onClick={() => setProductFilter('notFound')}
                      className={`px-4 py-2 rounded ${productFilter === 'notFound' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                      Niet Gevonden ({productsWithImages.filter(p => !p.foundInOdoo).length})
                    </button>
                  </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-purple-900 dark:text-purple-300">
                    📸 <strong>{filteredProducts.filter(p => p.imageCount > 0).length}</strong> producten met images | 
                    ✅ <strong>{filteredProducts.filter(p => p.foundInOdoo).length}</strong> gevonden in Odoo | 
                    ❌ <strong>{filteredProducts.filter(p => !p.foundInOdoo).length}</strong> niet gevonden
                  </p>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {filteredProducts.map((product, productIndex) => (
                    <div
                      key={product.productKey}
                      className={`border-2 rounded-lg p-4 ${
                        product.foundInOdoo
                          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">{product.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Style: {product.style} | Colour: {product.colour}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {product.foundInOdoo ? (
                              <span className="text-green-600">✅ Template ID: {product.templateId}</span>
                            ) : (
                              <span className="text-red-600">❌ Niet gevonden in Odoo</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {product.imageCount} images
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {product.images.map((image, imageIndex) => (
                          <div key={imageIndex} className="relative">
                            <img
                              src={URL.createObjectURL(image)}
                              alt={image.name}
                              className="w-full h-24 object-cover rounded border-2 border-gray-300 dark:border-gray-600"
                            />
                            <button
                              onClick={() => removeImageFromProduct(productIndex, imageIndex)}
                              className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                              title="Verwijder afbeelding"
                            >
                              ×
                            </button>
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1">{image.name}</p>
                          </div>
                        ))}
                        {/* Add image button */}
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => addImageToProduct(productIndex, e.target.files, e.target)}
                            className="hidden"
                            id={`add-image-${productIndex}`}
                          />
                          <label
                            htmlFor={`add-image-${productIndex}`}
                            className="w-full h-24 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                            title="Afbeelding toevoegen"
                          >
                            <span className="text-2xl text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400">+</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border rounded hover:bg-gray-100 text-gray-900 font-medium"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={uploadImagesToOdoo}
                    disabled={loading || filteredProducts.filter(p => p.foundInOdoo && p.images.length > 0).length === 0}
                    className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? (
                      <>
                        {uploadProgress && `⏳ Uploading ${uploadProgress.current}/${uploadProgress.total}...`}
                        {!uploadProgress && '⏳ Uploading...'}
                      </>
                    ) : (
                      `🚀 Upload Images (${filteredProducts.filter(p => p.foundInOdoo && p.images.length > 0).reduce((sum, p) => sum + p.images.length, 0)} images)`
                    )}
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stap 3: Upload Resultaten</h2>
                
                <div className="space-y-2">
                  {uploadResults.map((result) => (
                    <div
                      key={result.productKey}
                      className={`p-4 rounded-lg ${
                        result.success
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {result.success ? '✅' : '❌'} {result.productKey}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {result.success
                          ? `${result.imagesUploaded} images geüpload`
                          : `Fout: ${result.error}`}
                      </p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setCurrentStep(1);
                    setProductsWithImages([]);
                    setUploadResults([]);
                    setPdfFile(null);
                    setPdfProducts([]);
                    setCsvFile(null);
                    setLocalImages([]);
                  }}
                  className="w-full px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-medium"
                >
                  🔄 Nieuwe Upload
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
