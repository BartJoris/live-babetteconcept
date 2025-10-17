import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

interface Product {
  title: string;
  handle: string;
  images?: Array<{ src: string }>;
  variants?: Array<{ title: string; sku?: string }>;
}

export default function ImageFetchDebug() {
  const [vendorUrl, setVendorUrl] = useState('https://www.hellosimone.fr/');
  const [searchReference, setSearchReference] = useState('');
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [matchedProducts, setMatchedProducts] = useState<Product[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchProducts = async () => {
    setLoading(true);
    setErrorMessage('');
    setAllProducts([]);
    setMatchedProducts([]);

    try {
      console.log(`📡 Fetching products from: ${vendorUrl}`);
      
      const products: Product[] = [];
      
      // Fetch page 1
      const url1 = `${vendorUrl}/products.json?limit=250`;
      const response1 = await fetch(url1);
      
      if (!response1.ok) {
        throw new Error(`HTTP ${response1.status}: ${response1.statusText}`);
      }
      
      const data1 = await response1.json();
      if (data1.products) {
        products.push(...data1.products);
      }
      
      console.log(`✅ Fetched ${data1.products?.length || 0} products from page 1`);
      
      // Try page 2
      if (data1.products?.length === 250) {
        try {
          const url2 = `${vendorUrl}/products.json?limit=250&page=2`;
          const response2 = await fetch(url2);
          if (response2.ok) {
            const data2 = await response2.json();
            if (data2.products) {
              products.push(...data2.products);
              console.log(`✅ Fetched ${data2.products.length} products from page 2`);
            }
          }
        } catch {
          console.log('Page 2 not available');
        }
      }
      
      setAllProducts(products);
      console.log(`✅ Total products loaded: ${products.length}`);
      
    } catch (error) {
      console.error('Error fetching products:', error);
      const err = error as { message?: string };
      setErrorMessage(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const searchProducts = () => {
    if (!searchReference && !searchName) {
      setMatchedProducts([]);
      return;
    }

    const matches: Product[] = [];

    // Search by reference
    if (searchReference) {
      const refLower = searchReference.toLowerCase();
      const refMatches = allProducts.filter(p => {
        const titleLower = p.title.toLowerCase();
        const handleLower = p.handle.toLowerCase();
        return titleLower.includes(refLower) || handleLower.includes(refLower);
      });
      matches.push(...refMatches);
      console.log(`🔍 Found ${refMatches.length} matches by reference "${searchReference}"`);
    }

    // Search by name (if no reference matches)
    if (matches.length === 0 && searchName) {
      const nameLower = searchName.toLowerCase();
      const nameMatches = allProducts.filter(p => {
        const titleLower = p.title.toLowerCase();
        return titleLower.includes(nameLower) || nameLower.includes(titleLower);
      });
      matches.push(...nameMatches);
      console.log(`🔍 Found ${nameMatches.length} matches by name "${searchName}"`);
    }

    setMatchedProducts(matches);
  };

  return (
    <>
      <Head>
        <title>Image Fetch Debug - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🐛 Image Fetch Debug Tool
            </h1>
            <p className="text-gray-800">
              Test product matching and image fetching from vendor websites
            </p>
          </div>

          {/* Configuration */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">1️⃣ Configure Vendor Website</h2>
            
            <div className="mb-4">
              <label className="block font-medium text-gray-700 mb-2">
                Vendor Website URL
              </label>
              <input
                type="url"
                value={vendorUrl}
                onChange={(e) => setVendorUrl(e.target.value)}
                className="w-full border-2 border-gray-300 rounded px-3 py-2"
                placeholder="https://www.hellosimone.fr/"
              />
            </div>

            <button
              onClick={fetchProducts}
              disabled={loading || !vendorUrl}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? '⏳ Laden...' : '📡 Fetch Products from Website'}
            </button>

            {errorMessage && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-red-800">
                ❌ {errorMessage}
              </div>
            )}

            {allProducts.length > 0 && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded p-3 text-green-800">
                ✅ Loaded {allProducts.length} products from website
              </div>
            )}
          </div>

          {/* Search */}
          {allProducts.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">2️⃣ Search Products</h2>
              
              <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Let op:</strong> Vul hieronder de waarden in <strong>zoals ze in je CSV staan</strong>:
                </p>
                <ul className="text-xs text-yellow-700 mt-2 ml-4 list-disc">
                  <li><strong>Product Reference</strong> = kolom &quot;Product reference&quot; (bijv. AW25-BFLJC)</li>
                  <li><strong>Product Name</strong> = kolom &quot;Product name&quot; (bijv. Bear fleece jacket Cookie)</li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block font-medium text-gray-700">
                      🎯 Product Reference (Strategy 1)
                    </label>
                    {searchReference && (
                      <button
                        onClick={() => setSearchReference('')}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={searchReference}
                    onChange={(e) => {
                      setSearchReference(e.target.value);
                      // Clear name field when typing in reference
                      if (e.target.value && searchName) setSearchName('');
                    }}
                    className="w-full border-2 border-blue-300 bg-blue-50 rounded px-3 py-2 font-mono text-sm"
                    placeholder="Typ reference: AW25-BFLJC"
                  />
                  <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-2 text-xs">
                    <strong>CSV kolom:</strong> <code className="bg-white px-1 rounded">Product reference</code><br/>
                    <strong>Format:</strong> AW25-XXXX (bijv. AW25-BFLJC, AW25-MIRVC, AW25-MALPFBL)
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block font-medium text-gray-700">
                      📝 Product Name (Strategy 2)
                    </label>
                    {searchName && (
                      <button
                        onClick={() => setSearchName('')}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={searchName}
                    onChange={(e) => {
                      setSearchName(e.target.value);
                      // Clear reference field when typing in name
                      if (e.target.value && searchReference) setSearchReference('');
                    }}
                    className="w-full border-2 border-gray-300 bg-gray-50 rounded px-3 py-2 text-sm"
                    placeholder="Typ naam: Bear fleece jacket Cookie"
                  />
                  <div className="bg-gray-50 border border-gray-200 rounded p-2 mt-2 text-xs">
                    <strong>CSV kolom:</strong> <code className="bg-white px-1 rounded">Product name</code><br/>
                    <strong>Voorbeelden:</strong> Bear fleece jacket Cookie, Malika pants Flora blue
                  </div>
                </div>
              </div>

              <button
                onClick={searchProducts}
                disabled={!searchReference && !searchName}
                className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700 disabled:bg-gray-400"
              >
                🔍 Search
              </button>

              {matchedProducts.length > 0 && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3 text-blue-800">
                  ℹ️ Found {matchedProducts.length} matching product(s)
                  {matchedProducts.length > 1 && (
                    <span className="block mt-1 text-sm">
                      ⚠️ Multiple matches - consider using product reference for unique match
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {matchedProducts.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📸 Matched Products & Images</h2>
              
              <div className="space-y-6">
                {matchedProducts.map((product, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="mb-3">
                      <h3 className="text-lg font-bold text-gray-900">{product.title}</h3>
                      <p className="text-sm text-gray-800">Handle: {product.handle}</p>
                      {product.variants && product.variants.length > 0 && (
                        <p className="text-sm text-gray-800">
                          Variants: {product.variants.length}
                          {product.variants[0]?.sku && ` (SKU: ${product.variants[0].sku})`}
                        </p>
                      )}
                    </div>

                    {product.images && product.images.length > 0 ? (
                      <div>
                        <h4 className="font-medium mb-2 text-gray-900">
                          📸 Images ({product.images.length} found, {Math.min(3, product.images.length)} will be imported)
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                          {product.images.slice(0, 3).map((img, imgIdx) => (
                            <div key={imgIdx} className="border rounded p-2">
                              <Image 
                                src={img.src} 
                                alt={`${product.title} - Image ${imgIdx + 1}`}
                                className="w-full h-48 object-cover rounded mb-2"
                                width={300}
                                height={192}
                              />
                              <p className="text-xs text-gray-500 break-all">
                                {img.src.split('/').pop()}
                              </p>
                              <a 
                                href={img.src}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Open in new tab →
                              </a>
                            </div>
                          ))}
                        </div>
                        {product.images.length > 3 && (
                          <p className="text-sm text-gray-500 mt-2">
                            + {product.images.length - 3} more images (not imported)
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-800">
                        ⚠️ No images found for this product
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Products List */}
          {allProducts.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">📋 All Products on Website ({allProducts.length})</h2>
              
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Product Title</th>
                      <th className="p-2 text-left">Handle</th>
                      <th className="p-2 text-left">Images</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProducts.map((product, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-gray-500">{idx + 1}</td>
                        <td className="p-2 font-medium">{product.title}</td>
                        <td className="p-2 text-xs text-gray-800">{product.handle}</td>
                        <td className="p-2">
                          {product.images?.length || 0 > 0 ? (
                            <span className="text-green-600">📸 {product.images?.length}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

