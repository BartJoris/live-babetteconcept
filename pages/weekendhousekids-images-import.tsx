import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import ProductImageUploader from '@/components/images/ProductImageUploader';
import type { ImageTarget, PoolImage } from '@/lib/images/types';

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

export default function WeekendHouseKidsImagesImport() {
  const ensureLoggedIn = async () => {
    try {
      const response = await fetch('/api/session');
      const data = await response.json();
      return Boolean(data.isLoggedIn);
    } catch (error) {
      console.error('Error checking session:', error);
      return false;
    }
  };

  const [currentStep, setCurrentStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [stillsFolder, setStillsFolder] = useState<File[]>([]);
  const [looksFolder, setLooksFolder] = useState<File[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [loading, setLoading] = useState(false);
  const [productFilter, setProductFilter] = useState<'all' | 'found' | 'notFound'>('all');
  const [poolImages, setPoolImages] = useState<PoolImage[]>([]);

  const targets = useMemo<ImageTarget[]>(() => {
    return productsWithImages
      .filter(p => p.foundInOdoo && p.templateId !== null)
      .map(p => ({
        key: p.productReference,
        label: `${p.productReference} - ${p.name}`,
        templateId: p.templateId!,
        reference: p.productReference,
      }));
  }, [productsWithImages]);

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
      if (!(await ensureLoggedIn())) {
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

      const newPoolImages: PoolImage[] = [];
      let poolId = 0;
      for (const product of products) {
        if (!product.foundInOdoo || !product.templateId) continue;
        let order = 0;
        for (const file of product.stills) {
          newPoolImages.push({
            id: `whk-${++poolId}`,
            dataUrl: URL.createObjectURL(file),
            filename: file.name,
            file,
            assignedKey: product.productReference,
            order: order++,
          });
        }
        for (const file of product.looks) {
          newPoolImages.push({
            id: `whk-${++poolId}`,
            dataUrl: URL.createObjectURL(file),
            filename: file.name,
            file,
            assignedKey: product.productReference,
            order: order++,
          });
        }
      }
      setPoolImages(newPoolImages);

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

            {/* Step 2: Review & Upload via ProductImageUploader */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    2️⃣ Review & Upload
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

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">{productsWithImages.filter(p => p.foundInOdoo).length}</div>
                    <div className="text-sm text-green-600 dark:text-green-400">Gevonden in Odoo</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                    <div className="text-2xl font-bold text-red-700 dark:text-red-300">{productsWithImages.filter(p => !p.foundInOdoo).length}</div>
                    <div className="text-sm text-red-600 dark:text-red-400">Niet gevonden</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{poolImages.length}</div>
                    <div className="text-sm text-blue-600 dark:text-blue-400">Afbeeldingen</div>
                  </div>
                </div>

                {productFilter === 'notFound' ? (
                  <div className="space-y-2">
                    {filteredProducts.map(p => (
                      <div
                        key={p.productReference}
                        className="p-4 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-900/20"
                      >
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">
                          {p.productReference} - {p.name}
                        </h3>
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Niet gevonden in Odoo
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {p.stillCount} stills, {p.lookCount} looks
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ProductImageUploader
                    mode="brand"
                    targets={targets}
                    images={poolImages}
                    onImagesChange={setPoolImages}
                    showUploadButton
                    enableFolderPick={false}
                    enableCompress={false}
                  />
                )}

                <div className="flex justify-between items-center pt-4 border-t dark:border-gray-700">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setProductsWithImages([]);
                      setPoolImages([]);
                      setCsvFile(null);
                      setStillsFolder([]);
                      setLooksFolder([]);
                    }}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Nieuwe Import Starten
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
