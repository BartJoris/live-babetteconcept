import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface ExistingImage {
  id: number;
  name: string;
  sequence: number;
  image_1920: string; // base64 image data
}

interface ProductWithImages {
  productReference: string;
  colorName: string;
  name: string;
  templateId: number | null;
  foundInOdoo: boolean;
  images: File[];
  imageCount: number;
  existingImages: ExistingImage[]; // Images already in Odoo
  existingImageCount: number;
}

interface UploadResult {
  productReference: string;
  colorName: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

export default function TheNewSocietyImagesImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imagesFolder, setImagesFolder] = useState<File[]>([]);
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
    setImagesFolder(files);
    console.log(`📁 Selected ${files.length} images`);
  };

  const parseCSVAndMatchImages = async () => {
    if (!csvFile || imagesFolder.length === 0) {
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

      // The New Society CSV uses semicolons
      // Headers are on the first line
      const headers = lines[0].split(';').map(h => h.trim());
      
      // Try to find the correct column names (support both formats)
      const productReferenceIdx = headers.findIndex(h => 
        h.toUpperCase() === 'PRODUCT REFERENCE' || h.toUpperCase() === 'REFERENCIA'
      );
      const colorNameIdx = headers.findIndex(h => 
        h.toUpperCase() === 'COLOR NAME' || h.toUpperCase() === 'VARIANTE'
      );
      const productNameIdx = headers.findIndex(h => 
        h.toUpperCase() === 'PRODUCT NAME' || h.toUpperCase() === 'ESTILO'
      );
      
      if (productReferenceIdx === -1) {
        alert('CSV mist verplichte kolom: Product reference (of REFERENCIA)');
        setLoading(false);
        return;
      }

      if (colorNameIdx === -1) {
        alert('CSV mist verplichte kolom: Color name (of VARIANTE)');
        setLoading(false);
        return;
      }

      // Extract unique product references with colors
      const productMap = new Map<string, { reference: string; color: string; name: string }>();
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(v => v.trim());
        if (values.length < headers.length) continue;
        
        const reference = values[productReferenceIdx] || '';
        const color = values[colorNameIdx] || '';
        const productName = productNameIdx >= 0 ? (values[productNameIdx] || '') : '';
        
        if (reference && color) {
          const key = `${reference}-${color}`;
          if (!productMap.has(key)) {
            productMap.set(key, {
              reference,
              color,
              name: productName || reference,
            });
          }
        }
      }

      console.log(`📦 Found ${productMap.size} unique product-color combinations in CSV`);

      // Match images with products
      // Image format: "s26ahb1p362-pink_lavander_bow-1-3dc260.jpg"
      // Pattern: {reference_lowercase}-{color_lowercase_with_underscores}-{number}-{hash}.jpg
      const imagesMap = new Map<string, File[]>();
      
      imagesFolder.forEach(file => {
        const filenameWithoutExt = file.name.replace(/\.[^.]+$/, '').toLowerCase();
        // Match pattern: {reference}-{color}-{number}-{hash}
        const match = filenameWithoutExt.match(/^([a-z0-9]+)-(.+?)-(\d+)-[a-f0-9]+$/);
        
        if (match) {
          const referenceLower = match[1]; // e.g., "s26ahb1p362"
          const colorLower = match[2]; // e.g., "pink_lavander_bow"
          
          // Convert reference to uppercase: "S26AHB1P362"
          const productReference = referenceLower.toUpperCase();
          
          // Convert color to title case: "Pink Lavander Bow"
          const colorName = colorLower
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          const key = `${productReference}-${colorName}`;
          
          // Check if this product exists in CSV
          if (productMap.has(key)) {
            if (!imagesMap.has(key)) {
              imagesMap.set(key, []);
            }
            imagesMap.get(key)!.push(file);
          } else {
            console.log(`⚠️ Image not matched: ${file.name} (key: ${key})`);
          }
        } else {
          console.log(`❌ Image format not recognized: ${file.name}`);
        }
      });

      console.log(`📸 Matched images for ${imagesMap.size} product-color combinations`);

      // Fetch products from Odoo
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        alert('⚠️ Odoo credentials niet gevonden. Log eerst in.');
        setLoading(false);
        return;
      }

      const products: ProductWithImages[] = [];
      
      for (const [key, productData] of productMap.entries()) {
        const images = imagesMap.get(key) || [];
        
        // Sort images by sequence number from filename
        const sortImages = (files: File[]) => {
          return [...files].sort((a, b) => {
            const aMatch = a.name.match(/-(\d+)-[a-f0-9]+\./i);
            const bMatch = b.name.match(/-(\d+)-[a-f0-9]+\./i);
            if (aMatch && bMatch) {
              return parseInt(aMatch[1]) - parseInt(bMatch[1]);
            }
            return a.name.localeCompare(b.name);
          });
        };

        // Search for product in Odoo by reference
        // Try multiple strategies: first by reference-color combination, then by reference only
        try {
          let searchResponse = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.template',
              method: 'search_read',
              args: [[
                ['default_code', '=', key],
                ['active', '=', true]
              ]],
              kwargs: {
                fields: ['id', 'name', 'default_code', 'description'],
                limit: 1,
              },
              uid,
              password,
            }),
          });

          let searchData = await searchResponse.json();
          
          // If not found, try searching by reference only (without color)
          if (!searchData.success || !searchData.result || searchData.result.length === 0) {
            console.log(`⚠️ Product not found with key "${key}", trying reference only: "${productData.reference}"`);
            
            // Try searching by reference in default_code
            searchResponse = await fetch('/api/odoo-call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'product.template',
                method: 'search_read',
                args: [[
                  ['default_code', '=', productData.reference],
                  ['active', '=', true]
                ]],
                kwargs: {
                  fields: ['id', 'name', 'default_code', 'description'],
                  limit: 1,
                },
                uid,
                password,
              }),
            });

            searchData = await searchResponse.json();
            
            // If still not found, try searching in description field (where reference is stored)
            if (!searchData.success || !searchData.result || searchData.result.length === 0) {
              console.log(`⚠️ Product not found with default_code "${productData.reference}", trying description field...`);
              
              searchResponse = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'product.template',
                  method: 'search_read',
                  args: [[
                    ['description', '=', productData.reference],
                    ['active', '=', true]
                  ]],
                  kwargs: {
                    fields: ['id', 'name', 'default_code', 'description'],
                    limit: 1,
                  },
                  uid,
                  password,
                }),
              });

              searchData = await searchResponse.json();
              
              // Last try: search if reference is part of description (for "reference|productName" format)
              if (!searchData.success || !searchData.result || searchData.result.length === 0) {
                console.log(`⚠️ Product not found with description "${productData.reference}", trying partial match...`);
                
                searchResponse = await fetch('/api/odoo-call', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: 'product.template',
                    method: 'search_read',
                    args: [[
                      ['description', 'ilike', `%${productData.reference}%`],
                      ['active', '=', true]
                    ]],
                    kwargs: {
                      fields: ['id', 'name', 'default_code', 'description'],
                      limit: 1,
                    },
                    uid,
                    password,
                  }),
                });

                searchData = await searchResponse.json();
              }
            }
          }
          
          if (searchData.success && searchData.result && searchData.result.length > 0) {
            const product = searchData.result[0];
            
            // Fetch existing images from Odoo for this product
            let existingImages: ExistingImage[] = [];
            try {
              const existingImagesResponse = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'product.image',
                  method: 'search_read',
                  args: [[['product_tmpl_id', '=', product.id]]],
                  kwargs: {
                    fields: ['id', 'name', 'sequence', 'image_1920'],
                    order: 'sequence asc',
                  },
                  uid,
                  password,
                }),
              });

              const existingImagesData = await existingImagesResponse.json();
              if (existingImagesData.success && existingImagesData.result) {
                existingImages = existingImagesData.result.map((img: any) => ({
                  id: img.id,
                  name: img.name || `Image ${img.sequence}`,
                  sequence: img.sequence || 0,
                  image_1920: img.image_1920 || '',
                }));
              }
            } catch (error) {
              console.error(`Error fetching existing images for product ${product.id}:`, error);
            }
            
            products.push({
              productReference: productData.reference,
              colorName: productData.color,
              name: product.name || productData.name,
              templateId: product.id,
              foundInOdoo: true,
              images: sortImages(images),
              imageCount: images.length,
              existingImages,
              existingImageCount: existingImages.length,
            });
          } else {
            products.push({
              productReference: productData.reference,
              colorName: productData.color,
              name: productData.name,
              templateId: null,
              foundInOdoo: false,
              images: sortImages(images),
              imageCount: images.length,
              existingImages: [],
              existingImageCount: 0,
            });
          }
        } catch (error) {
          console.error(`Error searching for product ${key}:`, error);
          products.push({
            productReference: productData.reference,
            colorName: productData.color,
            name: productData.name,
            templateId: null,
            foundInOdoo: false,
            images: sortImages(images),
            imageCount: images.length,
            existingImages: [],
            existingImageCount: 0,
          });
        }
      }

      setProductsWithImages(products);
      setCurrentStep(2);
      setLoading(false);
      
      const foundCount = products.filter(p => p.foundInOdoo).length;
      alert(`✅ ${products.length} producten gevonden\n${foundCount} gevonden in Odoo\n${products.length - foundCount} niet gevonden in Odoo`);
    } catch (error) {
      console.error('Error parsing CSV and matching images:', error);
      alert(`❌ Fout: ${(error as Error).message}`);
      setLoading(false);
    }
  };

  const uploadImages = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('⚠️ Odoo credentials niet gevonden. Log eerst in.');
      return;
    }

    const productsToUpload = productsWithImages.filter(p => p.foundInOdoo && p.imageCount > 0);
    
    if (productsToUpload.length === 0) {
      alert('⚠️ Geen producten met images gevonden om te uploaden');
      return;
    }

    setLoading(true);

    try {
      // Prepare images for upload
      const allImages: Array<{ base64: string; filename: string; productReference: string; colorName: string }> = [];
      const productKeyToTemplateId: Record<string, number> = {};

      for (const product of productsToUpload) {
        if (!product.templateId) continue;
        
        const productKey = `${product.productReference}-${product.colorName}`;
        productKeyToTemplateId[productKey] = product.templateId;

        // Add all images
        for (const file of product.images) {
          const base64 = await fileToBase64(file);
          allImages.push({
            base64,
            filename: file.name,
            productReference: product.productReference,
            colorName: product.colorName,
          });
        }
      }

      console.log(`📤 Uploading ${allImages.length} images...`);

      // Upload in batches to avoid payload size limits
      const BATCH_SIZE = 2; // Process 2 images per request to avoid limits
      const batches: typeof allImages[] = [];
      
      for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
        batches.push(allImages.slice(i, i + BATCH_SIZE));
      }

      console.log(`📦 Split into ${batches.length} batch(es) of max ${BATCH_SIZE} images`);

      const results: UploadResult[] = [];
      let totalUploaded = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setUploadProgress({ current: batchIndex * BATCH_SIZE, total: allImages.length });
        
        console.log(`🌿 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images...`);

        const response = await fetch('/api/thenewsociety-upload-images', {
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
            const existingResult = results.find(r => r.productReference === img.productReference && r.colorName === img.colorName);
            if (existingResult) {
              existingResult.success = false;
              existingResult.error = `Batch ${batchIndex + 1} upload failed`;
            } else {
              results.push({
                productReference: img.productReference,
                colorName: img.colorName,
                success: false,
                imagesUploaded: 0,
                error: `Batch ${batchIndex + 1} upload failed`,
              });
            }
          }
          continue;
        }

        const data = await response.json();

        if (data.success) {
          console.log(`✅ Batch ${batchIndex + 1} complete: ${data.imagesUploaded || 0}/${batch.length} uploaded`);
          totalUploaded += data.imagesUploaded || 0;
          
          // Group results by product reference and color
          const resultsByProduct: Record<string, number> = {};
          
          for (const result of data.results || []) {
            if (result.success) {
              const key = `${result.productReference}-${result.colorName}`;
              if (!resultsByProduct[key]) {
                resultsByProduct[key] = 0;
              }
              resultsByProduct[key]++;
            }
          }

          // Add to results
          for (const [key, count] of Object.entries(resultsByProduct)) {
            const [productReference, colorName] = key.split('-');
            const existingResult = results.find(r => r.productReference === productReference && r.colorName === colorName);
            if (existingResult) {
              existingResult.imagesUploaded += count;
            } else {
              results.push({
                productReference,
                colorName,
                success: true,
                imagesUploaded: count,
              });
            }
          }
        } else {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, data.error);
          for (const img of batch) {
            const existingResult = results.find(r => r.productReference === img.productReference && r.colorName === img.colorName);
            if (existingResult) {
              existingResult.success = false;
              existingResult.error = data.error || 'Unknown error';
            } else {
              results.push({
                productReference: img.productReference,
                colorName: img.colorName,
                success: false,
                imagesUploaded: 0,
                error: data.error || 'Unknown error',
              });
            }
          }
        }
      }

      console.log(`🎉 Total uploaded: ${totalUploaded}/${allImages.length} images`);

      setUploadResults(results);
      setCurrentStep(3);
      setLoading(false);
      setUploadProgress(null);

      alert(`✅ Upload voltooid!\n${totalUploaded}/${allImages.length} images geüpload`);
    } catch (error) {
      console.error('Error uploading images:', error);
      alert(`❌ Fout bij uploaden: ${(error as Error).message}`);
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  const refreshExistingImages = async (productIndex: number) => {
    const product = productsWithImages[productIndex];
    if (!product.foundInOdoo || !product.templateId) return;

    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('⚠️ Odoo credentials niet gevonden. Log eerst in.');
      return;
    }

    try {
      const existingImagesResponse = await fetch('/api/odoo-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'product.image',
          method: 'search_read',
          args: [[['product_tmpl_id', '=', product.templateId]]],
          kwargs: {
            fields: ['id', 'name', 'sequence', 'image_1920'],
            order: 'sequence asc',
          },
          uid,
          password,
        }),
      });

      const existingImagesData = await existingImagesResponse.json();
      if (existingImagesData.success && existingImagesData.result) {
        const existingImages = existingImagesData.result.map((img: any) => ({
          id: img.id,
          name: img.name || `Image ${img.sequence}`,
          sequence: img.sequence || 0,
          image_1920: img.image_1920 || '',
        }));

        const newProducts = [...productsWithImages];
        newProducts[productIndex].existingImages = existingImages;
        newProducts[productIndex].existingImageCount = existingImages.length;
        setProductsWithImages(newProducts);
      }
    } catch (error) {
      console.error(`Error refreshing existing images for product ${product.templateId}:`, error);
      alert('❌ Fout bij verversen van bestaande images');
    }
  };

  const filteredProducts = productsWithImages.filter(product => {
    if (productFilter === 'found') return product.foundInOdoo;
    if (productFilter === 'notFound') return !product.foundInOdoo;
    return true;
  });

  return (
    <>
      <Head>
        <title>The New Society - Afbeeldingen Importeren</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                🌿 The New Society - Afbeeldingen Importeren
              </h1>
              <Link
                href="/product-import"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ← Terug naar Import
              </Link>
            </div>

            {/* Step 1: Upload CSV and Images */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    1️⃣ Upload CSV Bestand
                  </h2>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300"
                  />
                  {csvFile && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      ✓ {csvFile.name}
                    </p>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    2️⃣ Upload Images
                  </h2>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagesUpload}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:file:bg-green-900 dark:file:text-green-300"
                  />
                  {imagesFolder.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      ✓ {imagesFolder.length} images geselecteerd
                    </p>
                  )}
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      <strong>💡 Image formaat:</strong> s26ahb1p362-pink_lavander_bow-1-3dc260.jpg
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Pattern: {`{reference}-{color_with_underscores}-{number}-{hash}.jpg`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={parseCSVAndMatchImages}
                  disabled={loading || !csvFile || imagesFolder.length === 0}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold"
                >
                  {loading ? '⏳ Verwerken...' : '🔍 Parseer CSV en Match Images'}
                </button>
              </div>
            )}

            {/* Step 2: Review Products */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    2️⃣ Review Producten
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setProductFilter('all')}
                      className={`px-3 py-1 rounded ${productFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                    >
                      Alle ({productsWithImages.length})
                    </button>
                    <button
                      onClick={() => setProductFilter('found')}
                      className={`px-3 py-1 rounded ${productFilter === 'found' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                    >
                      Gevonden ({productsWithImages.filter(p => p.foundInOdoo).length})
                    </button>
                    <button
                      onClick={() => setProductFilter('notFound')}
                      className={`px-3 py-1 rounded ${productFilter === 'notFound' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                    >
                      Niet Gevonden ({productsWithImages.filter(p => !p.foundInOdoo).length})
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {filteredProducts.map((product, productIndex) => (
                    <div
                      key={`${product.productReference}-${product.colorName}`}
                      className={`p-4 rounded-lg border-2 ${
                        product.foundInOdoo
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">
                            {product.productReference} - {product.colorName}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {product.name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {product.foundInOdoo ? (
                              <span className="text-green-600">✅ Gevonden in Odoo - Template ID: {product.templateId}</span>
                            ) : (
                              <span className="text-red-600">❌ Niet gevonden in Odoo</span>
                            )}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            📸 {product.imageCount} nieuwe images | 🖼️ {product.existingImageCount} bestaande images in Odoo
                          </p>
                        </div>
                        {product.foundInOdoo && product.templateId && (
                          <a
                            href={`${process.env.NEXT_PUBLIC_ODOO_URL || 'https://www.babetteconcept.be'}/web#id=${product.templateId}&model=product.template&view_type=form`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                          >
                            Bekijk in Odoo
                          </a>
                        )}
                      </div>

                      {/* Existing Images from Odoo */}
                      {product.foundInOdoo && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              🖼️ Bestaande Images in Odoo ({product.existingImageCount})
                            </h4>
                            <button
                              onClick={() => refreshExistingImages(productIndex)}
                              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                              title="Ververs bestaande images"
                            >
                              🔄 Ververs
                            </button>
                          </div>
                          {product.existingImages.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                              {product.existingImages.map((existingImg) => (
                                <div key={existingImg.id} className="relative">
                                  <img
                                    src={`data:image/jpeg;base64,${existingImg.image_1920}`}
                                    alt={existingImg.name}
                                    className="w-full h-24 object-cover rounded border-2 border-blue-400 dark:border-blue-500"
                                  />
                                  <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs px-1 rounded-br">
                                    #{existingImg.sequence}
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1" title={existingImg.name}>
                                    {existingImg.name}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                              Geen bestaande images gevonden in Odoo
                            </p>
                          )}
                        </div>
                      )}

                      {/* New Images to Upload */}
                      {product.images.length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            📸 Nieuwe Images om te Uploaden ({product.imageCount})
                          </h4>
                          <div className="grid grid-cols-4 gap-2">
                            {product.images.map((image, imageIndex) => (
                              <div key={imageIndex} className="relative">
                                <img
                                  src={URL.createObjectURL(image)}
                                  alt={image.name}
                                  className="w-full h-24 object-cover rounded border-2 border-green-400 dark:border-green-500"
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
                                className="w-full h-24 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Images toevoegen"
                              >
                                <span className="text-2xl text-gray-400 dark:text-gray-500 hover:text-green-500 dark:hover:text-green-400">+</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Add button if no new images yet */}
                      {product.images.length === 0 && (
                        <div className="flex gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => addImageToProduct(productIndex, e.target.files, e.target)}
                            className="hidden"
                            id={`add-image-empty-${productIndex}`}
                          />
                          <label
                            htmlFor={`add-image-empty-${productIndex}`}
                            className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm cursor-pointer"
                          >
                            📸 Nieuwe Images Toevoegen
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border rounded hover:bg-gray-100 text-gray-900 font-medium"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={uploadImages}
                    disabled={loading || filteredProducts.filter(p => p.foundInOdoo && p.imageCount > 0).length === 0}
                    className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? (
                      <>
                        {uploadProgress && `⏳ Uploading ${uploadProgress.current}/${uploadProgress.total}...`}
                        {!uploadProgress && '⏳ Uploading...'}
                      </>
                    ) : (
                      `🚀 Upload Images (${filteredProducts.filter(p => p.foundInOdoo && p.imageCount > 0).reduce((sum, p) => sum + p.imageCount, 0)} images)`
                    )}
                  </button>
                </div>

                {uploadProgress && (
                  <div className="mt-4">
                    <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                      {uploadProgress.current} van {uploadProgress.total} images
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Upload Results */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  3️⃣ Upload Resultaten
                </h2>

                <div className="space-y-4">
                  {uploadResults.map((result, idx) => (
                    <div
                      key={`${result.productReference}-${result.colorName}-${idx}`}
                      className={`p-4 rounded-lg border-2 ${
                        result.success
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">
                        {result.productReference} - {result.colorName}
                      </h3>
                      {result.success ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          ✅ {result.imagesUploaded} images geüpload
                        </p>
                      ) : (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          ❌ {result.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setCurrentStep(1);
                    setProductsWithImages([]);
                    setUploadResults([]);
                    setCsvFile(null);
                    setImagesFolder([]);
                  }}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  🔄 Nieuwe Import Starten
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
