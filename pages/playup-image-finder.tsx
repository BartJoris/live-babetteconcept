import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

export default function PlayUpImageFinder() {
  const [articleCode, setArticleCode] = useState('1AR10901');
  const [productName, setProductName] = useState('RIB LS T-SHIRT');
  const [playupUsername, setPlayupUsername] = useState('');
  const [playupPassword, setPlayupPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; images?: string[]; imageUrls?: string[]; productUrl?: string; error?: string; debugInfo?: unknown } | null>(null);

  const findProduct = async () => {
    if (!playupUsername || !playupPassword) {
      alert('Enter Play UP credentials first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/playup-find-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleCode,
          productName,
          username: playupUsername,
          password: playupPassword,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Play UP Image Finder - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🔍 Play UP Image Finder
            </h1>
            <p className="text-gray-800">
              Test tool to find a single product and extract image URLs
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            {/* Input Section */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Product Input</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Article Code</label>
                  <input
                    type="text"
                    value={articleCode}
                    onChange={(e) => setArticleCode(e.target.value)}
                    placeholder="1AR10901"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Product Name</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="RIB LS T-SHIRT"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Play UP Email</label>
                  <input
                    type="text"
                    value={playupUsername}
                    onChange={(e) => setPlayupUsername(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Play UP Password</label>
                  <input
                    type="password"
                    value={playupPassword}
                    onChange={(e) => setPlayupPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={findProduct}
                disabled={loading || !articleCode || !productName || !playupUsername || !playupPassword}
                className="w-full bg-blue-600 text-white px-6 py-4 rounded hover:bg-blue-700 disabled:bg-gray-300 font-bold text-lg"
              >
                {loading ? '⏳ Searching...' : '🔍 Find Product & Extract Images'}
              </button>
            </div>

            {/* Results */}
            {result && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Results</h2>
                
                {result.success ? (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                      <p className="text-green-800 font-medium">
                        ✅ Product Found!
                      </p>
                      <p className="text-sm text-green-700 mt-2">
                        {result.productUrl}
                      </p>
                    </div>

                    {result.imageUrls && result.imageUrls.length > 0 && (
                      <div className="mb-6">
                        <h3 className="font-bold text-gray-900 mb-3">📸 Found {result.imageUrls.length} Images:</h3>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          {result.imageUrls.map((url: string, idx: number) => (
                            <div key={idx} className="border rounded p-2">
                              <Image 
                                src={url} 
                                alt={`Image ${idx + 1}`}
                                className="w-full h-auto mb-2"
                                width={300}
                                height={300}
                              />
                              <a 
                                href={url} 
                                target="_blank" 
                                className="text-xs text-blue-600 hover:underline break-all"
                              >
                                Image {idx + 1}
                              </a>
                            </div>
                          ))}
                        </div>
                        
                        <div className="bg-gray-50 border rounded p-4">
                          <p className="text-sm font-medium mb-2">Image URLs:</p>
                          <div className="space-y-1">
                            {result.imageUrls.map((url: string, idx: number) => (
                              <div key={idx} className="text-xs font-mono break-all">
                                {idx + 1}. {url}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded p-4">
                      <p className="text-sm font-medium mb-2">Debug Info:</p>
                      <pre className="text-xs bg-white p-3 rounded overflow-x-auto">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded p-4">
                    <p className="text-red-800 font-medium mb-2">❌ Error</p>
                    <p className="text-sm text-red-700">{result.error || 'Unknown error'}</p>
                    {result.debugInfo != null && (
                      <pre className="text-xs bg-white p-3 rounded overflow-x-auto mt-3">
                        {JSON.stringify(result.debugInfo, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded p-4">
              <h4 className="font-bold text-yellow-800 text-gray-900 mb-2">ℹ️ How it works:</h4>
              <ol className="text-sm text-yellow-800 list-decimal ml-5 space-y-1">
                <li>Logs into pro.playupstore.com with your credentials</li>
                <li>Searches for the product by name</li>
                <li>Finds the product page URL</li>
                <li>Extracts all image URLs from the page</li>
                <li>Shows images and URLs for download</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}




