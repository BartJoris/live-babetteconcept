import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

interface ProductToFetch {
  reference: string;
  description: string;
  colorCode: string;
  colorName?: string;
  templateId: number;
  name: string;
}

interface ProductWithImages extends ProductToFetch {
  images: File[];
}

export default function PlayUpImagesImport() {
  const [products, setProducts] = useState<ProductToFetch[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
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


  const parseCSV = async (text: string) => {
    const lines = text.trim().split('\n');
    
    console.log(`📦 Parsing Play UP CSV...`);
    console.log(`📦 Lines: ${lines.length}`);
    
    if (lines.length < 2) {
      alert('CSV is empty');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    console.log(`📦 Headers:`, headers);
    
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
      for (const { reference, colorCode, description } of productMap.values()) {
        const fullReference = `${reference}-${colorCode}`;
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
          notFound++;
        }
      }

      console.log(`📊 Results: ${found} found, ${notFound} not found`);

      if (parsed.length === 0) {
        alert(`❌ No products found in Odoo!\n\nCSV products: ${productMap.size}\nFound in Odoo: 0\n\nMake sure these products are imported first.`);
        setLoading(false);
        return;
      }

      if (notFound > 0) {
        alert(`⚠️ Found ${found} products, ${notFound} not found in Odoo.\n\nContinuing with found products...`);
      }

      setProducts(parsed);
      setLoading(false);
      
      console.log(`✅ Ready to match images for ${parsed.length} products`);
      alert(`✅ Found ${parsed.length} products in Odoo!\n\nNow we'll match the images.`);
      
      // Automatically proceed to matching when both files are ready
      if (localImages.length > 0) {
        matchImagesWithProducts(parsed);
      }
    } catch (error) {
      console.error('Error searching Odoo:', error);
      alert('Error searching for products in Odoo');
      setLoading(false);
    }
  };

  const matchImagesWithProducts = (productsToMatch: ProductToFetch[] = products) => {
    if (localImages.length === 0 || productsToMatch.length === 0) return;

    // Create image map by article_color
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

    // Match images with products
    const matched: ProductWithImages[] = productsToMatch.map(product => {
      const article = product.reference.split('-')[0];
      const key = `${article}_${product.colorCode}`;
      const images = imageMap.get(key) || [];
      
      return {
        ...product,
        images,
      };
    });

    setProductsWithImages(matched);
    setCurrentStep(2);
    
    const totalImages = matched.reduce((sum, p) => sum + p.images.length, 0);
    const productsWithImages = matched.filter(p => p.images.length > 0).length;
    console.log(`✅ Matched ${totalImages} images to ${productsWithImages}/${matched.length} products`);
  };

  // Trigger matching when images are uploaded and products already exist
  const handleImagesUploadAndMatch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    console.log(`📁 Selected ${files.length} local images`);
    setLocalImages(files);
    
    // If products already loaded, match immediately
    if (products.length > 0) {
      setTimeout(() => {
        matchImagesWithProducts(products);
      }, 100);
    }
  };

  const addImageToProduct = (productIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const newProductsWithImages = [...productsWithImages];
    const newImages = Array.from(files);
    newProductsWithImages[productIndex].images = [
      ...newProductsWithImages[productIndex].images,
      ...newImages
    ];
    setProductsWithImages(newProductsWithImages);
  };

  const removeImageFromProduct = (productIndex: number, imageIndex: number) => {
    const newProductsWithImages = [...productsWithImages];
    newProductsWithImages[productIndex].images.splice(imageIndex, 1);
    setProductsWithImages(newProductsWithImages);
  };

  const uploadImagesToOdoo = async () => {
    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden');
      return;
    }

    setLoading(true);
    setCurrentStep(3);
    const results: Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }> = [];

    for (const product of productsWithImages) {
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

        for (const imageFile of product.images) {
          const reader = new FileReader();
          const base64Image = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });

          const response = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.template',
              method: 'write',
              args: [
                [product.templateId],
                { 
                  image_1920: uploadedCount === 0 ? base64Image : undefined,
                },
              ],
              uid,
              password,
            }),
          });

          const result = await response.json();
          
          if (result.success) {
            uploadedCount++;
          }
        }

        results.push({
          reference: product.reference,
          success: true,
          imagesUploaded: uploadedCount,
        });

      } catch (error) {
        console.error(`Error uploading images for ${product.reference}:`, error);
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
    const totalImages = results.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0);
    alert(`✅ Image import complete!\n${successCount}/${results.length} products\n${totalImages} total images uploaded`);
  };

  return (
    <>
      <Head>
        <title>Play UP Image Import - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🖼️ Play UP Images Upload
            </h1>
            <p className="text-gray-600">
              Upload local images to imported Play UP products
            </p>
          </div>

          {/* Step 1: Upload Files */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">📤 Upload Files</h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-blue-800 text-sm">
                  <strong>ℹ️ How it works:</strong> Upload your CSV and images. We&apos;ll match them automatically and show you a preview before uploading to Odoo.
                </p>
              </div>

              {/* Select Images */}
              <div className="border-2 border-blue-300 rounded-lg p-6 mb-6 bg-blue-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">1️⃣ Select Local Images</h3>
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center mb-4 bg-white">
                  <div className="text-4xl mb-3">🖼️</div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagesUploadAndMatch}
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
                <div className="bg-blue-100 border border-blue-300 rounded p-3 text-xs text-gray-900">
                  <p className="font-medium mb-1">💡 Image Naming Pattern:</p>
                  <code className="bg-white px-2 py-1 rounded">ArticleCode_ColorCode_Number.jpg</code>
                  <p className="mt-2">Example: <code className="bg-white px-1 rounded">1AR11003_R324G_1.jpg</code>, <code className="bg-white px-1 rounded">1AR11003_R324G_2.jpg</code></p>
                </div>
              </div>

              {/* Upload CSV */}
              <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center mb-6 bg-green-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">2️⃣ Upload Original CSV</h3>
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
                <p className="text-sm text-gray-700 mt-4">
                  {products.length > 0 ? 'Ready to match images!' : 'Use the same CSV you used for product import'}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Review & Edit Matched Images */}
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
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-green-800 text-sm">
                  <strong>✅ Found {productsWithImages.filter(p => p.images.length > 0).length}/{productsWithImages.length} products with images.</strong> Review below and add/remove images as needed.
                </p>
              </div>

              <div className="space-y-6 mb-6 max-h-[600px] overflow-y-auto">
                {productsWithImages.map((product, productIndex) => (
                  <div key={product.reference} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">{product.name}</h3>
                        <p className="text-sm text-gray-600">Reference: {product.reference} • Color: {product.colorCode}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        product.images.length > 0 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {product.images.length} {product.images.length === 1 ? 'image' : 'images'}
                      </span>
                    </div>

                    {/* Image Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
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
                            title="Remove image"
                          >
                            ✕
                          </button>
                          <p className="text-xs text-gray-600 mt-1 truncate" title={image.name}>
                            {image.name}
                          </p>
                        </div>
                      ))}
                      
                      {/* Add Image Button */}
                      <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded hover:border-blue-500 hover:bg-blue-50 transition-colors">
                        <label className="cursor-pointer text-center p-2">
                          <div className="text-3xl text-gray-400 mb-1">+</div>
                          <div className="text-xs text-gray-600">Add Image</div>
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
              <div className="flex gap-4">
                <button
                  onClick={uploadImagesToOdoo}
                  disabled={loading || productsWithImages.every(p => p.images.length === 0)}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 font-bold text-lg shadow-lg"
                >
                  🚀 Upload {productsWithImages.reduce((sum, p) => sum + p.images.length, 0)} Images to {productsWithImages.length} Products
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {loading ? '⏳ Uploading Images...' : '✅ Upload Complete'}
              </h2>
              
              {loading && (
                <div className="mb-6">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(uploadResults.length / productsWithImages.length) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-center text-sm text-gray-600 mt-2">
                    Uploading {uploadResults.length}/{productsWithImages.length} products...
                  </p>
                </div>
              )}

              {!loading && (
                <>
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
                        {uploadResults.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0)}
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
                      setProducts([]);
                      setProductsWithImages([]);
                      setUploadResults([]);
                      setLocalImages([]);
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    🔄 New Upload
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
