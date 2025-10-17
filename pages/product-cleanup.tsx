import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

interface Product {
  id: number;
  name: string;
  default_code: string;
  variant_count?: number;
  active: boolean;
}

interface ArchiveResult {
  templateId: number;
  success: boolean;
  variantsCleared?: number;
  message: string;
}

type Step = 'load' | 'select' | 'preview' | 'archiving' | 'results';

export default function ProductCleanup() {
  const router = useRouter();
  const [odooUid, setOdooUid] = useState('');
  const [odooPassword, setOdooPassword] = useState('');
  
  // Step tracking
  const [currentStep, setCurrentStep] = useState<Step>('load');
  
  // Data
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [selectedProductDetails, setSelectedProductDetails] = useState<Product[]>([]);
  
  // States
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveResults, setArchiveResults] = useState<ArchiveResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Check authentication on mount and validate cache
  useEffect(() => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');

    if (!uid || !password) {
      router.push('/');
      return;
    }

    setOdooUid(uid);
    setOdooPassword(password);

    // Validate cache on mount
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('product_cleanup_cache');
      if (cached) {
        try {
          JSON.parse(cached);
        } catch {
          console.warn('⚠️ Clearing corrupted cache on mount');
          sessionStorage.removeItem('product_cleanup_cache');
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter products based on search query
  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const filtered = products.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        (p.default_code && p.default_code.toLowerCase().includes(query))
    );
    setFilteredProducts(filtered);
  }, [searchQuery, products]);

  // Fetch all products from Odoo with caching
  const fetchProducts = async (forceRefresh = false) => {
    console.log('🔄 Fetching products...');
    if (!odooUid || !odooPassword) {
      console.error('❌ Not authenticated');
      setError('Not authenticated. Please log in first.');
      router.push('/');
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh && typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('product_cleanup_cache');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const cacheAge = Date.now() - cachedData.timestamp;
          // Cache valid for 30 minutes
          if (cacheAge < 30 * 60 * 1000 && Array.isArray(cachedData.products)) {
            console.log('✅ Using cached products data');
            setProducts(cachedData.products);
            setFilteredProducts(cachedData.products);
            setCurrentStep('select');
            return;
          } else {
            console.log('⏰ Cache expired, fetching fresh data...');
            sessionStorage.removeItem('product_cleanup_cache');
          }
        } catch (e) {
          console.warn('⚠️ Failed to parse cache, clearing corrupted data:', e);
          sessionStorage.removeItem('product_cleanup_cache');
        }
      }
    }

    setLoading(true);
    setError(null);
    try {
      console.log('📤 Step 1/2: Fetching all products...');
      const productsResponse = await fetch('/api/odoo-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'product.template',
          method: 'search_read',
          args: [[]],
          kwargs: { fields: ['id', 'name', 'default_code', 'active'] },
          uid: odooUid,
          password: odooPassword,
        }),
      });

      if (!productsResponse.ok) {
        const text = await productsResponse.text();
        const errorMsg = `HTTP ${productsResponse.status}: ${text.substring(0, 100)}`;
        setError(errorMsg);
        console.error('❌ Response not OK:', errorMsg);
        return;
      }

      const productsData = await productsResponse.json();
      
      if (!productsData.success) {
        const errorMsg = typeof productsData.error === 'object' ? JSON.stringify(productsData.error) : String(productsData.error);
        setError(`API Error: ${errorMsg}`);
        console.error('📡 API Error:', productsData.error);
        return;
      }

      console.log(`✅ Loaded ${productsData.result.length} products`);
      
      // Step 2: Fetch ALL variant counts in ONE call using read_group
      console.log('📤 Step 2/2: Fetching all variant counts in one call...');
      const variantsResponse = await fetch('/api/odoo-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'product.product',
          method: 'read_group',
          args: [
            [], // all variants
            ['product_tmpl_id'], // fields to read
            ['product_tmpl_id'] // group by template
          ],
          uid: odooUid,
          password: odooPassword,
        }),
      });

      const variantsData = await variantsResponse.json();
      console.log(`✅ Loaded variant counts for all products`);
      
      // Create a map of template_id -> variant_count
      const variantCountMap: Record<number, number> = {};
      if (variantsData.success && Array.isArray(variantsData.result)) {
        variantsData.result.forEach((group: { product_tmpl_id: [number, string]; product_tmpl_id_count: number }) => {
          if (group.product_tmpl_id && Array.isArray(group.product_tmpl_id)) {
            variantCountMap[group.product_tmpl_id[0]] = group.product_tmpl_id_count || 0;
          }
        });
      }

      // Merge products with their variant counts
      const productsWithVariants = productsData.result.map((p: Product) => ({
        ...p,
        variant_count: variantCountMap[p.id] || 0,
      }));

      console.log(`✅ Complete! ${productsWithVariants.length} products with variant counts`);
      
      setProducts(productsWithVariants);
      setFilteredProducts(productsWithVariants);
      setCurrentStep('select');
      
      // Cache the complete result
      if (typeof window !== 'undefined') {
        try {
          const cacheData = {
            products: productsWithVariants,
            timestamp: Date.now(),
          };
          sessionStorage.setItem('product_cleanup_cache', JSON.stringify(cacheData));
          console.log('💾 Products cached to sessionStorage');
        } catch (e) {
          console.warn('⚠️ Failed to cache products:', e);
          sessionStorage.removeItem('product_cleanup_cache');
        }
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setError(errorMsg);
      console.error('❌ Fetch failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle product selection
  const toggleProduct = (templateId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedProducts(newSelected);
  };

  // Toggle all products
  const toggleAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // Go to preview
  const goToPreview = () => {
    const details = products.filter(p => selectedProducts.has(p.id));
    setSelectedProductDetails(details);
    setCurrentStep('preview');
  };

  // Archive selected products
  const archiveSelected = async () => {
    if (selectedProducts.size === 0) {
      alert('Please select products to archive');
      return;
    }

    if (!confirm(`Archive ${selectedProducts.size} product(s)? This will:\n\n✓ Clear all barcodes\n✓ Mark as not for sale\n✓ Hide from POS\n✓ Archive the product\n\nThis action cannot be undone.`)) {
      return;
    }

    setArchiving(true);
    setArchiveResults([]);
    setCurrentStep('archiving');

    try {
      const response = await fetch('/api/archive-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateIds: Array.from(selectedProducts),
          uid: odooUid,
          password: odooPassword,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setArchiveResults(data.results);
        setCurrentStep('results');
      } else {
        alert('Error: ' + data.error);
        setCurrentStep('preview');
      }
    } catch (error) {
      alert('Error: ' + error);
      setCurrentStep('preview');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Product Cleanup - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🗑️ Product Cleanup</h1>
          <p className="text-lg text-gray-800 mb-8">Search, select, and archive products with automatic barcode clearing</p>

          {/* Step Indicator */}
          <div className="flex justify-between mb-8 max-w-2xl">
            {['load', 'select', 'preview', 'archiving', 'results'].map((step, idx) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    currentStep === step
                      ? 'bg-blue-600 text-white'
                      : ['load', 'select', 'preview', 'archiving', 'results'].indexOf(currentStep) > idx
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-700'
                  }`}
                >
                  {idx + 1}
                </div>
                {idx < 4 && <div className="flex-1 h-1 mx-2 bg-gray-300" />}
              </div>
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-red-800 font-medium">❌ Error: {error}</p>
            </div>
          )}

          {/* Step 1: Load Products */}
          {currentStep === 'load' && (
            <div className="bg-white rounded-lg shadow p-8 max-w-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Step 1: Load Products</h2>
              <p className="text-gray-800 mb-6">
                Click the button below to load all products from your database.
                {typeof window !== 'undefined' && sessionStorage.getItem('product_cleanup_cache') && (
                  <span className="block mt-2 text-sm text-green-700">💾 Cached data available (faster loading)</span>
                )}
              </p>
              <button
                onClick={() => fetchProducts(false)}
                disabled={loading}
                className="px-8 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium text-lg"
              >
                {loading ? '⏳ Loading products...' : '🔍 Load All Products'}
              </button>
            </div>
          )}

          {/* Step 2: Select Products */}
          {currentStep === 'select' && (
            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Step 2: Select Products to Archive</h2>
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      sessionStorage.removeItem('product_cleanup_cache');
                      console.log('🗑️ Cache cleared');
                    }
                    setCurrentStep('load');
                    setSelectedProducts(new Set());
                    fetchProducts(true);
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:bg-gray-300 font-medium"
                  title="Clear cache and refresh product list from database"
                >
                  {loading ? '⏳ Refreshing...' : '🔄 Refresh from DB'}
                </button>
              </div>
              
              <div className="mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded px-4 py-2 text-gray-900 text-base"
                  placeholder="Search by product name, reference, or brand..."
                />
                <p className="text-sm text-gray-700 mt-3">
                  Showing {filteredProducts.length} of {products.length} products | Selected: {selectedProducts.size}
                </p>
              </div>

              {/* Products Table */}
              <div className="overflow-x-auto mb-6 max-h-96 overflow-y-auto border border-gray-200 rounded">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                          onChange={toggleAll}
                          className="cursor-pointer w-4 h-4"
                        />
                      </th>
                      <th className="p-3 text-left font-bold text-gray-900">Product Name</th>
                      <th className="p-3 text-left font-bold text-gray-900">Reference</th>
                      <th className="p-3 text-left font-bold text-gray-900">Variants</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b hover:bg-blue-50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            className="cursor-pointer w-4 h-4"
                          />
                        </td>
                        <td className="p-3 font-medium text-gray-900">{product.name}</td>
                        <td className="p-3 text-gray-800 font-mono text-sm">{product.default_code || '-'}</td>
                        <td className="p-3 text-gray-800">{product.variant_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setCurrentStep('load');
                    setSelectedProducts(new Set());
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-900 rounded hover:bg-gray-50 font-medium"
                >
                  ← Back
                </button>
                <button
                  onClick={goToPreview}
                  disabled={selectedProducts.size === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                >
                  Next: Preview ({selectedProducts.size}) →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {currentStep === 'preview' && (
            <div className="bg-white rounded-lg shadow p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Step 3: Preview & Confirm</h2>
              
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                <p className="text-yellow-800 font-medium">⚠️ Important: The following actions will be performed:</p>
                <ul className="text-yellow-800 text-sm mt-2 list-disc ml-5">
                  <li>Remove all product attributes</li>
                  <li>Clear all barcodes from variants</li>
                  <li>Mark products as NOT for sale</li>
                  <li>Hide from POS (Kassa)</li>
                  <li>Archive the products</li>
                </ul>
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-4">Products to Archive ({selectedProductDetails.length}):</h3>
              <div className="overflow-x-auto mb-6 max-h-64 overflow-y-auto border border-gray-200 rounded">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-3 text-left font-bold text-gray-900">Product</th>
                      <th className="p-3 text-left font-bold text-gray-900">Reference</th>
                      <th className="p-3 text-left font-bold text-gray-900">Variants</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProductDetails.map((product) => (
                      <tr key={product.id} className="border-b">
                        <td className="p-3 font-medium text-gray-900">{product.name}</td>
                        <td className="p-3 text-gray-800 font-mono text-sm">{product.default_code || '-'}</td>
                        <td className="p-3 text-gray-800">{product.variant_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => setCurrentStep('select')}
                  className="px-6 py-2 border border-gray-300 text-gray-900 rounded hover:bg-gray-50 font-medium"
                >
                  ← Back to Selection
                </button>
                <button
                  onClick={archiveSelected}
                  disabled={archiving}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 font-medium"
                >
                  {archiving ? '⏳ Archiving...' : `🗑️ Archive ${selectedProducts.size} Product(s)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Archiving (Progress) */}
          {currentStep === 'archiving' && (
            <div className="bg-white rounded-lg shadow p-8 max-w-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Step 4: Processing...</h2>
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
              <p className="text-center text-gray-800">Archiving products and clearing barcodes...</p>
            </div>
          )}

          {/* Step 5: Results */}
          {currentStep === 'results' && (
            <div className="bg-white rounded-lg shadow p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Step 5: Archive Complete</h2>
              
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Results:</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {archiveResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded ${
                        result.success
                          ? 'bg-green-50 border-l-4 border-green-500 text-green-800'
                          : 'bg-red-50 border-l-4 border-red-500 text-red-800'
                      }`}
                    >
                      <p className="font-medium">
                        {result.success ? '✅' : '❌'} {selectedProductDetails.find(p => p.id === result.templateId)?.name || `Product ${result.templateId}`}
                      </p>
                      <p className="text-sm">{result.message}</p>
                      {result.variantsCleared && (
                        <p className="text-sm">Barcodes cleared: {result.variantsCleared}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setCurrentStep('load');
                    setSelectedProducts(new Set());
                    setProducts([]);
                    setFilteredProducts([]);
                    setSearchQuery('');
                    setArchiveResults([]);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                >
                  🔄 Archive More Products
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
