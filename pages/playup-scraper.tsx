import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface ScrapedProduct {
  article: string;
  name: string;
  pvpr: number;
  wholesalePrice: number;
  discountedPrice: number;
  productUrl: string;
}

export default function PlayUpScraper() {
  const [playupUsername, setPlayupUsername] = useState('');
  const [playupPassword, setPlayupPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [error, setError] = useState('');
  const [testResults, setTestResults] = useState<{
    htmlLength: number;
    counts: {
      imgTags: number;
      productItems: number;
      productSkus: number;
      priceMatches: number;
      viewMoreButton: boolean;
    };
    samples: {
      articles: string[];
      products: string[];
      urls: string[];
    };
    htmlSnippet: string;
    fullHtmlPreview: string;
  } | null>(null);

  // Load saved credentials
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUsername = localStorage.getItem('playup_username');
      const savedPassword = localStorage.getItem('playup_password');
      
      if (savedUsername) setPlayupUsername(savedUsername);
      if (savedPassword) setPlayupPassword(savedPassword);
    }
  }, []);

  const handleDebug = async () => {
    if (!playupUsername || !playupPassword) {
      alert('Vul Play UP credentials in');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/playup-debug-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: playupUsername,
          password: playupPassword,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('🧪 Debug results:', result);
        alert(`🧪 Pattern Test:\n\nURLs: ${result.patterns.urls_with_ngclick}\nNames: ${result.patterns.names}\nArticles: ${result.patterns.articles}\nPVPR: ${result.patterns.pvpr}\nWholesale: ${result.patterns.wholesale}\n\nMin match: ${result.minMatch}\n\nCheck console voor HTML sample!`);
      } else {
        setError(result.error || 'Unknown error');
        alert('❌ Debug mislukt: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      alert('❌ Fout: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!playupUsername || !playupPassword) {
      alert('Vul Play UP credentials in');
      return;
    }

    setLoading(true);
    setError('');
    setTestResults(null);

    try {
      const response = await fetch('/api/playup-test-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: playupUsername,
          password: playupPassword,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setTestResults(result.analysis);
        console.log('Test results:', result.analysis);
        alert(`✅ Test geslaagd!\n\nGevonden:\n- ${result.analysis.counts.productSkus} producten\n- ${result.analysis.counts.imgTags} afbeeldingen\n- ${result.analysis.counts.priceMatches} prijzen\n\nCheck console voor details`);
      } else {
        setError(result.error || 'Unknown error');
        alert('❌ Test mislukt: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      alert('❌ Fout: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    if (!playupUsername || !playupPassword) {
      alert('Vul Play UP credentials in');
      return;
    }

    setLoading(true);
    setError('');
    setProducts([]);

    try {
      const response = await fetch('/api/playup-scrape-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: playupUsername,
          password: playupPassword,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setProducts(result.products);
        
        // Save credentials
        localStorage.setItem('playup_username', playupUsername);
        localStorage.setItem('playup_password', playupPassword);
        
        alert(`✅ Success! ${result.count} producten gescraped`);
      } else {
        setError(result.error || 'Unknown error');
        alert('❌ Fout: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      alert('❌ Fout: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (products.length === 0) {
      alert('Geen producten om te downloaden');
      return;
    }

    // Create CSV content
    const headers = ['Article', 'Name', 'PVPR', 'WholesalePrice', 'DiscountedPrice', 'ProductURL'];
    const rows = products.map(p => [
      p.article,
      `"${p.name}"`,
      p.pvpr,
      p.wholesalePrice,
      p.discountedPrice,
      p.productUrl,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playup-products-with-urls-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head>
        <title>Play UP Product Scraper - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-8">
            <Link href="/dashboard" className="text-blue-600 hover:underline mb-4 inline-block">
              ← Terug naar Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🕷️ Play UP Product Scraper
            </h1>
            <p className="text-gray-600">
              Scrape alle producten van de Play UP website inclusief directe product URLs
            </p>
          </div>

          {/* Credentials */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Play UP Website Credentials</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username (Email)
                </label>
                <input
                  type="email"
                  value={playupUsername}
                  onChange={(e) => setPlayupUsername(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900"
                  placeholder="your-email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={playupPassword}
                  onChange={(e) => setPlayupPassword(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleDebug}
                disabled={loading || !playupUsername || !playupPassword}
                className="bg-orange-600 text-white px-4 py-3 rounded hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-bold"
              >
                {loading ? '⏳' : '🧪 Debug'}
              </button>
              <button
                onClick={handleTest}
                disabled={loading || !playupUsername || !playupPassword}
                className="bg-blue-600 text-white px-4 py-3 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-bold"
              >
                {loading ? '⏳' : '🔍 Test'}
              </button>
              <button
                onClick={handleScrape}
                disabled={loading || !playupUsername || !playupPassword}
                className="bg-purple-600 text-white px-4 py-3 rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-bold"
              >
                {loading ? '⏳' : '🚀 Scrape'}
              </button>
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded p-3">
                <p className="text-red-800">❌ {error}</p>
              </div>
            )}

            {testResults && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded p-4">
                <h3 className="font-bold text-green-900 mb-2">✅ Test Resultaten</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <strong>HTML Lengte:</strong> {testResults.htmlLength.toLocaleString()} chars
                  </div>
                  <div>
                    <strong>Afbeeldingen:</strong> {testResults.counts.imgTags}
                  </div>
                  <div>
                    <strong>Product SKUs:</strong> {testResults.counts.productSkus}
                  </div>
                  <div>
                    <strong>Prijzen:</strong> {testResults.counts.priceMatches}
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-green-800">
                    📋 Sample Data (klik om te tonen)
                  </summary>
                  <div className="mt-2 bg-white p-3 rounded text-xs overflow-x-auto">
                    <pre>{JSON.stringify(testResults.samples, null, 2)}</pre>
                  </div>
                </details>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-green-800">
                    📄 HTML Snippet (klik om te tonen)
                  </summary>
                  <div className="mt-2 bg-white p-3 rounded text-xs overflow-x-auto">
                    <pre>{testResults.htmlSnippet}</pre>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Results */}
          {products.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  📊 Resultaten: {products.length} producten
                </h2>
                <button
                  onClick={downloadCSV}
                  className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-medium"
                >
                  📥 Download CSV
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                <p className="text-blue-800 text-sm">
                  💡 <strong>Tip:</strong> Deze CSV bevat directe product URLs. 
                  Gebruik deze om snel afbeeldingen te downloaden zonder te hoeven zoeken!
                </p>
              </div>

              {/* Preview table */}
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Article</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">Wholesale</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-700">PVPR</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 50).map((product, idx) => (
                      <tr key={idx} className="border-t border-gray-200">
                        <td className="px-3 py-2 font-mono text-xs">{product.article}</td>
                        <td className="px-3 py-2">{product.name}</td>
                        <td className="px-3 py-2 text-right">€{product.wholesalePrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">€{product.pvpr.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          <a 
                            href={product.productUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Link →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {products.length > 50 && (
                  <p className="text-sm text-gray-600 mt-4 text-center">
                    Toont eerste 50 van {products.length} producten. Download CSV voor alle producten.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">📖 Hoe te gebruiken</h2>
            <ol className="list-decimal ml-5 space-y-2 text-gray-700">
              <li>Vul je Play UP website credentials in</li>
              <li>Klik op &quot;Start Scraping&quot; (duurt 10-30 seconden)</li>
              <li>Download de CSV met product URLs</li>
              <li>Gebruik deze CSV om direct afbeeldingen te downloaden per product</li>
            </ol>

            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-yellow-800 text-sm">
                ⚠️ <strong>Let op:</strong> Dit scrapet de huidige collectie. 
                Voor nieuwe producten moet je opnieuw scrapen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

