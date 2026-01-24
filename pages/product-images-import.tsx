import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/router';

interface ProductToFetch {
  reference: string;
  description: string;
  templateId: number | null;
  name: string;
  foundInOdoo: boolean;
  searchedNames?: string[];
}

interface ProductWithImages extends ProductToFetch {
  images: File[];
}

export default function Ao76ImagesImport() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<ProductToFetch[]>([]);
  const [productsWithImages, setProductsWithImages] = useState<ProductWithImages[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }>>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [localImages, setLocalImages] = useState<File[]>([]);
  const [productFilter, setProductFilter] = useState<'all' | 'found' | 'notFound'>('all');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentProduct?: string } | null>(null);

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  // Compress image to ensure it's under size limit
  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 1920px (standard for Odoo)
          const maxDim = 1920;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = (height / width) * maxDim;
              width = maxDim;
            } else {
              width = (width / height) * maxDim;
              height = maxDim;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to JPEG with quality 0.85 (good balance)
          const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
          resolve(base64);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Load matched products from ao76-image-matcher if available
  useEffect(() => {
    const matchedData = sessionStorage.getItem('ao76_matched_images');
    if (matchedData) {
      try {
        const data = JSON.parse(matchedData);
        console.log('📦 Loaded matched products from image matcher:', data);
        
        // Auto-load CSV data
        if (data.csvProducts && data.csvProducts.length > 0) {
          // Convert CSV products to CSV text and parse
          const headers = 'Reference;Description';
          const csvLines = [headers];
          
          const seenReferences = new Set<string>();
          data.csvProducts.forEach((p: any) => {
            if (!seenReferences.has(p.reference)) {
              csvLines.push(`${p.reference};${p.description}`);
              seenReferences.add(p.reference);
            }
          });
          
          const csvText = csvLines.join('\n');
          console.log('📦 Auto-loading CSV with', seenReferences.size, 'products');
          parseCSV(csvText);
          
          // Clear session storage after loading
          sessionStorage.removeItem('ao76_matched_images');
        }
      } catch (error) {
        console.error('Error loading matched data:', error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    
    console.log(`📦 Parsing AO76 CSV...`);
    console.log(`📦 Lines: ${lines.length}`);
    
    if (lines.length < 2) {
      alert('CSV is empty');
      return;
    }

    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`📦 Headers:`, headers);
    
    const productMap = new Map<string, { reference: string; description: string }>();

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(';').map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      const reference = row['Reference'] || row['reference'];
      const description = row['Description'] || row['description'] || '';

      if (reference) {
        if (!productMap.has(reference)) {
          productMap.set(reference, {
            reference,
            description,
          });
        }
      }
    }

    console.log(`📦 Found ${productMap.size} unique products in CSV`);

    if (productMap.size === 0) {
      alert('❌ Geen producten gevonden in CSV!\n\nControleer of de CSV het juiste format heeft:\nReference;Description;...');
      return;
    }

    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden. Log eerst in!');
      return;
    }

    console.log(`🔍 Starting Odoo search with credentials: uid=${uid}`);

    setLoading(true);
    const parsed: ProductToFetch[] = [];
    let found = 0;
    let notFound = 0;

    try {
      for (const { reference, description } of productMap.values()) {
        console.log(`  🔍 Searching for reference: "${reference}"`);
        
        let product = null;
        
        // Search by description field (internal note) where we store the reference
        console.log(`    Trying: description = "${reference}"`);
        const response = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'product.template',
            method: 'search_read',
            args: [[
              ['description', '=', reference],
              ['active', '=', true]
            ]],
            kwargs: {
              fields: ['id', 'name', 'description'],
              limit: 1,
            },
            uid,
            password,
          }),
        });

        if (!response.ok) {
          console.error(`    ❌ HTTP error: ${response.status}`);
          continue;
        }

        const result = await response.json();
        console.log(`    Response:`, result);
        product = result.success && result.result && result.result.length > 0 ? result.result[0] : null;

        if (product) {
          parsed.push({
            reference,
            description,
            templateId: product.id,
            name: product.name,
            foundInOdoo: true,
            searchedNames: [`description: ${reference}`],
          });
          found++;
          console.log(`  ✅ Found: Template ${product.id} - ${product.name}`);
        } else {
          parsed.push({
            reference,
            description,
            templateId: null,
            name: description || reference,
            foundInOdoo: false,
            searchedNames: [`Searched by description: ${reference}`],
          });
          console.warn(`  ❌ Not found in Odoo by description: ${reference}`);
          notFound++;
        }
      }

      console.log(`📊 Results: ${found} found, ${notFound} not found`);

      if (parsed.length === 0) {
        alert('❌ Geen producten gevonden in CSV. Controleer het bestand.');
        setLoading(false);
        return;
      }

      setProducts(parsed);
      
      // Initialize productsWithImages with empty image arrays
      const initialProductsWithImages: ProductWithImages[] = parsed.map(p => ({
        ...p,
        images: [],
      }));
      setProductsWithImages(initialProductsWithImages);
      
      setCurrentStep(2);
      setLoading(false);
      
      console.log(`✅ Ready to match images for ${parsed.length} products`);
      
      if (found === 0) {
        alert(`⚠️ Geen producten gevonden in Odoo!\n\nCSV bevat: ${productMap.size} producten\nGevonden: 0\n\nControleer of deze producten al geïmporteerd zijn in Odoo.`);
      } else if (notFound > 0) {
        alert(`⚠️ Gedeeltelijke match:\n\n✅ Gevonden: ${found}\n❌ Niet gevonden: ${notFound}\n\nJe kunt nu afbeeldingen selecteren voor de ${found} gevonden producten.`);
      } else {
        alert(`✅ Alle ${found} producten gevonden in Odoo!\n\nSelecteer nu de afbeeldingen.`);
      }
      
      if (localImages.length > 0) {
        matchImagesWithProducts(parsed);
      }
    } catch (error) {
      console.error('Error searching Odoo:', error);
      alert(`Error bij zoeken in Odoo: ${error}`);
      setLoading(false);
    }
  };

  const matchImagesWithProducts = (productsToMatch: ProductToFetch[] = products) => {
    if (localImages.length === 0 || productsToMatch.length === 0) return;

    // Create image map by reference (extract from filename)
    const imageMap = new Map<string, File[]>();
    localImages.forEach(file => {
      const filename = file.name;
      // Match pattern: 126-2003-103-000707-01.jpg → reference = 126-2003-103
      const match = filename.match(/^(\d+-\d+-\d+)/);
      
      if (match) {
        let reference = match[1];
        
        // Try mapping 126 → 225
        const mappedRef = reference.replace(/^126-/, '225-');
        
        // Use mapped reference if it exists in products
        const foundProduct = productsToMatch.find(p => p.reference === mappedRef);
        if (foundProduct) {
          reference = mappedRef;
        }
        
        if (!imageMap.has(reference)) {
          imageMap.set(reference, []);
        }
        imageMap.get(reference)!.push(file);
      }
    });

    // Match images with products
    const matched: ProductWithImages[] = productsToMatch.map(product => {
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
  };

  const handleImagesUploadAndMatch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    console.log(`📁 Selected ${files.length} local images`);
    setLocalImages(files);
    
    if (products.length > 0) {
      setTimeout(() => {
        matchImagesWithProducts(products);
      }, 100);
    }
  };

  const addImageToProduct = (productRef: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const newImages = Array.from(files);
    setProductsWithImages(products =>
      products.map(p =>
        p.reference === productRef
          ? { ...p, images: [...p.images, ...newImages] }
          : p
      )
    );
  };

  const removeImageFromProduct = (productRef: string, imageIndex: number) => {
    setProductsWithImages(products =>
      products.map(p => {
        if (p.reference === productRef) {
          const newImages = [...p.images];
          newImages.splice(imageIndex, 1);
          return { ...p, images: newImages };
        }
        return p;
      })
    );
  };

  const moveImageUp = (productRef: string, imageIndex: number) => {
    if (imageIndex === 0) return;
    setProductsWithImages(products =>
      products.map(p => {
        if (p.reference === productRef) {
          const images = [...p.images];
          [images[imageIndex - 1], images[imageIndex]] = [images[imageIndex], images[imageIndex - 1]];
          return { ...p, images };
        }
        return p;
      })
    );
  };

  const moveImageDown = (productRef: string, imageIndex: number) => {
    setProductsWithImages(products =>
      products.map(p => {
        if (p.reference === productRef) {
          const images = [...p.images];
          if (imageIndex >= images.length - 1) return p;
          [images[imageIndex], images[imageIndex + 1]] = [images[imageIndex + 1], images[imageIndex]];
          return { ...p, images };
        }
        return p;
      })
    );
  };

  const setAsMainImage = (productRef: string, imageIndex: number) => {
    if (imageIndex === 0) return;
    setProductsWithImages(products =>
      products.map(p => {
        if (p.reference === productRef) {
          const images = [...p.images];
          const [mainImage] = images.splice(imageIndex, 1);
          images.unshift(mainImage);
          return { ...p, images };
        }
        return p;
      })
    );
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

    const productsToUpload = productsWithImages.filter(p => p.foundInOdoo && p.templateId && p.images.length > 0);
    setUploadProgress({ current: 0, total: productsToUpload.length });

    let processedCount = 0;
    for (const product of productsWithImages) {
      if (!product.foundInOdoo || !product.templateId) {
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: 'Product not found in Odoo',
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

      processedCount++;
      setUploadProgress({ 
        current: processedCount, 
        total: productsToUpload.length,
        currentProduct: product.reference 
      });

      try {
        // Step 1: Delete existing gallery images to prevent duplicates
        console.log(`Checking for existing gallery images...`);
        const existingImagesResponse = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'product.image',
            method: 'search_read',
            args: [[['product_tmpl_id', '=', product.templateId]]],
            kwargs: { fields: ['id'] },
            uid,
            password,
          }),
        });

        const existingImagesResult = await existingImagesResponse.json();
        if (existingImagesResult.success && existingImagesResult.result?.length > 0) {
          const imageIds = existingImagesResult.result.map((img: any) => img.id);
          console.log(`  Deleting ${imageIds.length} existing gallery images...`);
          
          await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.image',
              method: 'unlink',
              args: [imageIds],
              uid,
              password,
            }),
          });
        }

        let uploadedCount = 0;

        for (let i = 0; i < product.images.length; i++) {
          const imageFile = product.images[i];
          
          try {
            // Compress image to ensure it's under size limit
            const base64Image = await compressImage(imageFile);
            
            if (i === 0) {
              // First image: set as main product image (always overwrite)
              const response = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'product.template',
                  method: 'write',
                  args: [[product.templateId], { image_1920: base64Image }],
                  uid,
                  password,
                }),
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
              }

              const result = await response.json();
              if (result.success) {
                uploadedCount++;
              } else {
                console.error(`Failed to upload main image: ${result.error}`);
              }
            } else {
              // Additional images: add to gallery
              const response = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'product.image',
                  method: 'create',
                  args: [{
                    name: `${product.reference} - Image ${i + 1}`,
                    product_tmpl_id: product.templateId,
                    image_1920: base64Image,
                    sequence: i + 1,
                  }],
                  uid,
                  password,
                }),
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
              }

              const result = await response.json();
              if (result.success) {
                uploadedCount++;
              } else {
                console.error(`Failed to upload gallery image ${i + 1}: ${result.error}`);
              }
            }
          } catch (imageError) {
            console.error(`Error uploading image ${i + 1} for ${product.reference}:`, imageError);
            // Continue with next image even if this one fails
          }
        }

        results.push({
          reference: product.reference,
          success: uploadedCount > 0,
          imagesUploaded: uploadedCount,
          error: uploadedCount === 0 ? 'Failed to upload any images' : uploadedCount < product.images.length ? `${uploadedCount}/${product.images.length} uploaded` : undefined,
        });
      } catch (error) {
        console.error(`Error processing ${product.reference}:`, error);
        results.push({
          reference: product.reference,
          success: false,
          imagesUploaded: 0,
          error: String(error),
        });
      }
      
      // Update results in real-time so user can see progress
      setUploadResults([...results]);
    }

    setUploadProgress(null);
    setUploadResults(results);
    setLoading(false);
    setCurrentStep(3);

    const successCount = results.filter(r => r.success).length;
    const totalImages = results.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0);
    alert(`✅ Upload voltooid!\n\n${successCount}/${results.length} producten\n${totalImages} afbeeldingen geüpload`);
  };

  const filteredProducts = productsWithImages.filter(product => {
    if (productFilter === 'found') return product.foundInOdoo;
    if (productFilter === 'notFound') return !product.foundInOdoo;
    return true;
  });

  if (!isLoggedIn && !authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">⚠️ Access Denied</h1>
          <p className="text-gray-600">Please log in to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>AO76 Images Import - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🖼️ AO76 Afbeeldingen Upload</h1>
          <p className="text-gray-600 mb-4">Upload afbeeldingen voor AO76 producten</p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              💡 <strong>Tip:</strong> Gebruik eerst de{' '}
              <button
                onClick={() => router.push('/ao76-image-matcher')}
                className="text-blue-600 underline hover:text-blue-800"
              >
                AO76 Image Matcher
              </button>
              {' '}om afbeeldingen te matchen met producten. Dan worden ze hier automatisch geladen!
            </p>
          </div>

          {/* Step 1: Upload CSV */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Stap 1: Upload AO76 CSV</h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                <p className="text-sm text-blue-800">
                  💡 Upload het CSV bestand dat je gebruikt hebt voor product import (bijv. leverancier.csv of Order-87967.csv).
                  De referenties worden gebruikt om producten in Odoo te zoeken.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📄 AO76 CSV (leverancier.csv of Order-87967.csv)
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">Format: Reference;Description;...</p>
                </div>

                {loading && (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Zoeken in Odoo...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Match Images */}
          {currentStep === 2 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Stap 2: Match Afbeeldingen</h2>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📁 Select Images
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagesUploadAndMatch}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">Select all images from folder (Cmd+A / Ctrl+A)</p>
              </div>

              {/* Filter buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setProductFilter('all')}
                  className={`px-4 py-2 rounded ${productFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  Alle ({productsWithImages.length})
                </button>
                <button
                  onClick={() => setProductFilter('found')}
                  className={`px-4 py-2 rounded ${productFilter === 'found' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
                >
                  Gevonden ({productsWithImages.filter(p => p.foundInOdoo).length})
                </button>
                <button
                  onClick={() => setProductFilter('notFound')}
                  className={`px-4 py-2 rounded ${productFilter === 'notFound' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
                >
                  Niet gevonden ({productsWithImages.filter(p => !p.foundInOdoo).length})
                </button>
              </div>

              {/* Products list */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {filteredProducts.map((product) => (
                  <div
                    key={product.reference}
                    className={`border-2 rounded-lg p-4 ${
                      !product.foundInOdoo 
                        ? 'bg-red-50 border-red-300' 
                        : product.images.length > 0 
                          ? 'bg-green-50 border-green-300'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg">{product.reference}</h3>
                          {product.images.length > 0 && (
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
                              {product.images.length} afb.
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{product.name}</p>
                        {!product.foundInOdoo && (
                          <p className="text-xs text-red-600 mt-1 font-medium">❌ Niet gevonden in Odoo</p>
                        )}
                      </div>
                    </div>

                    {product.foundInOdoo && (
                      <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3">
                        <label className="block text-xs font-medium text-blue-800 mb-2">
                          📁 Afbeeldingen toevoegen
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => addImageToProduct(product.reference, e.target.files)}
                          className="block w-full text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                        />
                      </div>
                    )}

                    {product.images.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-600 mb-2">
                          💡 Eerste afbeelding = hoofdafbeelding. Klik op ⭐ om als hoofd in te stellen.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {product.images.map((img, imgIdx) => (
                            <div key={imgIdx} className="relative border-2 rounded-lg p-2 bg-white" style={{ width: '120px' }}>
                              {imgIdx === 0 && (
                                <div className="absolute -top-2 -left-2 bg-yellow-400 text-white rounded-full px-2 py-0.5 text-xs font-bold z-10">
                                  HOOFD
                                </div>
                              )}
                              <img
                                src={URL.createObjectURL(img)}
                                alt={`${product.reference} ${imgIdx + 1}`}
                                className="w-full h-24 object-cover rounded mb-2"
                              />
                              <div className="text-xs text-center text-gray-600 mb-2">
                                #{imgIdx + 1}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => moveImageUp(product.reference, imgIdx)}
                                  disabled={imgIdx === 0}
                                  className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded px-1 py-1 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Omhoog"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveImageDown(product.reference, imgIdx)}
                                  disabled={imgIdx === product.images.length - 1}
                                  className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded px-1 py-1 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Omlaag"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => setAsMainImage(product.reference, imgIdx)}
                                  disabled={imgIdx === 0}
                                  className="flex-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded px-1 py-1 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Als hoofd"
                                >
                                  ⭐
                                </button>
                                <button
                                  onClick={() => removeImageFromProduct(product.reference, imgIdx)}
                                  className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 rounded px-1 py-1 text-xs"
                                  title="Verwijder"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Upload info banner */}
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Let op:</strong> Bestaande gallery afbeeldingen worden eerst verwijderd en dan vervangen door de nieuwe. 
                  Dit voorkomt dubbele afbeeldingen bij herhaalde uploads.
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  Klaar voor upload: <strong>{productsWithImages.filter(p => p.foundInOdoo && p.images.length > 0).length} producten</strong> 
                  {' • '}
                  <strong>{productsWithImages.reduce((sum, p) => sum + (p.foundInOdoo ? p.images.length : 0), 0)} afbeeldingen</strong>
                </p>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  ← Terug
                </button>
                <button
                  onClick={uploadImagesToOdoo}
                  disabled={productsWithImages.filter(p => p.foundInOdoo && p.images.length > 0).length === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  🚀 Upload naar Odoo ({productsWithImages.filter(p => p.foundInOdoo && p.images.length > 0).length} producten)
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Upload Resultaten</h2>
              
              {loading && uploadProgress ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">
                    Afbeeldingen uploaden... {uploadProgress.current}/{uploadProgress.total}
                  </p>
                  {uploadProgress.currentProduct && (
                    <p className="text-sm text-gray-500 mt-2">
                      Bezig met: {uploadProgress.currentProduct}
                    </p>
                  )}
                  <div className="mt-4 max-w-md mx-auto">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">Afbeeldingen uploaden...</p>
                </div>
              ) : (
                <div>
                  {/* Statistics */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-50 border border-green-200 rounded p-4">
                      <div className="text-green-600 text-sm mb-1">Succesvol</div>
                      <div className="text-2xl font-bold">{uploadResults.filter(r => r.success).length}</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded p-4">
                      <div className="text-red-600 text-sm mb-1">Gefaald</div>
                      <div className="text-2xl font-bold">{uploadResults.filter(r => !r.success).length}</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded p-4">
                      <div className="text-blue-600 text-sm mb-1">Totaal Images</div>
                      <div className="text-2xl font-bold">{uploadResults.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0)}</div>
                    </div>
                  </div>

                  {/* Results list */}
                  <div className="space-y-4">
                  {uploadResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`border rounded p-4 ${
                        result.success ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{result.reference}</span>
                        <div className="text-right">
                          <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                            {result.success
                              ? `✅ ${result.imagesUploaded} afbeeldingen`
                              : `❌ Gefaald`}
                          </span>
                          {result.error && (
                            <p className="text-xs text-gray-600 mt-1">{result.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>

                  <div className="mt-6 flex gap-4">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-6 py-2 bg-gray-200 rounded hover:bg-gray-300"
                    >
                      ← Terug naar Producten
                    </button>
                    {uploadResults.filter(r => !r.success).length > 0 && (
                      <button
                        onClick={async () => {
                          // Filter only failed products
                          const failedRefs = new Set(uploadResults.filter(r => !r.success).map(r => r.reference));
                          const allProducts = productsWithImages;
                          
                          // Keep full product list but only upload failed ones
                          setUploadResults([]);
                          setLoading(true);
                          setCurrentStep(3);
                          
                          const results: Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }> = [];
                          const productsToRetry = allProducts.filter(p => failedRefs.has(p.reference));
                          setUploadProgress({ current: 0, total: productsToRetry.length });

                          let processedCount = 0;
                          for (const product of productsToRetry) {
                            if (!product.foundInOdoo || !product.templateId || product.images.length === 0) {
                              continue;
                            }

                            processedCount++;
                            setUploadProgress({ 
                              current: processedCount, 
                              total: productsToRetry.length,
                              currentProduct: product.reference 
                            });

                            try {
                              // Delete existing gallery images
                              const existingImagesResponse = await fetch('/api/odoo-call', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  model: 'product.image',
                                  method: 'search_read',
                                  args: [[['product_tmpl_id', '=', product.templateId]]],
                                  kwargs: { fields: ['id'] },
                                  uid: getCredentials().uid,
                                  password: getCredentials().password,
                                }),
                              });

                              const existingImagesResult = await existingImagesResponse.json();
                              if (existingImagesResult.success && existingImagesResult.result?.length > 0) {
                                const imageIds = existingImagesResult.result.map((img: any) => img.id);
                                await fetch('/api/odoo-call', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    model: 'product.image',
                                    method: 'unlink',
                                    args: [imageIds],
                                    uid: getCredentials().uid,
                                    password: getCredentials().password,
                                  }),
                                });
                              }

                              let uploadedCount = 0;
                              for (let i = 0; i < product.images.length; i++) {
                                try {
                                  const base64Image = await compressImage(product.images[i]);
                                  
                                  if (i === 0) {
                                    const response = await fetch('/api/odoo-call', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        model: 'product.template',
                                        method: 'write',
                                        args: [[product.templateId], { image_1920: base64Image }],
                                        uid: getCredentials().uid,
                                        password: getCredentials().password,
                                      }),
                                    });

                                    if (response.ok) {
                                      const result = await response.json();
                                      if (result.success) uploadedCount++;
                                    }
                                  } else {
                                    const response = await fetch('/api/odoo-call', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        model: 'product.image',
                                        method: 'create',
                                        args: [{
                                          name: `${product.reference} - Image ${i + 1}`,
                                          product_tmpl_id: product.templateId,
                                          image_1920: base64Image,
                                          sequence: i + 1,
                                        }],
                                        uid: getCredentials().uid,
                                        password: getCredentials().password,
                                      }),
                                    });

                                    if (response.ok) {
                                      const result = await response.json();
                                      if (result.success) uploadedCount++;
                                    }
                                  }
                                } catch (imgErr) {
                                  console.error(`Image ${i + 1} failed:`, imgErr);
                                }
                              }

                              results.push({
                                reference: product.reference,
                                success: uploadedCount > 0,
                                imagesUploaded: uploadedCount,
                              });
                            } catch (error) {
                              results.push({
                                reference: product.reference,
                                success: false,
                                imagesUploaded: 0,
                                error: String(error),
                              });
                            }
                            
                            setUploadResults([...results]);
                          }

                          setUploadProgress(null);
                          setLoading(false);
                          
                          const successCount = results.filter(r => r.success).length;
                          alert(`✅ Retry voltooid!\n\n${successCount}/${productsToRetry.length} succesvol`);
                        }}
                        className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                      >
                        🔄 Retry Failed ({uploadResults.filter(r => !r.success).length})
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setCurrentStep(1);
                        setProducts([]);
                        setProductsWithImages([]);
                        setLocalImages([]);
                        setUploadResults([]);
                        setUploadProgress(null);
                      }}
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      🔄 Nieuwe Upload
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
