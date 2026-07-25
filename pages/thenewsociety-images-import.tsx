import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import ProductImageUploader from '@/components/images/ProductImageUploader';
import type { ImageTarget, PoolImage } from '@/lib/images/types';

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

export default function TheNewSocietyImagesImport() {
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
  const [imagesFolder, setImagesFolder] = useState<File[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [loading, setLoading] = useState(false);
  const [productFilter, setProductFilter] = useState<'all' | 'found' | 'notFound'>('all');
  const [poolImages, setPoolImages] = useState<PoolImage[]>([]);

  const targets = useMemo<ImageTarget[]>(() => {
    return productsWithImages
      .filter(p => p.foundInOdoo && p.templateId !== null)
      .map(p => {
        const key = `${p.productReference}-${p.colorName}`;
        const firstExisting = p.existingImages[0];
        return {
          key,
          label: `${p.productReference} - ${p.colorName}`,
          templateId: p.templateId!,
          reference: p.productReference,
          hasExistingImages: p.existingImageCount > 0,
          mainThumbnail: firstExisting?.image_1920
            ? `data:image/jpeg;base64,${firstExisting.image_1920}`
            : null,
          galleryThumbnails: p.existingImages.slice(1).map(img => ({
            id: img.id,
            name: img.name,
            thumbnail: img.image_1920 ? `data:image/jpeg;base64,${img.image_1920}` : '',
            sequence: img.sequence,
          })),
        };
      });
  }, [productsWithImages]);

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
      if (!(await ensureLoggedIn())) {
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

      const newPoolImages: PoolImage[] = [];
      let poolId = 0;
      for (const product of products) {
        if (!product.foundInOdoo || !product.templateId) continue;
        const assignedKey = `${product.productReference}-${product.colorName}`;
        product.images.forEach((file, idx) => {
          newPoolImages.push({
            id: `tns-${++poolId}`,
            dataUrl: URL.createObjectURL(file),
            filename: file.name,
            file,
            assignedKey,
            order: idx,
          });
        });
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
                        key={`${p.productReference}-${p.colorName}`}
                        className="p-4 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-900/20"
                      >
                        <h3 className="font-bold text-gray-900 dark:text-gray-100">
                          {p.productReference} - {p.colorName}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{p.name}</p>
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Niet gevonden in Odoo
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {p.imageCount} images
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
                      setImagesFolder([]);
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
