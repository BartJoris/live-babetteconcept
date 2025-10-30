import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

interface ProductWithImages {
  reference: string;
  color: string;
  description: string;
  templateId: number | null;
  name: string;
  foundInOdoo: boolean;
  images: File[];
  imageCount: number;
}

interface UploadResult {
  reference: string;
  success: boolean;
  imagesUploaded: number;
  error?: string;
}

export default function ArmedAngelsImagesImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [catalogCsvFile, setCatalogCsvFile] = useState<File | null>(null);
  const [localImages, setLocalImages] = useState<File[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [productFilter, setProductFilter] = useState<'all' | 'found' | 'notFound'>('all');

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

  const handleCatalogCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCatalogCsvFile(file);
    console.log('📊 Catalog CSV file selected');
  };

  const handleImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setLocalImages(files);
    console.log(`📁 Selected ${files.length} images`);
  };

  const parseCSVFiles = async () => {
    if (!csvFile || !catalogCsvFile || localImages.length === 0) {
      alert('Please upload all required files');
      return;
    }

    setLoading(true);
    try {
      // Parse products CSV - extract reference and description
      const csvText = await csvFile.text();
      const csvLines = csvText.split('\n').filter(l => l.trim());
      const productsByReference = new Map<string, any>();

      for (let i = 1; i < csvLines.length; i++) {
        const values = csvLines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (values.length >= 1) {
          const reference = values[0];
          // Store all variants of this product by reference
          if (!productsByReference.has(reference)) {
            productsByReference.set(reference, {
              reference,
              description: values[2] || values[1] || `Product ${reference}`,
            });
          }
        }
      }

      console.log(`📦 Found ${productsByReference.size} unique product references`);

      // Parse catalog CSV to get Template IDs
      const catalogText = await catalogCsvFile.text();
      const catalogLines = catalogText.split('\n').filter(l => l.trim());
      const catalogMap = new Map<string, number>();

      // Check if this is the raw Armed Angels format (semicolon-separated) or processed format (comma-separated)
      const isRawFormat = catalogLines[1]?.includes(';') && catalogLines[1]?.includes('Item Number');
      
      if (isRawFormat) {
        // Parse raw Armed Angels catalog format
        const headerLine = catalogLines[1];
        const headers = headerLine.split(';').map(h => h.trim());
        
        // Find column indices
        const itemNumberIdx = headers.indexOf('Item Number');
        const colorCodeIdx = headers.indexOf('Color Code');
        const skuNumberIdx = headers.indexOf('SKU Number');
        
        console.log(`🛡️ Raw format detected - Item#: ${itemNumberIdx}, Color: ${colorCodeIdx}, SKU: ${skuNumberIdx}`);
        
        // Parse data rows (start from line 2, skip header and "Table 1")
        const processedKeys = new Set<string>();
        
        for (let i = 2; i < catalogLines.length; i++) {
          const line = catalogLines[i].trim();
          if (!line) continue;
          
          const values = line.split(';').map(v => v.trim());
          
          if (values.length < Math.max(itemNumberIdx, colorCodeIdx, skuNumberIdx) + 1) {
            continue;
          }
          
          const itemNumber = values[itemNumberIdx];
          const colorCode = values[colorCodeIdx];
          const skuNumber = values[skuNumberIdx];
          
          if (!itemNumber || !colorCode || !skuNumber) continue;
          
          // Create a key to track unique item+color combinations (avoid duplicates)
          const key = `${itemNumber}_${colorCode}`;
          if (processedKeys.has(key)) continue;
          processedKeys.add(key);
          
          // Use SKU Number as template ID (it's unique for each product-color combination)
          const templateId = parseInt(skuNumber) || 0;
          
          if (templateId > 0) {
            catalogMap.set(key, templateId);
          }
        }
        
        console.log(`🛡️ Parsed ${catalogMap.size} unique product-color combinations from raw catalog`);
      } else {
        // Parse processed format: Reference,Color,Template ID,SKU
        for (let i = 1; i < catalogLines.length; i++) {
          const line = catalogLines[i];
          const match = line.match(/^(\d+),"(\d+)",(\d+),"(.+)"$/);
          if (!match) continue;

          const reference = match[1];
          const color = match[2];
          const templateId = parseInt(match[3]);
          const key = `${reference}_${color}`;
          
          catalogMap.set(key, templateId);
        }
      }

      console.log(`📊 Loaded ${catalogMap.size} catalog entries`);

      // Build image map by reference_color
      const imageMap = new Map<string, File[]>();
      const imagesByReference = new Map<string, Map<string, File[]>>();
      
      localImages.forEach(file => {
        const filename = file.name;
        // Match pattern: 30005160-3232 or similar
        const match = filename.match(/^(\d+)-(\d+)/);
        if (match) {
          const reference = match[1];
          const colorCode = match[2];
          const key = `${reference}_${colorCode}`;
          
          if (!imageMap.has(key)) {
            imageMap.set(key, []);
          }
          imageMap.get(key)!.push(file);
          
          // Also group by reference for products without specific color codes
          if (!imagesByReference.has(reference)) {
            imagesByReference.set(reference, new Map());
          }
          if (!imagesByReference.get(reference)!.has(colorCode)) {
            imagesByReference.get(reference)!.set(colorCode, []);
          }
          imagesByReference.get(reference)!.get(colorCode)!.push(file);
          
          console.log(`  ✅ Image matched: ${filename} → key: ${key}`);
        } else {
          console.log(`  ❌ Image NOT matched: ${filename} (regex failed)`);
        }
      });

      console.log(`📸 Created image map with ${imageMap.size} keys`);
      console.log(`📸 Image map keys:`, Array.from(imageMap.keys()));
      console.log(`📸 References with images:`, Array.from(imagesByReference.keys()));

      // Match products with images and template IDs
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        alert('No Odoo credentials found');
        setLoading(false);
        return;
      }

      const matched: ProductWithImages[] = [];

      for (const [reference, product] of productsByReference) {
        const refImages = imagesByReference.get(reference) || new Map();
        
        // Get first available color from images, or use first from catalog
        let colorCode = '';
        let images: File[] = [];
        
        if (refImages.size > 0) {
          // Get first color variant's images
          const firstColorEntry = refImages.entries().next();
          if (!firstColorEntry.done) {
            colorCode = firstColorEntry.value[0];
            images = firstColorEntry.value[1];
          }
        } else {
          // Look for this reference in catalog to get a color code
          for (const [catalogKey] of catalogMap) {
            if (catalogKey.startsWith(`${reference}_`)) {
              colorCode = catalogKey.split('_')[1];
              break;
            }
          }
        }
        
        const catalogKey = colorCode ? `${reference}_${colorCode}` : reference;
        const templateId = catalogMap.get(catalogKey);

        if (images.length > 0) {
          console.log(`✅ Product ${reference}: Found ${images.length} images with color ${colorCode}`);
        } else if (templateId) {
          console.log(`⚠️  Product ${reference}: In catalog but NO images (color: ${colorCode})`);
        } else {
          console.log(`❌ Product ${reference}: NOT in catalog`);
        }

        // Try to find in Odoo
        let foundInOdoo = false;
        if (templateId) {
          foundInOdoo = true;
        }

        matched.push({
          reference,
          color: colorCode,
          description: product.description,
          templateId: templateId || null,
          name: product.description || `${reference} - ${colorCode}`,
          foundInOdoo,
          images,
          imageCount: images.length,
        });
      }

      matched.sort((a, b) => b.imageCount - a.imageCount);
      setProductsWithImages(matched);
      setCurrentStep(2);

      const withImages = matched.filter(p => p.imageCount > 0).length;
      console.log(`✅ Matched ${withImages}/${matched.length} products with images`);
      console.log(`📦 Product references:`, Array.from(productsByReference.keys()).slice(0, 5));
      console.log(`📊 Catalog keys:`, Array.from(catalogMap.keys()).slice(0, 5));

      alert(`✅ Matching complete!\n\n✅ Found: ${matched.filter(p => p.foundInOdoo).length}\n❌ Not found: ${matched.filter(p => !p.foundInOdoo).length}\n📸 Products with images: ${withImages}`);
    } catch (error) {
      console.error('Error parsing files:', error);
      alert('Error parsing files');
    } finally {
      setLoading(false);
    }
  };

  const addImageToProduct = (productIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newProducts = [...productsWithImages];
    const newImages = Array.from(files);
    newProducts[productIndex].images = [...newProducts[productIndex].images, ...newImages];
    newProducts[productIndex].imageCount = newProducts[productIndex].images.length;
    setProductsWithImages(newProducts);
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
      alert('No Odoo credentials found');
      return;
    }

    setLoading(true);
    setCurrentStep(3);
    const results: UploadResult[] = [];

    for (const product of productsWithImages) {
      if (!product.foundInOdoo || !product.templateId) {
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: 'Product not found in Odoo or no Template ID',
        });
        continue;
      }

      if (product.images.length === 0) {
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: 'No images selected',
        });
        continue;
      }

      try {
        let uploadedCount = 0;

        for (let i = 0; i < Math.min(product.images.length, 5); i++) {
          const imageFile = product.images[i];
          
          const base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });

          try {
            const response = await fetch('/api/odoo-call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: i === 0 ? 'product.template' : 'product.image',
                method: i === 0 ? 'write' : 'create',
                args: i === 0 
                  ? [[product.templateId], { image_1920: base64Image }]
                  : [{
                      name: `${product.reference} - Image ${i + 1}`,
                      product_tmpl_id: product.templateId,
                      image_1920: base64Image,
                      sequence: i + 1,
                    }],
                uid,
                password,
              }),
            });

            const result = await response.json();
            if (result.success) {
              uploadedCount++;
            }
          } catch (imgError) {
            console.error(`Error uploading image ${i + 1}:`, imgError);
          }
        }

        results.push({
          reference: product.reference,
          success: uploadedCount > 0,
          imagesUploaded: uploadedCount,
        });
      } catch (error) {
        console.error(`Error uploading for ${product.reference}:`, error);
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    setUploadResults(results);
    setLoading(false);

    const successCount = results.filter(r => r.success).length;
    const totalImages = results.reduce((sum, r) => sum + r.imagesUploaded, 0);
    alert(`✅ Upload complete!\n${successCount}/${results.length} products\n${totalImages} total images uploaded`);
  };

  return (
    <>
      <Head>
        <title>Armed Angels Images Import - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🖼️ Armed Angels Images Upload
            </h1>
            <p className="text-gray-600">
              Upload local images to imported Armed Angels products
            </p>
          </div>

          {/* Step 1: Upload Files */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">📤 Upload Files</h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-blue-800 text-sm">
                  <strong>ℹ️ How it works:</strong> Upload your CSVs and images. We&apos;ll match them automatically and show you a preview before uploading to Odoo.
                </p>
              </div>

              {/* Product CSV */}
              <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center mb-6 bg-green-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">1️⃣ Upload Product CSV</h3>
                <div className="text-4xl mb-3">📄</div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="bg-green-600 text-white px-6 py-3 rounded inline-block font-medium hover:bg-green-700 cursor-pointer"
                >
                  {csvFile ? `✅ ${csvFile.name}` : '📄 Upload CSV'}
                </label>
              </div>

              {/* Catalog CSV */}
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center mb-6 bg-blue-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">2️⃣ Upload Catalog CSV</h3>
                <p className="text-sm text-gray-700 mb-4">With Template IDs (Item Number;Color Code;SKU Number)</p>
                <div className="text-4xl mb-3">📊</div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCatalogCsvUpload}
                  className="hidden"
                  id="catalog-upload"
                />
                <label
                  htmlFor="catalog-upload"
                  className="bg-blue-600 text-white px-6 py-3 rounded inline-block font-medium hover:bg-blue-700 cursor-pointer"
                >
                  {catalogCsvFile ? `✅ ${catalogCsvFile.name}` : '📊 Upload Catalog CSV'}
                </label>
              </div>

              {/* Images */}
              <div className="border-2 border-dashed border-orange-300 rounded-lg p-8 text-center mb-6 bg-orange-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">3️⃣ Select Local Images</h3>
                <div className="text-4xl mb-3">🖼️</div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagesUpload}
                  className="hidden"
                  id="images-upload"
                />
                <label
                  htmlFor="images-upload"
                  className="bg-orange-600 text-white px-6 py-3 rounded inline-block font-medium hover:bg-orange-700 cursor-pointer"
                >
                  📁 Select Images {localImages.length > 0 && `(${localImages.length} selected)`}
                </label>
              </div>

              {/* Match Button */}
              <button
                onClick={parseCSVFiles}
                disabled={!csvFile || !catalogCsvFile || localImages.length === 0 || loading}
                className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white px-6 py-4 rounded-lg hover:from-green-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 font-bold text-lg"
              >
                {loading ? '⏳ Processing...' : '🔍 Match Images & Products'}
              </button>
            </div>
          )}

          {/* Step 2: Review Matched Images */}
          {currentStep === 2 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">📋 Review Matched Images</h2>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                >
                  ← Back
                </button>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="text-sm text-blue-600 font-medium">Total Products</div>
                  <div className="text-3xl font-bold text-blue-700">{productsWithImages.length}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="text-sm text-green-600 font-medium">Found in Odoo</div>
                  <div className="text-3xl font-bold text-green-700">
                    {productsWithImages.filter(p => p.foundInOdoo).length}
                  </div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <div className="text-sm text-orange-600 font-medium">With Images</div>
                  <div className="text-3xl font-bold text-orange-700">
                    {productsWithImages.filter(p => p.imageCount > 0).length}
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setProductFilter('all')}
                  className={`px-4 py-2 rounded font-medium ${
                    productFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All ({productsWithImages.length})
                </button>
                <button
                  onClick={() => setProductFilter('found')}
                  className={`px-4 py-2 rounded font-medium ${
                    productFilter === 'found'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Found ({productsWithImages.filter(p => p.foundInOdoo).length})
                </button>
              </div>

              {/* Products List */}
              <div className="space-y-6 mb-6 max-h-[600px] overflow-y-auto">
                {productsWithImages
                  .filter(p => productFilter === 'all' || (productFilter === 'found' ? p.foundInOdoo : !p.foundInOdoo))
                  .map((product, productIndex) => (
                  <div key={`${product.reference}_${product.color}`} className={`border rounded-lg p-4 ${
                    product.foundInOdoo 
                      ? 'border-gray-200 bg-gray-50' 
                      : 'border-red-300 bg-red-50'
                  }`}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg text-gray-900">{product.name}</h3>
                          {!product.foundInOdoo && (
                            <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded-full font-semibold">
                              NOT FOUND
                            </span>
                          )}
                          {product.foundInOdoo && product.templateId && (
                            <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full font-semibold">
                              ID: {product.templateId}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Reference: {product.reference} • Color: {product.color}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        product.imageCount > 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {product.imageCount} {product.imageCount === 1 ? 'image' : 'images'}
                      </span>
                    </div>

                    {/* Image Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {product.images.map((image, imageIndex) => (
                        <div key={imageIndex} className="relative group">
                          <div className="relative w-full h-32">
                            <Image
                              src={URL.createObjectURL(image)}
                              alt={image.name}
                              fill
                              className="object-cover rounded border border-gray-300"
                              unoptimized
                            />
                          </div>
                          <button
                            onClick={() => removeImageFromProduct(productIndex, imageIndex)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      
                      {/* Add Image Button */}
                      <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded hover:border-blue-500 hover:bg-blue-50">
                        <label className="cursor-pointer text-center p-2">
                          <div className="text-3xl text-gray-400 mb-1">+</div>
                          <div className="text-xs text-gray-600">Add</div>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => addImageToProduct(productIndex, e.target.files)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload Button */}
              <button
                onClick={uploadImagesToOdoo}
                disabled={loading || productsWithImages.filter(p => p.foundInOdoo).every(p => p.imageCount === 0)}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 font-bold text-lg"
              >
                🚀 Upload {productsWithImages.filter(p => p.foundInOdoo).reduce((sum, p) => sum + p.imageCount, 0)} Images
              </button>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                ✅ Upload Complete
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <div className="text-green-600 text-sm mb-1 font-medium">Successful</div>
                  <div className="text-3xl font-bold text-gray-900">{uploadResults.filter(r => r.success).length}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <div className="text-red-600 text-sm mb-1 font-medium">Failed</div>
                  <div className="text-3xl font-bold text-gray-900">{uploadResults.filter(r => !r.success).length}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <div className="text-blue-600 text-sm mb-1 font-medium">Total Images</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {uploadResults.reduce((sum, r) => sum + r.imagesUploaded, 0)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left font-semibold text-gray-900">Status</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Product</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Images Uploaded</th>
                      <th className="p-3 text-left font-semibold text-gray-900">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResults.map((result, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-3">
                          {result.success ? (
                            <span className="text-green-600 font-medium">✅ Success</span>
                          ) : (
                            <span className="text-red-600 font-medium">❌ Error</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-900">{result.reference}</td>
                        <td className="p-3 text-gray-900">{result.imagesUploaded || 0}</td>
                        <td className="p-3 text-xs text-gray-700">{result.error || 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => {
                  setCurrentStep(1);
                  setCsvFile(null);
                  setCatalogCsvFile(null);
                  setLocalImages([]);
                  setProductsWithImages([]);
                  setUploadResults([]);
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                🔄 New Upload
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
