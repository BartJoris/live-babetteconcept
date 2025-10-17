import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

interface ParsedProduct {
  reference: string;
  name: string;
  originalName: string;
  templateId?: number;
}

interface VendorProduct {
  title: string;
  handle: string;
  images: Array<{ src: string }>;
}

interface MatchedProduct extends ParsedProduct {
  vendorMatch?: VendorProduct;
  matchStrategy?: 'reference' | 'name' | 'none';
}

export default function ProductImagesImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [vendorUrl, setVendorUrl] = useState('https://www.hellosimone.fr/');
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }>>([]);

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

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 3) return;

    const headers = lines[1].split(';');
    const products: { [key: string]: ParsedProduct } = {};

    for (let i = 2; i < lines.length; i++) {
      const values = lines[i].split(';');
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx]?.trim() || '';
      });

      const reference = row['Product reference'];
      const productName = row['Product name'];
      const brandName = row['Brand name'];

      if (!reference || !productName) continue;

      if (!products[reference]) {
        const toTitleCase = (str: string) => str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const toSentenceCase = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        const formattedName = brandName ? `${toTitleCase(brandName)} - ${toSentenceCase(productName)}` : toSentenceCase(productName);

        products[reference] = {
          reference,
          name: formattedName,
          originalName: productName,
        };
      }
    }

    setParsedProducts(Object.values(products));
    setCurrentStep(2);
  };

  const fetchVendorProducts = async () => {
    setLoading(true);
    try {
      const allProducts: VendorProduct[] = [];
      
      const url1 = `${vendorUrl}/products.json?limit=250`;
      const response1 = await fetch(url1);
      if (response1.ok) {
        const data1 = await response1.json();
        if (data1.products) allProducts.push(...data1.products);
      }

      if (allProducts.length === 250) {
        try {
          const url2 = `${vendorUrl}/products.json?limit=250&page=2`;
          const response2 = await fetch(url2);
          if (response2.ok) {
            const data2 = await response2.json();
            if (data2.products) allProducts.push(...data2.products);
          }
        } catch {}
      }

      setVendorProducts(allProducts);
      matchProducts(parsedProducts, allProducts);
    } catch (error) {
      console.error('Error fetching vendor products:', error);
      alert('Fout bij ophalen van producten van website');
    } finally {
      setLoading(false);
    }
  };

  const matchProducts = (csvProducts: ParsedProduct[], vendorProds: VendorProduct[]) => {
    const matched: MatchedProduct[] = csvProducts.map(product => {
      let vendorMatch: VendorProduct | undefined;
      let matchStrategy: 'reference' | 'name' | 'none' = 'none';

      // Strategy 1: Match by reference
      const refLower = product.reference.toLowerCase();
      vendorMatch = vendorProds.find(vp => {
        const titleLower = vp.title.toLowerCase();
        const handleLower = vp.handle.toLowerCase();
        return titleLower.includes(refLower) || handleLower.includes(refLower);
      });

      if (vendorMatch) {
        matchStrategy = 'reference';
      } else {
        // Strategy 2: Match by name
        const nameLower = product.originalName.toLowerCase();
        const matches = vendorProds.filter(vp => {
          const titleLower = vp.title.toLowerCase();
          return titleLower === nameLower || titleLower.includes(nameLower) || nameLower.includes(titleLower);
        });

        if (matches.length > 0) {
          matches.sort((a, b) => {
            if (a.title.toLowerCase() === nameLower) return -1;
            if (b.title.toLowerCase() === nameLower) return 1;
            return 0;
          });
          vendorMatch = matches[0];
          matchStrategy = 'name';
        }
      }

      return {
        ...product,
        vendorMatch,
        matchStrategy,
      };
    });

    setMatchedProducts(matched);
    const autoSelect = new Set(matched.filter(m => m.vendorMatch && m.vendorMatch.images?.length > 0).map(m => m.reference));
    setSelectedProducts(autoSelect);
    setCurrentStep(3);
  };

  const uploadImages = async () => {
    setLoading(true);
    const results: Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }> = [];

    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden');
      setLoading(false);
      return;
    }

    for (const product of matchedProducts.filter(p => selectedProducts.has(p.reference))) {
      if (!product.vendorMatch || !product.vendorMatch.images || product.vendorMatch.images.length === 0) {
        results.push({ reference: product.reference, success: false, imagesUploaded: 0, error: 'No images available' });
        continue;
      }

      try {
        console.log(`🔍 Searching for product in Odoo: ${product.reference}`);
        
        // Try to find product by reference first
        let searchResponse = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            password,
            model: 'product.template',
            method: 'search_read',
            args: [[['default_code', '=', product.reference]]],
            kwargs: { fields: ['id', 'name', 'display_name'] },
          }),
        });

        let searchResult = await searchResponse.json();
        
        // If not found by reference, try by name
        if (!searchResult.success || !searchResult.result || searchResult.result.length === 0) {
          console.log(`⚠️ Not found by reference, trying by name: ${product.name}`);
          searchResponse = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid,
              password,
              model: 'product.template',
              method: 'search_read',
              args: [[['name', 'ilike', product.name]]],
              kwargs: { fields: ['id', 'name', 'display_name'], limit: 1 },
            }),
          });
          searchResult = await searchResponse.json();
        }
        
        if (!searchResult.success || !searchResult.result || searchResult.result.length === 0) {
          console.error(`❌ Product not found: ${product.reference} / ${product.name}`);
          results.push({ reference: product.reference, success: false, imagesUploaded: 0, error: 'Product not found in Odoo' });
          continue;
        }

        const templateId = searchResult.result[0].id;
        console.log(`✅ Found product in Odoo: ${searchResult.result[0].display_name} (ID: ${templateId})`);
        const imageUrls = product.vendorMatch.images.slice(0, 3).map(img => img.src);
        let uploadedCount = 0;

        for (let i = 0; i < imageUrls.length; i++) {
          try {
            console.log(`📥 Downloading image ${i + 1}/${imageUrls.length}: ${imageUrls[i]}`);
            
            // Download image
            const imgResponse = await fetch(imageUrls[i]);
            if (!imgResponse.ok) {
              throw new Error(`HTTP ${imgResponse.status}`);
            }
            
            const imgBuffer = await imgResponse.arrayBuffer();
            console.log(`✅ Downloaded ${imgBuffer.byteLength} bytes`);
            
            const base64 = Buffer.from(imgBuffer).toString('base64');
            console.log(`🔄 Converted to base64 (${base64.length} chars)`);

            // First image: Set as main product image only
            if (i === 0) {
              console.log(`🖼️ Setting image 1 as main product image...`);
              // Update product template with main image
              const mainImageResponse = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid,
                  password,
                  model: 'product.template',
                  method: 'write',
                  args: [[templateId], { image_1920: base64 }],
                }),
              });
              const mainImageResult = await mainImageResponse.json();
              if (mainImageResult.success) {
                uploadedCount++;
                console.log(`✅ Set as main product image`);
              }
            } else {
              // Additional images (2nd, 3rd): Add to eCommerce media only
              console.log(`☁️ Uploading image ${i + 1} to eCommerce media (template ID: ${templateId})...`);
              const uploadResponse = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid,
                  password,
                  model: 'product.image',
                  method: 'create',
                  args: [{
                    name: `Image ${i + 1}`,
                    product_tmpl_id: templateId,
                    image_1920: base64,
                    sequence: i + 1,
                  }],
                }),
              });

              const uploadResult = await uploadResponse.json();
              if (uploadResult.success && uploadResult.result) {
                uploadedCount++;
                console.log(`✅ Uploaded image ${i + 1} to eCommerce media (Odoo ID: ${uploadResult.result})`);
              } else {
                console.error(`❌ Upload failed for image ${i + 1}:`, uploadResult.error);
              }
            }
          } catch (imgError) {
            const err = imgError as { message?: string };
            console.error(`❌ Failed to upload image ${i + 1}: ${err.message}`);
          }
        }

        console.log(`🎉 Product ${product.reference}: Uploaded ${uploadedCount}/${imageUrls.length} images`);
        results.push({ reference: product.reference, success: uploadedCount > 0, imagesUploaded: uploadedCount });
      } catch (error) {
        const err = error as { message?: string };
        results.push({ reference: product.reference, success: false, imagesUploaded: 0, error: err.message });
      }
    }

    setUploadResults(results);
    setLoading(false);
    setCurrentStep(4);
  };

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  const toggleProduct = (reference: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(reference)) {
      newSelected.delete(reference);
    } else {
      newSelected.add(reference);
    }
    setSelectedProducts(newSelected);
  };

  const matchedWithImages = matchedProducts.filter(p => p.vendorMatch && p.vendorMatch.images?.length > 0);
  const matchedWithoutImages = matchedProducts.filter(p => p.vendorMatch && (!p.vendorMatch.images || p.vendorMatch.images.length === 0));
  const unmatchedProducts = matchedProducts.filter(p => !p.vendorMatch);

  return (
    <>
      <Head>
        <title>Product Images Import - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              📸 Product Images Import
            </h1>
            <p className="text-gray-800">
              Upload afbeeldingen van leverancier website naar bestaande producten in Odoo
            </p>
          </div>

          {/* Step 1: Upload CSV */}
          {currentStep === 1 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1️⃣ Upload Product CSV</h2>
              
              <div className="mb-6">
                <label className="block font-medium text-gray-700 mb-2">
                  Leverancier Website URL
                </label>
                <input
                  type="url"
                  value={vendorUrl}
                  onChange={(e) => setVendorUrl(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded px-3 py-2 mb-4"
                  placeholder="https://www.hellosimone.fr/"
                />
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <div className="text-4xl mb-3">📄</div>
                <h3 className="font-bold text-gray-900 mb-2">Upload Le New Black CSV</h3>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="bg-blue-600 text-white px-6 py-2 rounded cursor-pointer hover:bg-blue-700 inline-block"
                >
                  Kies bestand
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Fetch from Website */}
          {currentStep === 2 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2️⃣ Match Products met Website</h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
                <p className="text-blue-800">
                  ✅ {parsedProducts.length} producten geladen uit CSV
                </p>
              </div>

              <button
                onClick={fetchVendorProducts}
                disabled={loading}
                className="bg-purple-600 text-white px-6 py-3 rounded hover:bg-purple-700 disabled:bg-gray-400 text-lg"
              >
                {loading ? '⏳ Bezig met laden...' : '📡 Fetch Products van Website & Match'}
              </button>

              {vendorProducts.length > 0 && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded p-4">
                  <p className="text-green-800">
                    ✅ {vendorProducts.length} producten geladen van {vendorUrl}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review Matches & Select */}
          {currentStep === 3 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3️⃣ Selecteer Producten voor Image Upload</h2>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <div className="text-green-600 text-sm mb-1">Met Afbeeldingen</div>
                  <div className="text-3xl font-bold">{matchedWithImages.length}</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <div className="text-yellow-600 text-sm mb-1">Gevonden zonder Afbeeldingen</div>
                  <div className="text-3xl font-bold">{matchedWithoutImages.length}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <div className="text-red-600 text-sm mb-1">Niet Gevonden</div>
                  <div className="text-3xl font-bold">{unmatchedProducts.length}</div>
                </div>
              </div>

              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setSelectedProducts(new Set(matchedWithImages.map(p => p.reference)))}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  ✓ Selecteer Alles met Afbeeldingen
                </button>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  ✗ Deselecteer Alles
                </button>
                <div className="ml-auto bg-blue-50 px-4 py-2 rounded">
                  <strong>{selectedProducts.size}</strong> producten geselecteerd
                </div>
              </div>

              {/* Products with Images */}
              {matchedWithImages.length > 0 && (
                <>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 text-green-700">✅ Producten met Afbeeldingen ({matchedWithImages.length})</h3>
                  <div className="space-y-4 mb-8">
                    {matchedWithImages.map(product => (
                      <div key={product.reference} className={`border rounded-lg p-4 ${selectedProducts.has(product.reference) ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-4">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.reference)}
                            onChange={() => toggleProduct(product.reference)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="font-bold">{product.name}</div>
                            <div className="text-sm text-gray-800">{product.reference}</div>
                            <div className="text-xs text-blue-600 mt-1">
                              Match: {product.vendorMatch?.title} ({product.matchStrategy === 'reference' ? '🎯 Reference' : '📝 Name'})
                            </div>
                            
                            {product.vendorMatch?.images && (
                              <div className="mt-3 flex gap-2">
                                {product.vendorMatch.images.slice(0, 3).map((img, idx) => (
                                  <Image 
                                    key={idx}
                                    src={img.src} 
                                    alt=""
                                    className="w-24 h-24 object-cover rounded border"
                                    width={96}
                                    height={96}
                                  />
                                ))}
                                <div className="text-xs text-gray-500 self-center">
                                  {product.vendorMatch.images.length} afbeeldingen (max 3 worden geüpload)
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Products without Images */}
              {matchedWithoutImages.length > 0 && (
                <>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 text-yellow-700">⚠️ Gevonden maar geen Afbeeldingen ({matchedWithoutImages.length})</h3>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-8">
                    {matchedWithoutImages.map(p => (
                      <div key={p.reference} className="text-sm text-yellow-800">
                        • {p.name} ({p.reference}) - Match: {p.vendorMatch?.title}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Unmatched Products */}
              {unmatchedProducts.length > 0 && (
                <>
                  <h3 className="font-bold text-lg text-gray-900 mb-3 text-red-700">❌ Niet Gevonden op Website ({unmatchedProducts.length})</h3>
                  <div className="bg-red-50 border border-red-200 rounded p-4 mb-8">
                    {unmatchedProducts.map(p => (
                      <div key={p.reference} className="text-sm text-red-800">
                        • {p.name} ({p.reference})
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-2 border rounded hover:bg-gray-100"
                >
                  ← Terug
                </button>
                <button
                  onClick={uploadImages}
                  disabled={selectedProducts.size === 0 || loading}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
                >
                  {loading ? '⏳ Uploaden...' : `📤 Upload ${selectedProducts.size} Producten naar Odoo`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {currentStep === 4 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">✅ Upload Voltooid!</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <div className="text-green-600 text-sm mb-1">Succesvol</div>
                  <div className="text-3xl font-bold">{uploadResults.filter(r => r.success).length}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <div className="text-red-600 text-sm mb-1">Mislukt</div>
                  <div className="text-3xl font-bold">{uploadResults.filter(r => !r.success).length}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Reference</th>
                      <th className="p-2 text-left">Afbeeldingen</th>
                      <th className="p-2 text-left">Bericht</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResults.map((result, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">
                          {result.success ? (
                            <span className="text-green-600">✅</span>
                          ) : (
                            <span className="text-red-600">❌</span>
                          )}
                        </td>
                        <td className="p-2">{result.reference}</td>
                        <td className="p-2">
                          {result.imagesUploaded > 0 ? (
                            <span className="text-green-600">📸 {result.imagesUploaded}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-2 text-xs text-gray-800">{result.error || 'Success'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => {
                    setCurrentStep(1);
                    setParsedProducts([]);
                    setVendorProducts([]);
                    setMatchedProducts([]);
                    setSelectedProducts(new Set());
                    setUploadResults([]);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  🔄 Nieuwe Upload
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

