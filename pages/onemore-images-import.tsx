import { useState } from 'react';
import Head from 'next/head';

interface ProductWithImages {
  productReference: string;
  color: string;
  description: string;
  templateId: number | null;
  name: string;
  foundInOdoo: boolean;
  images: File[];
  imageCount: number;
  productKey: string; // Format: "productReference-color"
}

interface UploadResult {
  productKey: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

export default function OnemoreImagesImport() {
  const [currentStep, setCurrentStep] = useState(1);
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

  const parseCSVAndMatchImages = async () => {
    if (!csvFile || localImages.length === 0) {
      alert('Upload eerst CSV bestand en selecteer images');
      return;
    }

    setLoading(true);
    try {
      // Parse CSV to extract products
      const csvText = await csvFile.text();
      const lines = csvText.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        alert('CSV bestand is leeg of ongeldig');
        setLoading(false);
        return;
      }

      const headers = lines[0].split(';').map(h => h.trim());
      const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
      const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name'); // Used in image filenames (e.g., "26s063")
      const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
      const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
      
      if (productReferenceIdx === -1 || descriptionIdx === -1 || colorNameIdx === -1) {
        alert('CSV mist verplichte kolommen: Product reference, Description, of Color name');
        setLoading(false);
        return;
      }

      // Group products by Product reference + Color name
      // Store both productReference (EGAS) and productName (26s063) for matching
      const productsMap = new Map<string, { 
        productReference: string; // e.g., "EGAS" 
        productName: string; // e.g., "26s063" (used in image filenames)
        color: string; 
        description: string;
        normalizedReference: string; // e.g., "egas-blossom" (as stored in Odoo description)
      }>();
      
      // Normalize function to match product-import.tsx format
      const normalizeProductKey = (ref: string, color: string): string => {
        return `${ref}-${color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      };
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(v => v.trim());
        if (values.length < headers.length) continue;
        
        const productReference = values[productReferenceIdx] || '';
        const productName = productNameIdx >= 0 ? (values[productNameIdx] || '') : '';
        const color = values[colorNameIdx] || '';
        const description = values[descriptionIdx] || '';
        
        if (!productReference || !color) continue;
        
        // Use productReference for the key (as stored in Odoo)
        const productKey = normalizeProductKey(productReference, color);
        if (!productsMap.has(productKey)) {
          productsMap.set(productKey, { 
            productReference, 
            productName, // Store productName for image matching
            color, 
            description,
            normalizedReference: productKey, // This is what's stored in Odoo description field
          });
        }
      }

      console.log(`📦 Found ${productsMap.size} unique products in CSV`);

      // Match images with products
      // Image format: "26s179-green-1-476f31.png" or "26s195-off_white-1-e37a9b.png"
      // Pattern: {ProductReference}-{Color}-{Number}-{hash}.{ext}
      const imageMap = new Map<string, File[]>();
      
      // Normalize color names for matching (handle kebab-case, underscores, etc.)
      const normalizeColor = (color: string): string => {
        return color.toLowerCase().replace(/[_-]/g, '-').trim();
      };
      
      localImages.forEach(file => {
        const filename = file.name.toLowerCase();
        // Match pattern: {ProductName}-{Color}-{Number}-{hash}
        // Image filenames use "Product name" (e.g., "26s063"), not "Product reference" (e.g., "EGAS")
        // Handle both "-" and "_" as separators
        // Improved regex: matches ProductName, then Color (which can contain - or _), then Number, then hash
        // Example: "26s063-blossom-1-d61e62.png" -> name: "26s063", color: "blossom", number: "1"
        // Example: "26s063-misty_blue-1-a1cf54.png" -> name: "26s063", color: "misty_blue", number: "1"
        // Example: "26s063-pastel_yellow-1-e355c9.png" -> name: "26s063", color: "pastel_yellow", number: "1"
        const match = filename.match(/^([^-_]+)[-_](.+?)[-_](\d+)[-_]/);
        if (match) {
          const productNameFromFilename = match[1].toLowerCase(); // e.g., "26s063"
          const colorFromFilename = normalizeColor(match[2]); // e.g., "blossom", "misty-blue", or "pastel-yellow"
          
          // Try to match with products
          // First try matching by productName (used in image filenames) from CSV
          let matchedProductKey: string | null = null;
          
          for (const [productKey, product] of productsMap) {
            const productNameLower = (product.productName || '').toLowerCase();
            const productColorNormalized = normalizeColor(product.color);
            
            // Match by productName (from CSV/image) and color
            if (productNameLower === productNameFromFilename && productColorNormalized === colorFromFilename) {
              matchedProductKey = productKey;
              console.log(`  ✅ Image matched by CSV productName: ${file.name} → ${productKey} (${product.productReference}-${product.color})`);
              break;
            }
          }
          
          // Fallback: try matching by productReference if productName didn't match
          if (!matchedProductKey) {
            const normalizedProductKey = normalizeProductKey(productNameFromFilename, colorFromFilename);
            if (productsMap.has(normalizedProductKey)) {
              matchedProductKey = normalizedProductKey;
              console.log(`  ✅ Image matched by normalized key: ${file.name} → ${matchedProductKey}`);
            } else {
              // Last resort: try matching by comparing productReference
              for (const [productKey, product] of productsMap) {
                const productRefLower = product.productReference.toLowerCase();
                const productColorNormalized = normalizeColor(product.color);
                
                if (productRefLower === productNameFromFilename && productColorNormalized === colorFromFilename) {
                  matchedProductKey = productKey;
                  console.log(`  ✅ Image matched by productReference: ${file.name} → ${productKey}`);
                  break;
                }
              }
            }
          }
          
          if (matchedProductKey) {
            if (!imageMap.has(matchedProductKey)) {
              imageMap.set(matchedProductKey, []);
            }
            imageMap.get(matchedProductKey)!.push(file);
            console.log(`  📸 Added image ${file.name} to product ${matchedProductKey}`);
          } else {
            console.log(`  ⚠️ Image not matched with product: ${file.name} (name: ${productNameFromFilename}, color: ${colorFromFilename})`);
            console.log(`     Available products:`, Array.from(productsMap.entries()).map(([key, p]) => `${key} (name: ${p.productName}, color: ${p.color})`));
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

      // Search for products in Odoo by reference
      // Also fetch description to extract productName for image matching
      const matched: ProductWithImages[] = [];
      
      // Helper function to extract productName from Odoo description
      // Format: "reference|productName" (e.g., "egas-pastel-yellow|26s063")
      const extractProductNameFromDescription = (description: string | null | undefined): string | null => {
        if (!description) return null;
        const parts = description.split('|');
        return parts.length > 1 ? parts[1].trim() : null;
      };
      
      for (const [productKey, product] of productsMap) {
        const images = imageMap.get(productKey) || [];
        
        // Search for product in Odoo by reference
        // Product reference format in Odoo: normalized "${productReference}-${color}|${productName}" stored in description field
        // Example: "egas-pastel-yellow|26s063"
        let templateId: number | null = null;
        let foundInOdoo = false;
        let searchMethod = '';
        let odooProductName: string | null = null; // ProductName extracted from Odoo description
        
        try {
          // Strategy 1: Search with the normalized productKey (productReference-color) - this is stored in description field
          const normalizedReference = product.normalizedReference; // e.g., "egas-blossom"
          console.log(`🔍 Searching for product: ${normalizedReference} (from ${product.productReference}-${product.color})`);
          
          // First, try to get the product with description field to extract productName
          const searchResponse = await fetch('/api/search-product-by-reference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: normalizedReference,
              uid,
              password,
              includeDescription: true, // Request description field
            }),
          });
          
          const searchData = await searchResponse.json();
          
          if (searchData.success && searchData.found) {
            templateId = searchData.templateId;
            foundInOdoo = true;
            searchMethod = searchData.matchedField || 'unknown';
            
            // Extract productName from description if available
            if (searchData.description) {
              odooProductName = extractProductNameFromDescription(searchData.description);
              console.log(`✅ Found product ${normalizedReference} in Odoo via ${searchMethod}: Template ID ${templateId}, ProductName: ${odooProductName || 'not found'}`);
            } else {
              console.log(`✅ Found product ${normalizedReference} in Odoo via ${searchMethod}: Template ID ${templateId}`);
            }
          } else {
            // Strategy 2: Try searching with productName (used in image filenames, e.g., "26s063")
            if (product.productName) {
              console.log(`🔍 Trying fallback search with productName: ${product.productName}`);
              const fallbackResponse = await fetch('/api/search-product-by-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: product.productName,
                  uid,
                  password,
                }),
              });
              
              const fallbackData = await fallbackResponse.json();
              if (fallbackData.success && fallbackData.found) {
                templateId = fallbackData.templateId;
                foundInOdoo = true;
                searchMethod = fallbackData.matchedField || 'productName';
                console.log(`✅ Found product ${product.productName} (fallback) in Odoo via ${searchMethod}: Template ID ${templateId}`);
              } else {
                // Strategy 3: Try searching with just the productReference (without color)
                console.log(`🔍 Trying fallback search with productReference: ${product.productReference}`);
                const fallback2Response = await fetch('/api/search-product-by-reference', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    reference: product.productReference,
                    uid,
                    password,
                  }),
                });
                
                const fallback2Data = await fallback2Response.json();
                if (fallback2Data.success && fallback2Data.found) {
                  templateId = fallback2Data.templateId;
                  foundInOdoo = true;
                  searchMethod = fallback2Data.matchedField || 'productReference';
                  console.log(`✅ Found product ${product.productReference} (fallback2) in Odoo via ${searchMethod}: Template ID ${templateId}`);
                } else {
                  console.log(`❌ Product not found: ${normalizedReference} (tried: ${normalizedReference}, ${product.productName}, ${product.productReference})`);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error searching for product ${product.productReference}:`, error);
        }

        // If product was found in Odoo but images weren't matched by CSV productName,
        // try matching images using productName from Odoo description
        let finalImages = images;
        if (foundInOdoo && odooProductName && images.length === 0) {
          console.log(`  🔄 Trying to match images using Odoo productName: ${odooProductName}`);
          // Re-match images using productName from Odoo
          const reMatchedImages: File[] = [];
          localImages.forEach(file => {
            const filename = file.name.toLowerCase();
            const match = filename.match(/^([^-_]+)[-_](.+?)[-_](\d+)[-_]/);
            if (match) {
              const productNameFromFilename = match[1].toLowerCase();
              const colorFromFilename = normalizeColor(match[2]);
              const productColorNormalized = normalizeColor(product.color);
              
              if (productNameFromFilename === odooProductName.toLowerCase() && 
                  colorFromFilename === productColorNormalized) {
                reMatchedImages.push(file);
                console.log(`    ✅ Re-matched image: ${file.name}`);
              }
            }
          });
          
          if (reMatchedImages.length > 0) {
            finalImages = reMatchedImages;
            console.log(`  ✅ Re-matched ${reMatchedImages.length} images using Odoo productName`);
          }
        }
        
        matched.push({
          productReference: product.productReference,
          color: product.color,
          description: product.description,
          templateId,
          name: `1+ in the family - ${product.description} - ${product.color}`,
          foundInOdoo,
          images: finalImages,
          imageCount: finalImages.length,
          productKey,
        });
        
        if (foundInOdoo) {
          console.log(`  📦 Product ${productKey}: ${finalImages.length} images matched, Template ID: ${templateId} (found via ${searchMethod || 'unknown'}, Odoo productName: ${odooProductName || 'N/A'})`);
        } else {
          console.log(`  ⚠️ Product ${productKey}: ${finalImages.length} images matched, but NOT found in Odoo`);
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
    
    // Reset the input so the same file can be selected again if needed
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
              // Remove data:image/...;base64, prefix
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

      console.log(`👶 Preparing to upload ${imagesToUpload.length} images...`);

      // Upload images in batches to avoid exceeding request/response size limits
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
        console.log(`👶 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images (~${(batchSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        setUploadProgress({ current: batchIndex * BATCH_SIZE, total: imagesToUpload.length });
        
        // Upload batch
        const response = await fetch('/api/onemore-upload-images', {
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
          let errorText = '';
          try {
            errorText = await response.text();
            console.error(`❌ Batch ${batchIndex + 1} failed with status ${response.status}:`, errorText.substring(0, 200));
          } catch (textError) {
            console.error(`❌ Batch ${batchIndex + 1} failed with status ${response.status}: Could not read error text`);
          }
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

        let data;
        try {
          const responseText = await response.text();
          // Check if response is truncated (common sign: ends with "Body excee..." or similar)
          if (responseText.length > 0 && !responseText.trim().endsWith('}')) {
            console.warn(`⚠️ Batch ${batchIndex + 1} response may be truncated (length: ${responseText.length})`);
            // Try to parse what we have, but handle gracefully
            try {
              data = JSON.parse(responseText);
            } catch (parseError) {
              console.error(`❌ Batch ${batchIndex + 1} JSON parse failed:`, parseError);
              // Assume partial success - mark all as failed
              for (const img of batch) {
                allResults.push({
                  productKey: img.productKey,
                  success: false,
                  error: 'Response body truncated - try uploading fewer images at once',
                });
              }
              continue;
            }
          } else {
            data = JSON.parse(responseText);
          }
        } catch (jsonError) {
          console.error(`❌ Batch ${batchIndex + 1} JSON parse error:`, jsonError);
          // Add failed results for this batch
          for (const img of batch) {
            allResults.push({
              productKey: img.productKey,
              success: false,
              error: `JSON parse error: ${(jsonError as Error).message}`,
            });
          }
          continue;
        }
        
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
          // Handle summary format for large batches
          if (data.summary && data.totalResults > data.results.length) {
            console.log(`📊 Large batch detected: ${data.totalResults} total results, ${data.results.length} returned`);
            // Expand summary into individual results
            (Object.entries(data.summary) as [string, { success: number; failed: number }][]).forEach(([productKey, counts]) => {
              // Add success results
              for (let i = 0; i < counts.success; i++) {
                allResults.push({
                  productKey,
                  success: true,
                });
              }
              // Add failed results
              for (let i = 0; i < counts.failed; i++) {
                allResults.push({
                  productKey,
                  success: false,
                  error: 'Batch upload (see summary)',
                });
              }
            });
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
        <title>1+ in the family - Image Upload</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              👶 1+ in the family - Image Upload
            </h1>

            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Stap 1: Upload Bestanden</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        📄 Upload CSV Bestand
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

                    <button
                      onClick={parseCSVAndMatchImages}
                      disabled={!csvFile || localImages.length === 0 || loading}
                      className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                    >
                      {loading ? '⏳ Bezig met matchen...' : '🔍 Match Images met Producten'}
                    </button>
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
                      className={`px-4 py-2 rounded ${productFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
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

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
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
                            Reference: {product.productReference} | Color: {product.color}
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
                            className="w-full h-24 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Afbeelding toevoegen"
                          >
                            <span className="text-2xl text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400">+</span>
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
                    setCsvFile(null);
                    setLocalImages([]);
                  }}
                  className="w-full px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
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
