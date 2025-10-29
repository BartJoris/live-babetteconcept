import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import Head from 'next/head';
import Image from 'next/image';

interface ProductToFetch {
  reference: string;
  description: string;
  colorCode: string;
  colorName?: string;
  templateId: number | null;  // null if not found in Odoo
  name: string;
  foundInOdoo: boolean;  // Whether product was found
  searchedNames?: string[];  // Names that were searched
}

interface ProductWithImages extends ProductToFetch {
  images: File[];
}

export default function PlayUpImagesImport() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [products, setProducts] = useState<ProductToFetch[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }>>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [localImages, setLocalImages] = useState<File[]>([]);
  const [productFilter, setProductFilter] = useState<'all' | 'found' | 'notFound'>('all');
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [copyCommand, setCopyCommand] = useState('');
  const [eanData, setEANData] = useState<Array<{
    reference: string;
    description: string;
    size: string;
    colourCode: string;
    colourDescription: string;
  }>>([]);

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  // Handle EAN CSV upload
  const handleEANUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const products: typeof eanData = [];
    
    // Skip first 2 lines ("Table 1" and headers)
    for (let i = 2; i < lines.length; i++) {
      const parts = lines[i].split(';').map(p => p.trim());
      if (parts.length >= 5 && parts[0]) {
        products.push({
          reference: parts[0],      // PA01/1AR11002
          description: parts[1],
          size: parts[2],
          colourCode: parts[3],
          colourDescription: parts[4],
        });
      }
    }
    
    setEANData(products);
    console.log(`📋 Loaded ${products.length} EAN entries`);
  };

  // Handle image list txt upload
  const handleImageListUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const images = text.split('\n').map(line => line.trim()).filter(line => line && line.endsWith('.jpg'));
    
    setAvailableImages(images);
    console.log(`📋 Loaded ${images.length} available images`);
    
    // Generate copy command if products are loaded
    if (products.length > 0) {
      console.log(`📋 Products available, generating copy command...`);
      const neededImages: string[] = [];
      
      for (const product of products) {
        const pattern = `${product.reference}_`;
        const matchingImages = images.filter(img => img.startsWith(pattern));
        neededImages.push(...matchingImages);
      }
      
      if (neededImages.length > 0) {
        const command = `mkdir -p matched_images_playup && cp ${neededImages.join(' ')} matched_images_playup/`;
        setCopyCommand(command);
        console.log(`📋 Generated copy command for ${neededImages.length} images`);
      }
    }
  };

  // Generate terminal command to copy only needed images
  const generateCopyCommand = (prods: ProductWithImages[], imageList: string[]) => {
    const neededImages: string[] = [];
    
    for (const product of prods) {
      // Match images for this product: {Article}_{Color}_*.jpg
      const pattern = `${product.reference}_`;
      const matchingImages = imageList.filter(img => img.startsWith(pattern));
      neededImages.push(...matchingImages);
    }
    
    if (neededImages.length === 0) {
      setCopyCommand('# No matching images found');
      return;
    }
    
    const command = `mkdir -p matched_images_playup && cp ${neededImages.join(' ')} matched_images_playup/`;
    setCopyCommand(command);
    
    console.log(`📋 Generated copy command for ${neededImages.length} images`);
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
        const fullReference = `${reference}_${colorCode}`;
        
        // Find the full PA01/... reference from EAN data if available
        const eanEntry = eanData.find(ean => {
          const eanArticle = ean.reference.split('/')[1];
          return eanArticle === reference && ean.colourCode === colorCode;
        });
        
        // Use PA01/... format if found in EAN, otherwise use article_color
        const searchReference = eanEntry ? eanEntry.reference : fullReference;
        
        console.log(`  Searching for ${reference} ${colorCode}`);
        console.log(`    EAN reference: "${searchReference}"`);
        console.log(`    Simple reference: "${fullReference}"`);
        
        // Try multiple search strategies
        let product = null;
        
        // Strategy 1: Search variants by default_code with ilike (for PA01/...)
        let response = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'product.product',
            method: 'search_read',
            args: [[
              ['default_code', 'ilike', `%${reference}%${colorCode}%`],
              ['active', '=', true]  // Only active (non-archived) products
            ]],
            kwargs: {
              fields: ['id', 'name', 'default_code', 'product_tmpl_id'],
              limit: 1,
            },
            uid,
            password,
          }),
        });

        let result = await response.json();
        const variant = result.success && result.result && result.result.length > 0 ? result.result[0] : null;
        
        if (variant) {
          // Check if the template is also active (not archived)
          const templateId = variant.product_tmpl_id[0];
          const templateCheck = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.template',
              method: 'read',
              args: [[templateId], ['active', 'name']],
              uid,
              password,
            }),
          });
          
          const templateResult = await templateCheck.json();
          const template = templateResult.success && templateResult.result && templateResult.result.length > 0 ? templateResult.result[0] : null;
          
          if (template && template.active) {
            product = {
              id: templateId,
              name: variant.product_tmpl_id[1],
              default_code: variant.default_code,
            };
            console.log(`  ✅ Found via variant SKU pattern: ${product.name}`);
          } else {
            console.log(`  ⚠️ Variant found but template is archived`);
          }
        } else {
          // Strategy 2: Search template by default_code
          console.log(`    Trying template with: "${searchReference}"`);
          response = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.template',
              method: 'search_read',
              args: [[
                ['default_code', '=', fullReference],
                ['active', '=', true]  // Only active (non-archived) products
              ]],
              kwargs: {
                fields: ['id', 'name', 'default_code'],
                limit: 1,
              },
              uid,
              password,
            }),
          });

          result = await response.json();
          product = result.success && result.result && result.result.length > 0 ? result.result[0] : null;
          if (product) {
            console.log(`  ✅ Found via template SKU: ${product.name}`);
          } else {
            console.log(`  ❌ Not found with SKU searches`);
          }
        }

        if (product) {
          parsed.push({
            reference: fullReference,
            description,
            colorCode,
            colorName: '',
            templateId: product.id,
            name: product.name,
            foundInOdoo: true,
            searchedNames: [`default_code: ${fullReference}`],
          });
          found++;
          console.log(`  ✅ Found: Template ${product.id} - ${product.name}`);
        } else {
          // Add to list even if not found, so user can see and manually handle
          parsed.push({
            reference: fullReference,
            description,
            colorCode,
            colorName: '',
            templateId: null,
            name: `${description} (${colorCode})`,  // Display name
            foundInOdoo: false,
            searchedNames: [`Searched by default_code: ${fullReference}`],
          });
          console.warn(`  ❌ Not found in Odoo by default_code: ${fullReference}`);
          notFound++;
        }
      }

      console.log(`📊 Results: ${found} found, ${notFound} not found`);

      // Always show products, even if some are not found
      setProducts(parsed);
      setCurrentStep(2);
      setLoading(false);
      
      console.log(`✅ Ready to match images for ${parsed.length} products`);
      
      // Generate copy command if image list is already loaded
      if (availableImages.length > 0) {
        console.log(`📋 Image list available, generating copy command...`);
        const neededImages: string[] = [];
        
        for (const product of parsed) {
          // Match images for this product: {Article}_{Color}_*.jpg
          const pattern = `${product.reference}_`;
          const matchingImages = availableImages.filter(img => img.startsWith(pattern));
          neededImages.push(...matchingImages);
        }
        
        if (neededImages.length > 0) {
          const command = `mkdir -p matched_images_playup && cp ${neededImages.join(' ')} matched_images_playup/`;
          setCopyCommand(command);
          console.log(`📋 Generated copy command for ${neededImages.length} images`);
        }
      }
      
      if (found === 0) {
        alert(`⚠️ No products found in Odoo!\n\nCSV products: ${productMap.size}\nFound in Odoo: 0\n\nProducts are listed below. You may need to import them first.`);
      } else if (notFound > 0) {
        alert(`⚠️ Partial match:\n\n✅ Found: ${found}\n❌ Not found: ${notFound}\n\nNot-found products are marked in red below.`);
      } else {
        alert(`✅ Found all ${found} products in Odoo!\n\nNow you can match the images.`);
      }
      
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
      // Product reference is now in format: article_color (e.g., "1AR11002_P6179")
      const images = imageMap.get(product.reference) || [];
      
      return {
        ...product,
        images,
      };
    });

    setProductsWithImages(matched);
    setCurrentStep(2);
    
    const totalImages = matched.reduce((sum, p) => sum + p.images.length, 0);
    const prodsWithImages = matched.filter(p => p.images.length > 0).length;
    console.log(`✅ Matched ${totalImages} images to ${prodsWithImages}/${matched.length} products`);
    
    // Generate copy command if image list is available
    if (availableImages.length > 0) {
      generateCopyCommand(matched, availableImages);
    }
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
      // Skip products not found in Odoo
      if (!product.foundInOdoo || !product.templateId) {
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: 'Product not found in Odoo - cannot upload images',
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
                <h3 className="font-bold text-lg mb-4 text-gray-900">2️⃣ Upload Delivery CSV</h3>
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

              {/* Upload EAN Retail List (Recommended) */}
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">3️⃣ Upload EAN Retail List (Recommended)</h3>
                <p className="text-sm text-gray-700 mb-4">
                  Upload EAN retail CSV to find products by their full internal reference
                </p>
                <div className="text-4xl mb-3">📊</div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleEANUpload}
                  className="hidden"
                  id="ean-upload"
                />
                <label
                  htmlFor="ean-upload"
                  className="bg-blue-600 text-white px-6 py-3 rounded inline-block font-medium hover:bg-blue-700 cursor-pointer"
                >
                  {eanData.length > 0 ? `✅ ${eanData.length} EAN entries` : '📊 Upload EAN CSV'}
                </label>
                <p className="text-xs text-gray-600 mt-4">
                  Same file as used for product import (EAN-Table 1.csv)
                </p>
              </div>

              {/* Upload Image List (Optional) */}
              <div className="border-2 border-dashed border-orange-300 rounded-lg p-8 text-center bg-orange-50">
                <h3 className="font-bold text-lg mb-4 text-gray-900">4️⃣ Upload Image List (Optional)</h3>
                <p className="text-sm text-gray-700 mb-4">
                  Upload a .txt file with list of available images to generate a copy command
                </p>
                <div className="text-4xl mb-3">📋</div>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleImageListUpload}
                  className="hidden"
                  id="imagelist-upload"
                />
                <label
                  htmlFor="imagelist-upload"
                  className="bg-purple-600 text-white px-6 py-3 rounded inline-block font-medium hover:bg-purple-700 cursor-pointer"
                >
                  {availableImages.length > 0 ? `✅ ${availableImages.length} images listed` : '📋 Upload Image List'}
                </label>
                <p className="text-xs text-gray-600 mt-4">
                  Format: One image filename per line (e.g., 1AR11002_P6179_1.jpg)
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

              {/* Summary Cards */}
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
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <div className="text-sm text-red-600 font-medium">Not Found in Odoo</div>
                  <div className="text-3xl font-bold text-red-700">
                    {productsWithImages.filter(p => !p.foundInOdoo).length}
                  </div>
                  {productsWithImages.some(p => !p.foundInOdoo) && (
                    <div className="text-xs text-red-600 mt-1">
                      ⚠️ These products cannot have images uploaded
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-green-800 text-sm">
                  <strong>✅ Found {productsWithImages.filter(p => p.images.length > 0).length}/{productsWithImages.length} products with images.</strong> Review below and add/remove images as needed.
                </p>
                {productsWithImages.some(p => !p.foundInOdoo) && (
                  <p className="text-orange-700 text-sm mt-2">
                    <strong>⚠️ Red-bordered products were not found in Odoo.</strong> Import these products first before uploading images.
                  </p>
                )}
              </div>

              {/* Copy Command */}
              {copyCommand && (
                <div className="bg-gray-900 text-green-400 rounded-lg p-4 mb-6 font-mono text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-white font-bold">📋 Terminal Copy Command:</div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(copyCommand);
                        alert('Command copied to clipboard!');
                      }}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                    >
                      📋 Copy Command
                    </button>
                  </div>
                  <div className="bg-black bg-opacity-50 p-3 rounded overflow-x-auto">
                    <code className="whitespace-pre-wrap break-all">{copyCommand}</code>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    💡 Run this command in your images folder to copy only the needed images and save bandwidth
                  </p>
                  <div className="mt-3 p-3 bg-blue-900 rounded">
                    <p className="text-xs text-blue-300">
                      <strong>Matched Images:</strong> {copyCommand.split(' ').filter(s => s.endsWith('.jpg')).length} files
                    </p>
                  </div>
                </div>
              )}

              {/* Filter Tabs */}
              {productsWithImages.some(p => !p.foundInOdoo) && (
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
                  <button
                    onClick={() => setProductFilter('notFound')}
                    className={`px-4 py-2 rounded font-medium ${
                      productFilter === 'notFound'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Not Found ({productsWithImages.filter(p => !p.foundInOdoo).length})
                  </button>
                </div>
              )}

              <div className="space-y-6 mb-6 max-h-[600px] overflow-y-auto">
                {productsWithImages
                  .filter(p => {
                    if (productFilter === 'found') return p.foundInOdoo;
                    if (productFilter === 'notFound') return !p.foundInOdoo;
                    return true;  // 'all'
                  })
                  .map((product, productIndex) => (
                  <div key={product.reference} className={`border rounded-lg p-4 ${
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
                              NOT FOUND IN ODOO
                            </span>
                          )}
                          {product.foundInOdoo && product.templateId && (
                            <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full font-semibold">
                              ID: {product.templateId}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Reference: {product.reference} • Color: {product.colorCode}</p>
                        {!product.foundInOdoo && product.searchedNames && (
                          <details className="mt-2">
                            <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                              Why not found? (click to see search details)
                            </summary>
                            <div className="text-xs text-gray-600 mt-1 ml-4">
                              <p>Searched for:</p>
                              <ul className="list-disc ml-4">
                                {product.searchedNames.map((name, i) => (
                                  <li key={i} className="font-mono">{name}</li>
                                ))}
                              </ul>
                              <p className="mt-1 text-orange-600">
                                Product may need to be imported first, or name doesn&apos;t match Odoo.
                              </p>
                            </div>
                          </details>
                        )}
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
                  disabled={loading || productsWithImages.filter(p => p.foundInOdoo).every(p => p.images.length === 0)}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 font-bold text-lg shadow-lg"
                >
                  🚀 Upload {productsWithImages.filter(p => p.foundInOdoo).reduce((sum, p) => sum + p.images.length, 0)} Images to {productsWithImages.filter(p => p.foundInOdoo).length} Products
                </button>
              </div>
              {productsWithImages.some(p => !p.foundInOdoo) && (
                <p className="text-sm text-orange-600 mt-2 text-center">
                  ⚠️ {productsWithImages.filter(p => !p.foundInOdoo).length} product(s) not found in Odoo will be skipped
                </p>
              )}
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
