import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface ProductWithImages {
  productReference: string;
  name: string;
  templateId: number | null;
  foundInOdoo: boolean;
  stills: File[];
  looks: File[];
  stillCount: number;
  lookCount: number;
}

interface UploadResult {
  productReference: string;
  success: boolean;
  stillsUploaded: number;
  looksUploaded: number;
  error?: string;
}

export default function WeekendHouseKidsImagesImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [stillsFolder, setStillsFolder] = useState<File[]>([]);
  const [looksFolder, setLooksFolder] = useState<File[]>([]);
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

  const handleStillsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setStillsFolder(files);
    console.log(`📁 Selected ${files.length} still images`);
  };

  const handleLooksUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLooksFolder(files);
    console.log(`📁 Selected ${files.length} look images`);
  };

  const parseCSVAndMatchImages = async () => {
    if (!csvFile || (stillsFolder.length === 0 && looksFolder.length === 0)) {
      alert('Upload eerst CSV bestand en selecteer images (stills en/of looks)');
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
      
      if (productReferenceIdx === -1) {
        alert('CSV mist verplichte kolom: Product reference');
        setLoading(false);
        return;
      }

      // Extract unique product references
      const productReferences = new Set<string>();
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(v => v.trim());
        if (values.length < headers.length) continue;
        
        const productReference = values[productReferenceIdx] || '';
        if (productReference) {
          productReferences.add(productReference);
        }
      }

      console.log(`📦 Found ${productReferences.size} unique product references in CSV`);

      // Match images with products
      // Image format: "26015_1.jpg" or "26015_2.jpg" (reference_number.jpg)
      const stillsMap = new Map<string, File[]>();
      const looksMap = new Map<string, File[]>();
      
      // Process stills
      stillsFolder.forEach(file => {
        const filenameMatch = file.name.match(/^(\d+)_(\d+)\./i);
        if (filenameMatch) {
          const reference = filenameMatch[1];
          if (productReferences.has(reference)) {
            if (!stillsMap.has(reference)) {
              stillsMap.set(reference, []);
            }
            stillsMap.get(reference)!.push(file);
          } else {
            console.log(`⚠️ Still image not matched: ${file.name} (reference: ${reference})`);
          }
        } else {
          console.log(`❌ Still image format not recognized: ${file.name}`);
        }
      });

      // Process looks
      looksFolder.forEach(file => {
        const filenameMatch = file.name.match(/^(\d+)_(\d+)\./i);
        if (filenameMatch) {
          const reference = filenameMatch[1];
          if (productReferences.has(reference)) {
            if (!looksMap.has(reference)) {
              looksMap.set(reference, []);
            }
            looksMap.get(reference)!.push(file);
          } else {
            console.log(`⚠️ Look image not matched: ${file.name} (reference: ${reference})`);
          }
        } else {
          console.log(`❌ Look image format not recognized: ${file.name}`);
        }
      });

      console.log(`📸 Matched stills for ${stillsMap.size} products`);
      console.log(`📸 Matched looks for ${looksMap.size} products`);

      // Fetch products from Odoo
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        alert('⚠️ Odoo credentials niet gevonden. Log eerst in.');
        setLoading(false);
        return;
      }

      const products: ProductWithImages[] = [];
      
      for (const reference of productReferences) {
        const stills = stillsMap.get(reference) || [];
        const looks = looksMap.get(reference) || [];
        
        // Sort images by sequence number
        const sortImages = (files: File[]) => {
          return [...files].sort((a, b) => {
            const aMatch = a.name.match(/^(\d+)_(\d+)\./i);
            const bMatch = b.name.match(/^(\d+)_(\d+)\./i);
            if (aMatch && bMatch) {
              return parseInt(aMatch[2]) - parseInt(bMatch[2]);
            }
            return a.name.localeCompare(b.name);
          });
        };

        // Search for product in Odoo by reference
        try {
          const searchResponse = await fetch('/api/search-product-by-reference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference,
              uid,
              password,
            }),
          });

          const searchData = await searchResponse.json();
          
          if (searchData.success && searchData.found && searchData.templateId) {
            products.push({
              productReference: reference,
              name: searchData.name || reference,
              templateId: searchData.templateId,
              foundInOdoo: true,
              stills: sortImages(stills),
              looks: sortImages(looks),
              stillCount: stills.length,
              lookCount: looks.length,
            });
          } else {
            products.push({
              productReference: reference,
              name: reference,
              templateId: null,
              foundInOdoo: false,
              stills: sortImages(stills),
              looks: sortImages(looks),
              stillCount: stills.length,
              lookCount: looks.length,
            });
          }
        } catch (error) {
          console.error(`Error searching for product ${reference}:`, error);
          products.push({
            productReference: reference,
            name: reference,
            templateId: null,
            foundInOdoo: false,
            stills: sortImages(stills),
            looks: sortImages(looks),
            stillCount: stills.length,
            lookCount: looks.length,
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

    const productsToUpload = productsWithImages.filter(p => p.foundInOdoo && (p.stillCount > 0 || p.lookCount > 0));
    
    if (productsToUpload.length === 0) {
      alert('⚠️ Geen producten met images gevonden om te uploaden');
      return;
    }

    setLoading(true);

    try {
      // Prepare images for upload
      const allImages: Array<{ base64: string; filename: string; productReference: string; isLook: boolean }> = [];
      const productReferenceToTemplateId: Record<string, number> = {};

      for (const product of productsToUpload) {
        if (!product.templateId) continue;
        
        productReferenceToTemplateId[product.productReference] = product.templateId;

        // Add stills first
        for (const file of product.stills) {
          const base64 = await fileToBase64(file);
          allImages.push({
            base64,
            filename: file.name,
            productReference: product.productReference,
            isLook: false,
          });
        }

        // Then add looks
        for (const file of product.looks) {
          const base64 = await fileToBase64(file);
          allImages.push({
            base64,
            filename: file.name,
            productReference: product.productReference,
            isLook: true,
          });
        }
      }

      console.log(`📤 Uploading ${allImages.length} images (${allImages.filter(i => !i.isLook).length} stills, ${allImages.filter(i => i.isLook).length} looks)...`);

      // Upload in batches to avoid payload size limits (like Wynken)
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
        
        console.log(`🏠 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images...`);

        const response = await fetch('/api/weekendhousekids-upload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batch,
            productReferenceToTemplateId,
            odooUid: uid,
            odooPassword: password,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Batch ${batchIndex + 1} failed with status ${response.status}:`, errorText.substring(0, 200));
          // Add failed results for this batch
          for (const img of batch) {
            const existingResult = results.find(r => r.productReference === img.productReference);
            if (existingResult) {
              existingResult.success = false;
              existingResult.error = `Batch ${batchIndex + 1} upload failed`;
            } else {
              results.push({
                productReference: img.productReference,
                success: false,
                stillsUploaded: 0,
                looksUploaded: 0,
                error: `Batch ${batchIndex + 1} upload failed`,
              });
            }
          }
          continue;
        }

        const data = await response.json();

        if (data.success) {
          console.log(`✅ Batch ${batchIndex + 1} complete: ${data.results?.filter((r: any) => r.success).length || 0}/${batch.length} uploaded`);
          totalUploaded += data.results?.filter((r: any) => r.success).length || 0;
          
          // Group results by product reference
          const resultsByProduct: Record<string, { stills: number; looks: number }> = {};
          
          for (const result of data.results || []) {
            if (result.success) {
              const img = batch.find(b => b.filename === result.filename);
              if (img) {
                if (!resultsByProduct[img.productReference]) {
                  resultsByProduct[img.productReference] = { stills: 0, looks: 0 };
                }
                if (img.isLook) {
                  resultsByProduct[img.productReference].looks++;
                } else {
                  resultsByProduct[img.productReference].stills++;
                }
              }
            }
          }

          // Add to results
          for (const [productReference, counts] of Object.entries(resultsByProduct)) {
            const existingResult = results.find(r => r.productReference === productReference);
            if (existingResult) {
              existingResult.stillsUploaded += counts.stills;
              existingResult.looksUploaded += counts.looks;
            } else {
              results.push({
                productReference,
                success: true,
                stillsUploaded: counts.stills,
                looksUploaded: counts.looks,
              });
            }
          }
        } else {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, data.error);
          for (const img of batch) {
            const existingResult = results.find(r => r.productReference === img.productReference);
            if (existingResult) {
              existingResult.success = false;
              existingResult.error = data.error || 'Unknown error';
            } else {
              results.push({
                productReference: img.productReference,
                success: false,
                stillsUploaded: 0,
                looksUploaded: 0,
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

      const totalStills = results.reduce((sum, r) => sum + r.stillsUploaded, 0);
      const totalLooks = results.reduce((sum, r) => sum + r.looksUploaded, 0);
      alert(`✅ Upload voltooid!\n${totalUploaded}/${allImages.length} images geüpload\n${totalStills} stills, ${totalLooks} looks`);
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

  const addImageToProduct = (productIndex: number, files: FileList | null, isLook: boolean, inputElement?: HTMLInputElement) => {
    if (!files || files.length === 0) return;
    const newProducts = [...productsWithImages];
    const newImages = Array.from(files);
    
    if (isLook) {
      newProducts[productIndex].looks = [...newProducts[productIndex].looks, ...newImages];
      newProducts[productIndex].lookCount = newProducts[productIndex].looks.length;
    } else {
      newProducts[productIndex].stills = [...newProducts[productIndex].stills, ...newImages];
      newProducts[productIndex].stillCount = newProducts[productIndex].stills.length;
    }
    
    setProductsWithImages(newProducts);
    
    if (inputElement) {
      inputElement.value = '';
    }
  };

  const removeImageFromProduct = (productIndex: number, imageIndex: number, isLook: boolean) => {
    const newProducts = [...productsWithImages];
    if (isLook) {
      newProducts[productIndex].looks.splice(imageIndex, 1);
      newProducts[productIndex].lookCount = newProducts[productIndex].looks.length;
    } else {
      newProducts[productIndex].stills.splice(imageIndex, 1);
      newProducts[productIndex].stillCount = newProducts[productIndex].stills.length;
    }
    setProductsWithImages(newProducts);
  };

  const filteredProducts = productsWithImages.filter(product => {
    if (productFilter === 'found') return product.foundInOdoo;
    if (productFilter === 'notFound') return !product.foundInOdoo;
    return true;
  });

  return (
    <>
      <Head>
        <title>Weekend House Kids - Afbeeldingen Importeren</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                🏠 Weekend House Kids - Afbeeldingen Importeren
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
                    2️⃣ Upload Stills (Productfoto's)
                  </h2>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleStillsUpload}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:file:bg-green-900 dark:file:text-green-300"
                  />
                  {stillsFolder.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      ✓ {stillsFolder.length} still images geselecteerd
                    </p>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    3️⃣ Upload Looks (Modelfoto's)
                  </h2>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleLooksUpload}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-purple-900 dark:file:text-purple-300"
                  />
                  {looksFolder.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      ✓ {looksFolder.length} look images geselecteerd
                    </p>
                  )}
                </div>

                <button
                  onClick={parseCSVAndMatchImages}
                  disabled={loading || !csvFile || (stillsFolder.length === 0 && looksFolder.length === 0)}
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
                      key={product.productReference}
                      className={`p-4 rounded-lg border-2 ${
                        product.foundInOdoo
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">
                            {product.productReference} - {product.name}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {product.foundInOdoo ? (
                              <span className="text-green-600">✅ Gevonden in Odoo - Template ID: {product.templateId}</span>
                            ) : (
                              <span className="text-red-600">❌ Niet gevonden in Odoo</span>
                            )}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            📸 {product.stillCount} stills, 🎭 {product.lookCount} looks
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

                      {/* Stills Preview */}
                      {product.stills.length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📸 Stills ({product.stillCount})</h4>
                          <div className="grid grid-cols-4 gap-2">
                            {product.stills.map((image, imageIndex) => (
                              <div key={imageIndex} className="relative">
                                <img
                                  src={URL.createObjectURL(image)}
                                  alt={image.name}
                                  className="w-full h-24 object-cover rounded border-2 border-gray-300 dark:border-gray-600"
                                />
                                <button
                                  onClick={() => removeImageFromProduct(productIndex, imageIndex, false)}
                                  className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                  title="Verwijder afbeelding"
                                >
                                  ×
                                </button>
                                <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1">{image.name}</p>
                              </div>
                            ))}
                            {/* Add still button */}
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => addImageToProduct(productIndex, e.target.files, false, e.target)}
                                className="hidden"
                                id={`add-still-${productIndex}`}
                              />
                              <label
                                htmlFor={`add-still-${productIndex}`}
                                className="w-full h-24 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                title="Stills toevoegen"
                              >
                                <span className="text-2xl text-gray-400 dark:text-gray-500 hover:text-green-500 dark:hover:text-green-400">+</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Looks Preview */}
                      {product.looks.length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">🎭 Looks ({product.lookCount})</h4>
                          <div className="grid grid-cols-4 gap-2">
                            {product.looks.map((image, imageIndex) => (
                              <div key={imageIndex} className="relative">
                                <img
                                  src={URL.createObjectURL(image)}
                                  alt={image.name}
                                  className="w-full h-24 object-cover rounded border-2 border-gray-300 dark:border-gray-600"
                                />
                                <button
                                  onClick={() => removeImageFromProduct(productIndex, imageIndex, true)}
                                  className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                  title="Verwijder afbeelding"
                                >
                                  ×
                                </button>
                                <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1">{image.name}</p>
                              </div>
                            ))}
                            {/* Add look button */}
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => addImageToProduct(productIndex, e.target.files, true, e.target)}
                                className="hidden"
                                id={`add-look-${productIndex}`}
                              />
                              <label
                                htmlFor={`add-look-${productIndex}`}
                                className="w-full h-24 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded cursor-pointer hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                                title="Looks toevoegen"
                              >
                                <span className="text-2xl text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400">+</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Add buttons if no images yet */}
                      {product.stills.length === 0 && product.looks.length === 0 && (
                        <div className="flex gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => addImageToProduct(productIndex, e.target.files, false, e.target)}
                            className="hidden"
                            id={`add-still-empty-${productIndex}`}
                          />
                          <label
                            htmlFor={`add-still-empty-${productIndex}`}
                            className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm cursor-pointer"
                          >
                            📸 Stills Toevoegen
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => addImageToProduct(productIndex, e.target.files, true, e.target)}
                            className="hidden"
                            id={`add-look-empty-${productIndex}`}
                          />
                          <label
                            htmlFor={`add-look-empty-${productIndex}`}
                            className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm cursor-pointer"
                          >
                            🎭 Looks Toevoegen
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
                    disabled={loading || filteredProducts.filter(p => p.foundInOdoo && (p.stillCount > 0 || p.lookCount > 0)).length === 0}
                    className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? (
                      <>
                        {uploadProgress && `⏳ Uploading ${uploadProgress.current}/${uploadProgress.total}...`}
                        {!uploadProgress && '⏳ Uploading...'}
                      </>
                    ) : (
                      `🚀 Upload Images (${filteredProducts.filter(p => p.foundInOdoo && (p.stillCount > 0 || p.lookCount > 0)).reduce((sum, p) => sum + p.stillCount + p.lookCount, 0)} images)`
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
                  {uploadResults.map((result) => (
                    <div
                      key={result.productReference}
                      className={`p-4 rounded-lg border-2 ${
                        result.success
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">
                        {result.productReference}
                      </h3>
                      {result.success ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          ✅ {result.stillsUploaded} stills, {result.looksUploaded} looks geüpload
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
                    setStillsFolder([]);
                    setLooksFolder([]);
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
