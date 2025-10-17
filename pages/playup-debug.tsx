import { useState } from 'react';
import Head from 'next/head';

export default function PlayUpDebug() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testArticle, setTestArticle] = useState('1AR11002');
  const [catalogUrl, setCatalogUrl] = useState('https://pro.playupstore.com/en/aw25-re-orders_371-434.html');
  const [loading, setLoading] = useState(false);
  const [loginResult, setLoginResult] = useState('');
  const [priceResult, setPriceResult] = useState('');
  const [catalogResult, setCatalogResult] = useState('');
  const [catalogPricesResult, setCatalogPricesResult] = useState('');
  const [allProductsResult, setAllProductsResult] = useState('');
  const [rawHtml, setRawHtml] = useState('');

  const testLogin = async () => {
    setLoading(true);
    setLoginResult('');
    setPriceResult('');
    setRawHtml('');

    try {
      const response = await fetch('/api/playup-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username,
          password,
        }),
      });

      const result = await response.json();
      setLoginResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setLoginResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const testFetchPrice = async () => {
    setLoading(true);
    setPriceResult('');
    setRawHtml('');

    try {
      const response = await fetch('/api/playup-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fetch_product',
          username,
          password,
          articleCode: testArticle,
        }),
      });

      const result = await response.json();
      setPriceResult(JSON.stringify(result, null, 2));
      if (result.html) {
        setRawHtml(result.html);
      }
    } catch (error) {
      setPriceResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const testCatalogAccess = async () => {
    setLoading(true);
    setCatalogResult('');
    setRawHtml('');

    try {
      const response = await fetch('/api/playup-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_catalog',
          catalogUrl,
        }),
      });

      const result = await response.json();
      setCatalogResult(JSON.stringify(result, null, 2));
      if (result.html) {
        setRawHtml(result.html);
      }
    } catch (error) {
      setCatalogResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const testCatalogPrices = async () => {
    if (!username || !password) {
      alert('Enter credentials first');
      return;
    }

    setLoading(true);
    setCatalogPricesResult('');

    try {
      const response = await fetch('/api/playup-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parse_catalog_prices',
          username,
          password,
          catalogUrl,
          articleCodes: ['1AR11002', '2AR11003', '3AR11002'], // Test articles
        }),
      });

      const result = await response.json();
      setCatalogPricesResult(JSON.stringify(result, null, 2));
      if (result.html) {
        setRawHtml(result.html);
      }
    } catch (error) {
      setCatalogPricesResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const extractAllProducts = async () => {
    if (!username || !password) {
      alert('Enter credentials first');
      return;
    }

    if (!confirm('This will fetch ALL products from the Play UP catalog. It may take 1-2 minutes. Continue?')) {
      return;
    }

    setLoading(true);
    setAllProductsResult('');
    setRawHtml('');

    try {
      const response = await fetch('/api/playup-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract_all_products',
          username,
          password,
        }),
      });

      const result = await response.json();
      setAllProductsResult(JSON.stringify(result, null, 2));
      
      // Download as CSV
      if (result.success && result.products) {
        const csv = 'Article,Name,PVPR,WholesalePrice,DiscountedPrice\n' + 
          result.products.map((p: { article: string; name: string; pvpr: number; wholesalePrice: number; discountedPrice: number }) => 
            `${p.article},"${p.name}",${p.pvpr},${p.wholesalePrice},${p.discountedPrice}`
          ).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'playup-all-products.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert(`✅ Extracted ${result.products.length} products!\nCSV file downloaded.`);
      }
    } catch (error) {
      setAllProductsResult('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Play UP Login Debug - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🐛 Play UP Website Login Debug
            </h1>
            <p className="text-gray-800">
              Test en debug Play UP website authenticatie en price fetching
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Credentials Form */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">🔐 Login Credentials</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Email/Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Test Article Code</label>
                  <input
                    type="text"
                    value={testArticle}
                    onChange={(e) => setTestArticle(e.target.value)}
                    placeholder="1AR11002"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Catalog URL (Optional)</label>
                  <input
                    type="text"
                    value={catalogUrl}
                    onChange={(e) => setCatalogUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full border rounded px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={testLogin}
                  disabled={!username || !password || loading}
                  className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:bg-gray-300 font-bold"
                >
                  {loading ? '⏳ Testing...' : '🧪 Test Login'}
                </button>
                <button
                  onClick={testCatalogAccess}
                  disabled={loading}
                  className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:bg-gray-300 font-bold"
                >
                  {loading ? '⏳ Checking...' : '📂 Check Catalog'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <button
                  onClick={testCatalogPrices}
                  disabled={!username || !password || loading}
                  className="bg-orange-600 text-white px-4 py-3 rounded hover:bg-orange-700 disabled:bg-gray-300 font-bold text-sm"
                >
                  {loading ? '⏳ Parsing...' : '🎯 Parse Catalog'}
                </button>
                <button
                  onClick={testFetchPrice}
                  disabled={!username || !password || !testArticle || loading}
                  className="bg-purple-600 text-white px-4 py-3 rounded hover:bg-purple-700 disabled:bg-gray-300 font-bold text-sm"
                >
                  {loading ? '⏳ Fetching...' : '💰 Fetch Single'}
                </button>
                <button
                  onClick={extractAllProducts}
                  disabled={!username || !password || loading}
                  className="bg-red-600 text-white px-4 py-3 rounded hover:bg-red-700 disabled:bg-gray-300 font-bold text-sm"
                >
                  {loading ? '⏳ Extracting...' : '📥 Extract ALL Products'}
                </button>
              </div>
            </div>

            {/* Login Result */}
            {loginResult && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">🔍 Login Test Result</h2>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto">
                  <pre className="text-xs font-mono">{loginResult}</pre>
                </div>
              </div>
            )}

            {/* Price Fetch Result */}
            {priceResult && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">💰 Product Fetch Result</h2>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono">{priceResult}</pre>
                </div>
              </div>
            )}

            {/* Catalog Result */}
            {catalogResult && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📂 Catalog Access Result</h2>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono">{catalogResult}</pre>
                </div>
              </div>
            )}

            {/* Catalog Prices Result */}
            {catalogPricesResult && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">🎯 Catalog Prices Extraction</h2>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono">{catalogPricesResult}</pre>
                </div>
              </div>
            )}

            {/* All Products Result */}
            {allProductsResult && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📥 All Products Extracted</h2>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono">{allProductsResult}</pre>
                </div>
              </div>
            )}

            {/* Raw HTML */}
            {rawHtml && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📄 Raw HTML Response</h2>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">{rawHtml.substring(0, 5000)}</pre>
                </div>
                {rawHtml.length > 5000 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Showing first 5000 characters of {rawHtml.length} total
                  </p>
                )}
              </div>
            )}

            {/* Instructions */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="font-bold text-yellow-800 text-gray-900 mb-3">📝 How to Use This Debug Page:</h3>
              <ol className="text-sm text-yellow-800 list-decimal ml-5 space-y-2">
                <li>Enter your Play UP website credentials (pro.playupstore.com)</li>
                <li>Click <strong>&quot;Test Login&quot;</strong> to verify credentials work</li>
                <li>Check the response - look for success status and session cookies</li>
                <li>Click <strong>&quot;Test Fetch Product&quot;</strong> to try fetching a product page</li>
                <li>Examine the HTML to understand the page structure</li>
                <li>Look for price patterns in the HTML (search for price, PVPR, €, etc.)</li>
              </ol>
              <div className="mt-4 p-3 bg-white rounded border border-yellow-300">
                <p className="text-xs text-yellow-900 font-medium">
                  🔍 What to look for in the response:
                </p>
                <ul className="text-xs text-yellow-800 list-disc ml-5 mt-2 space-y-1">
                  <li>Login success: Look for Set-Cookie headers or session tokens</li>
                  <li>HTML structure: Find where prices are displayed</li>
                  <li>Price format: Check if it&apos;s in euros (€), dollars ($), or plain numbers</li>
                  <li>Authentication: Check if login redirects or returns JSON</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

