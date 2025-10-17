import { useState } from 'react';
import Head from 'next/head';

interface ProductToFetch {
  reference: string;
  description: string;
  colorCode: string;
  colorName?: string;
  templateId: number;
  name: string;
}

export default function PlayUpImagesImport() {
  const [products, setProducts] = useState<ProductToFetch[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }>>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [localImages, setLocalImages] = useState<File[]>([]);


  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const handleLocalImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    console.log(`📁 Selected ${files.length} local images`);
    setLocalImages(files);

    // Parse filenames to extract product info
    // Filename pattern: ArticleCode_ColorCode_Number.jpg (e.g., 1AR11003_R324G_1.jpg)
    const productMap = new Map<string, { reference: string; colorCode: string; images: File[] }>();

    files.forEach(file => {
      const filename = file.name;
      const match = filename.match(/^([^_]+)_([^_]+)_\d+\.(jpg|jpeg|png)$/i);
      
      if (match) {
        const [, article, color] = match;
        const key = `${article}_${color}`;
        
        if (!productMap.has(key)) {
          productMap.set(key, {
            reference: article,
            colorCode: color,
            images: [],
          });
        }
        productMap.get(key)!.images.push(file);
      } else {
        console.warn(`⚠️ Skipping file with invalid format: ${filename}`);
      }
    });

    console.log(`📸 Found ${productMap.size} unique products in images`);
  };

  const parseCSV = async (text: string) => {
    // Parse original Play UP CSV format: Article,Color,Description,Size,Quantity,Price
    const lines = text.trim().split('\n');
    
    console.log(`📦 Parsing Play UP CSV...`);
    console.log(`📦 Lines: ${lines.length}`);
    
    if (lines.length < 2) {
      alert('CSV is empty');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    console.log(`📦 Headers:`, headers);
    
    // Group products by Article + Color
    const productMap = new Map<string, { reference: string; colorCode: string; description: string }>();

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      const article = row['Article'] || row['article'] || row['Reference'] || row['reference'];
      const color = row['Color'] || row['color'] || row['ColorCode'] || row['colorCode'];
      const description = row['Description'] || row['description'] || '';

      if (article && color) {
        const key = `${article}_${color}`;
        if (!productMap.has(key)) {
          productMap.set(key, {
            reference: article,
            colorCode: color,
            description,
          });
        }
      }
    }

    console.log(`📦 Found ${productMap.size} unique products in CSV`);

    // Search Odoo for these products
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden');
      return;
    }

    setLoading(true);
    const parsed: ProductToFetch[] = [];
    let found = 0;
    let notFound = 0;

    try {
      // First, let's check what Play UP products exist in Odoo
      console.log('🔍 First, checking what Play UP products exist in Odoo...');
      const checkResponse = await fetch('/api/odoo-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'product.template',
          method: 'search_read',
          args: [[['name', 'ilike', 'Play Up']]],
          kwargs: {
            fields: ['id', 'name', 'default_code'],
            limit: 5,
          },
          uid,
          password,
        }),
      });
      
      const checkResult = await checkResponse.json();
      if (checkResult.success && checkResult.result) {
        console.log(`📦 Found ${checkResult.result.length} Play UP products in Odoo (showing first 5):`);
        checkResult.result.forEach((p: { id: number; name: string; default_code: string }) => {
          console.log(`   - ${p.default_code} (Template ${p.id}): ${p.name}`);
        });
      }

      for (const { reference, colorCode, description } of productMap.values()) {
        const fullReference = `${reference}-${colorCode}`;
        
        console.log(`🔍 Searching Odoo for product with description="${description}" and color="${colorCode}"`);
        
        // Search for product in Odoo by name pattern
        // Product name format: "Play Up - STRIPED JERSEY SWEAT - R331N"
        const searchName = `Play Up - ${description} - ${colorCode}`;
        
        const response = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'product.template',
            method: 'search_read',
            args: [[
              ['name', '=', searchName]
            ]],
            kwargs: {
              fields: ['id', 'name', 'default_code'],
              limit: 1,
            },
            uid,
            password,
          }),
        });

        const result = await response.json();

        if (result.success && result.result && result.result.length > 0) {
          const product = result.result[0];
          parsed.push({
            reference: fullReference,
            description,
            colorCode,
            colorName: '',
            templateId: product.id,
            name: product.name,
          });
          found++;
          console.log(`  ✅ Found: Template ${product.id} - ${product.name}`);
        } else {
          console.warn(`  ❌ Not found in Odoo: "${searchName}"`);
          console.warn(`     Tried exact match, might need fuzzy search`);
          notFound++;
        }
      }

      console.log(`📊 Results: ${found} found, ${notFound} not found`);

      if (parsed.length === 0) {
        alert(`❌ No products found in Odoo!\n\n` +
          `CSV products: ${productMap.size}\n` +
          `Found in Odoo: 0\n\n` +
          `Make sure these products are imported first.`);
        setLoading(false);
        return;
      }

      if (notFound > 0) {
        alert(`⚠️ Found ${found} products, ${notFound} not found in Odoo.\n\nContinuing with found products...`);
      }

      setProducts(parsed);
      setSelectedProducts(new Set(parsed.map(p => p.reference)));
      setLoading(false);
      
      console.log(`✅ Ready to upload images for ${parsed.length} products`);
      alert(`✅ Found ${parsed.length} products in Odoo!\n\nNow click the upload button to start.`);
    } catch (error) {
      console.error('Error searching Odoo:', error);
      alert('Error searching for products in Odoo');
      setLoading(false);
    }
  };

  const uploadLocalImages = async () => {
    console.log('🚀 uploadLocalImages() called');
    console.log(`   Products: ${products.length}`);
    console.log(`   Selected: ${selectedProducts.size}`);
    console.log(`   Images: ${localImages.length}`);
    
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden');
      return;
    }

    if (localImages.length === 0) {
      alert('Selecteer eerst afbeeldingen');
      return;
    }

    setLoading(true);
    const results: Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }> = [];

    // Match images with products
    const imageMap = new Map<string, File[]>();
    localImages.forEach(file => {
      const filename = file.name;
      const match = filename.match(/^([^_]+)_([^_]+)_\d+\.(jpg|jpeg|png)$/i);
      
      if (match) {
        const [, article, color] = match;
        const key = `${article}_${color}`;
        if (!imageMap.has(key)) {
          imageMap.set(key, []);
        }
        imageMap.get(key)!.push(file);
      }
    });

    console.log(`📸 Image map created: ${imageMap.size} products`);
    console.log(`📸 Image map keys:`, Array.from(imageMap.keys()).slice(0, 5));
    console.log(`📸 Starting upload loop for ${products.length} products...`);

    // Upload images for each product
    let processedCount = 0;
    for (const product of products) {
      console.log(`🔄 Processing product ${processedCount + 1}/${products.length}: ${product.reference}`);
      console.log(`   Selected? ${selectedProducts.has(product.reference)}`);
      
      if (!selectedProducts.has(product.reference)) {
        console.log(`   ⏭️ Skipping (not selected)`);
        continue;
      }
      
      processedCount++;

      // Extract article code from reference (format: "1AR11003-R324G")
      const article = product.reference.split('-')[0];
      const key = `${article}_${product.colorCode}`;
      const productImages = imageMap.get(key) || [];
      
      console.log(`🔍 Looking for images with key: ${key}, found: ${productImages.length}`);

      if (productImages.length === 0) {
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: 'No matching images found',
        });
        continue;
      }

      try {
        console.log(`📤 Uploading ${productImages.length} images for ${product.name}...`);

        // Convert images to base64
        const imageDataUrls: string[] = [];
        for (const file of productImages) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            imageDataUrls.push(base64);
          } catch (readError) {
            console.error(`  ❌ Error reading file ${file.name}:`, readError);
          }
        }

        console.log(`  Converted ${imageDataUrls.length} images to base64`);

        let uploaded = 0;

        // Step 1: Set first image as product template's main image
        if (imageDataUrls.length > 0) {
          console.log(`  Setting first image as main product image (Template ${product.templateId})...`);
          try {
            const mainImageResponse = await fetch('/api/odoo-call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'product.template',
                method: 'write',
                args: [[product.templateId], {
                  image_1920: imageDataUrls[0].split(',')[1], // First image as main
                }],
                uid,
                password,
              }),
            });

            const mainResult = await mainImageResponse.json();
            console.log(`  Main image API response:`, mainResult);
            
            if (mainResult.success) {
              uploaded++;
              console.log(`  ✅ Main image set`);
            } else {
              console.error(`  ❌ Failed to set main image:`, mainResult.error);
            }
          } catch (mainError) {
            console.error(`  ❌ Exception setting main image:`, mainError);
          }
        }

        // Step 2: Upload remaining images as product.image records (one at a time to avoid payload limits)
        if (imageDataUrls.length > 1) {
          console.log(`  Uploading ${imageDataUrls.length - 1} additional images one at a time...`);
          
          for (let idx = 1; idx < imageDataUrls.length; idx++) {
            try {
              const additionalResponse = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'product.image',
                  method: 'create',
                  args: [{
                    name: `${product.name} - Image ${idx + 1}`,
                    product_tmpl_id: product.templateId,
                    image_1920: imageDataUrls[idx].split(',')[1],
                  }],
                  uid,
                  password,
                }),
              });

              const additionalResult = await additionalResponse.json();
              
              if (additionalResult.success) {
                uploaded++;
                console.log(`  ✅ Image ${idx + 1}/${imageDataUrls.length} uploaded`);
              } else {
                console.error(`  ❌ Failed to upload image ${idx + 1}:`, additionalResult.error);
              }
            } catch (additionalError) {
              console.error(`  ❌ Exception uploading image ${idx + 1}:`, additionalError);
            }
          }
          
          console.log(`  ✅ Finished uploading additional images: ${uploaded - 1}/${imageDataUrls.length - 1}`);
        }

        if (uploaded > 0) {
          results.push({
            reference: product.reference,
            success: true,
            imagesUploaded: uploaded,
          });
          console.log(`✅ Uploaded ${uploaded}/${imageDataUrls.length} images for ${product.name}`);
        } else {
          results.push({
            reference: product.reference,
            success: false,
            imagesUploaded: 0,
            error: 'Failed to upload images',
          });
          console.error(`❌ No images uploaded for ${product.name}`);
        }
      } catch (error) {
        console.error(`❌ Error uploading images for ${product.reference}:`, error);
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: String(error),
        });
      }

      // Update results in real-time
      setUploadResults([...results]);

      // Small delay between products
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setUploadResults(results);
    setLoading(false);
    setCurrentStep(3);
    
    const successCount = results.filter(r => r.success).length;
    const totalImages = results.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0);
    alert(`✅ Image import complete!\n${successCount}/${results.length} products\n${totalImages} total images uploaded`);
  };

  return (
    <>
      <Head>
        <title>Play UP Image Import - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🖼️ Play UP Images Upload
            </h1>
            <p className="text-gray-600">
              Upload local images to imported Play UP products
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            {/* Step 1: Upload */}
            {currentStep === 1 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">📤 Upload Images & CSV</h2>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-blue-800 text-sm">
                    <strong>ℹ️ How it works:</strong> Upload your CSV and images, the app will automatically search Odoo for matching products and upload the images.
                  </p>
                </div>

                {/* Step 1: Select Images */}
                <div className="border-2 border-blue-300 rounded-lg p-6 mb-6 bg-blue-50">
                  <h3 className="font-bold text-lg mb-4">1️⃣ Select Local Images</h3>
                  <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center mb-4 bg-white">
                    <div className="text-4xl mb-3">🖼️</div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleLocalImagesUpload}
                      className="hidden"
                      id="local-images-upload"
                    />
                    <label
                      htmlFor="local-images-upload"
                      className="bg-blue-600 text-white px-6 py-3 rounded cursor-pointer hover:bg-blue-700 inline-block font-medium"
                    >
                      📁 Select Images {localImages.length > 0 && `(${localImages.length} selected)`}
                    </label>
                  </div>
                  <div className="bg-blue-100 border border-blue-300 rounded p-3 text-xs">
                    <p className="font-medium mb-1">💡 Image Naming Pattern:</p>
                    <code className="bg-white px-2 py-1 rounded">ArticleCode_ColorCode_Number.jpg</code>
                    <p className="mt-2">Example: <code className="bg-white px-1 rounded">1AR11003_R324G_1.jpg</code>, <code className="bg-white px-1 rounded">1AR11003_R324G_2.jpg</code></p>
                  </div>
                </div>

                {/* Step 2: Upload CSV */}
                <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center mb-6 bg-green-50">
                  <h3 className="font-bold text-lg mb-4">2️⃣ Upload Original CSV</h3>
                  <div className="text-4xl mb-3">📄</div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csv-upload"
                    disabled={loading}
                  />
                  <label
                    htmlFor="csv-upload"
                    className={`bg-green-600 text-white px-6 py-3 rounded inline-block font-medium ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700 cursor-pointer'}`}
                  >
                    {loading ? '⏳ Searching Odoo...' : products.length > 0 ? `✅ ${products.length} products found` : '📄 Upload CSV'}
                  </label>
                  <p className="text-sm text-gray-600 mt-4">
                    {products.length > 0 ? 'Ready to upload images!' : 'Use the same CSV you used for product import'}
                  </p>
                </div>

                {/* Upload Button */}
                {localImages.length > 0 && products.length > 0 && (
                  <div>
                    <button
                      onClick={uploadLocalImages}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 font-bold text-lg shadow-lg"
                    >
                      {loading ? `⏳ Uploading... (${uploadResults.length}/${products.length} products)` : `🚀 Upload ${localImages.length} Images to ${products.length} Products`}
                    </button>
                    {loading && (
                      <div className="mt-4 text-center">
                        <div className="text-sm text-gray-600">
                          Please wait, uploading images to Odoo...
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(uploadResults.length / products.length) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-6">
                  <h4 className="font-bold text-blue-900 mb-2">ℹ️ How it works:</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Select all images from your matched images folder</li>
                    <li>Upload the same CSV you used for product import</li>
                    <li>App automatically matches images by filename (ArticleCode_ColorCode)</li>
                    <li>Click upload and images are uploaded to Odoo products</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Step 3: Results */}
            {currentStep === 3 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">✅ Upload Complete</h2>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <div className="text-green-600 text-sm mb-1">Successful</div>
                    <div className="text-3xl font-bold">{uploadResults.filter(r => r.success).length}</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded p-4">
                    <div className="text-red-600 text-sm mb-1">Failed</div>
                    <div className="text-3xl font-bold">{uploadResults.filter(r => !r.success).length}</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded p-4">
                    <div className="text-blue-600 text-sm mb-1">Total Images</div>
                    <div className="text-3xl font-bold">
                      {uploadResults.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0)}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-left">Images Uploaded</th>
                        <th className="p-2 text-left">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResults.map((result, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">
                            {result.success ? (
                              <span className="text-green-600">✅ Success</span>
                            ) : (
                              <span className="text-red-600">❌ Error</span>
                            )}
                          </td>
                          <td className="p-2">{result.reference}</td>
                          <td className="p-2">{result.imagesUploaded || 0}</td>
                          <td className="p-2 text-xs text-gray-800">{result.error || 'OK'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={() => {
                    setCurrentStep(1);
                    setProducts([]);
                    setUploadResults([]);
                    setSelectedProducts(new Set());
                    setLocalImages([]);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
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

