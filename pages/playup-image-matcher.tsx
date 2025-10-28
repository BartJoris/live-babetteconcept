import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import Image from 'next/image';

interface CSVProduct {
  article: string;
  color: string;
  description: string;
  size: string;
  quantity: number;
  price: number;
}

interface MatchedProduct {
  article: string;
  color: string;
  description: string;
  imageCount: number;
  images: string[];
}

export default function PlayUpImageMatcher() {
  const router = useRouter();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageListFile, setImageListFile] = useState<File | null>(null);
  const [csvProducts, setCsvProducts] = useState<CSVProduct[]>([]);
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [allImages, setAllImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'review'>('upload');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isLoggedIn && !authLoading) {
      router.push('/');
    }
  }, [isLoggedIn, authLoading, router]);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    const products: CSVProduct[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < 6) continue;

      products.push({
        article: values[0].trim(),
        color: values[1].trim(),
        description: values[2].replace(/^"(.*)"$/, '$1').trim(),
        size: values[3].trim(),
        quantity: parseInt(values[4]) || 0,
        price: parseFloat(values[5]) || 0,
      });
    }

    setCsvProducts(products);
    console.log(`📄 Loaded ${products.length} product rows from CSV`);
  };

  const handleImageListUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageListFile(file);
    const text = await file.text();
    const images = text.split('\n').filter(line => line.trim() && line.endsWith('.jpg'));
    setAllImages(images);
    console.log(`🖼️ Loaded ${images.length} image paths`);
  };

  const matchImagesWithProducts = () => {
    setLoading(true);

    // Group CSV products by Article + Color
    const productMap = new Map<string, CSVProduct>();
    csvProducts.forEach(p => {
      const key = `${p.article}_${p.color}`;
      if (!productMap.has(key)) {
        productMap.set(key, p);
      }
    });

    console.log(`🔍 Found ${productMap.size} unique article+color combinations`);

    // Match images
    const matched: MatchedProduct[] = [];
    let totalMatches = 0;

    productMap.forEach((product) => {
      const matchingImages = allImages.filter(imgPath => {
        const filename = imgPath.split('/').pop() || '';
        // Match pattern: {Article}_{Color}_{Number}.jpg
        return filename.startsWith(`${product.article}_${product.color}_`);
      });

      if (matchingImages.length > 0) {
        matched.push({
          article: product.article,
          color: product.color,
          description: product.description,
          imageCount: matchingImages.length,
          images: matchingImages,
        });
        totalMatches += matchingImages.length;
      } else {
        // Include products without images too
        matched.push({
          article: product.article,
          color: product.color,
          description: product.description,
          imageCount: 0,
          images: [],
        });
      }
    });

    // Sort: products with images first
    matched.sort((a, b) => b.imageCount - a.imageCount);

    setMatchedProducts(matched);
    setCurrentStep('review');
    setLoading(false);

    const withImages = matched.filter(p => p.imageCount > 0).length;
    const withoutImages = matched.filter(p => p.imageCount === 0).length;
    
    console.log(`✅ Matching complete!`);
    console.log(`   📸 ${withImages} products with images`);
    console.log(`   ⚠️  ${withoutImages} products without images`);
    console.log(`   🖼️  ${totalMatches} total images matched`);
  };

  const filterProducts = (products: MatchedProduct[]) => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(p =>
      p.article.toLowerCase().includes(query) ||
      p.color.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    );
  };

  const downloadMatchedImagesList = () => {
    // Get all matched image paths
    const matchedImagePaths = matchedProducts
      .filter(p => p.imageCount > 0)
      .flatMap(p => p.images);

    const content = matchedImagePaths.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matched-images.txt';
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📥 Downloaded list of ${matchedImagePaths.length} matched images`);
  };

  const downloadCopyScript = () => {
    // Get all matched image paths
    const matchedImagePaths = matchedProducts
      .filter(p => p.imageCount > 0)
      .flatMap(p => p.images);

    // Generate a shell script to copy images
    const scriptLines = [
      '#!/bin/bash',
      '# Script to copy matched Play UP images to a new directory',
      '',
      '# Create target directory',
      'mkdir -p ~/Downloads/Play_Up_Matched_Images',
      '',
      '# Copy matched images',
      ...matchedImagePaths.map(imgPath => {
        const filename = imgPath.split('/').pop();
        return `cp "${imgPath}" ~/Downloads/Play_Up_Matched_Images/${filename}`;
      }),
      '',
      `echo "✅ Copied ${matchedImagePaths.length} images to ~/Downloads/Play_Up_Matched_Images"`,
    ];

    const content = scriptLines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'copy-matched-images.sh';
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📥 Downloaded copy script for ${matchedImagePaths.length} images`);
  };

  const withImages = matchedProducts.filter(p => p.imageCount > 0);
  const withoutImages = matchedProducts.filter(p => p.imageCount === 0);
  const filteredWithImages = filterProducts(withImages);
  const filteredWithoutImages = filterProducts(withoutImages);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🖼️ Play UP Image Matcher
          </h1>
          <p className="text-gray-600 mb-6">
            Match your CSV products with local image files
          </p>

          {currentStep === 'upload' && (
            <div className="space-y-6">
              {/* Step 1: Upload CSV */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  📄 Step 1: Upload Product CSV
                </h2>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                />
                {csvFile && (
                  <div className="mt-4 p-4 bg-green-50 rounded">
                    <p className="text-green-700 font-medium">
                      ✅ {csvFile.name} - {csvProducts.length} product rows loaded
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {new Set(csvProducts.map(p => `${p.article}_${p.color}`)).size} unique products
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2: Upload Image List */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  🖼️ Step 2: Upload Image List (txt)
                </h2>
                <p className="text-sm text-gray-600 mb-3">
                  Upload the <code className="bg-gray-100 px-2 py-1 rounded">all-images.txt</code> file
                </p>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleImageListUpload}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {imageListFile && (
                  <div className="mt-4 p-4 bg-green-50 rounded">
                    <p className="text-green-700 font-medium">
                      ✅ {imageListFile.name} - {allImages.length} images loaded
                    </p>
                  </div>
                )}
              </div>

              {/* Match Button */}
              {csvFile && imageListFile && (
                <button
                  onClick={matchImagesWithProducts}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 font-bold text-lg shadow-lg"
                >
                  {loading ? '⏳ Matching...' : '🔍 Match Images with Products'}
                </button>
              )}
            </div>
          )}

          {currentStep === 'review' && (
            <div>
              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-green-600 text-sm mb-1">With Images</div>
                  <div className="text-3xl font-bold text-green-700">
                    {withImages.length}
                  </div>
                  <div className="text-sm text-green-600 mt-1">
                    {withImages.reduce((sum, p) => sum + p.imageCount, 0)} images total
                  </div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="text-yellow-600 text-sm mb-1">Without Images</div>
                  <div className="text-3xl font-bold text-yellow-700">
                    {withoutImages.length}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-blue-600 text-sm mb-1">Total Products</div>
                  <div className="text-3xl font-bold text-blue-700">
                    {matchedProducts.length}
                  </div>
                </div>
              </div>

              {/* Export Actions */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">
                  📥 Export Matched Images
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Download a list of matched images or a script to copy them to a new folder for import.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={downloadMatchedImagesList}
                    disabled={withImages.length === 0}
                    className="bg-white border-2 border-purple-300 text-purple-700 px-4 py-3 rounded-lg hover:bg-purple-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <span>📄</span>
                    <span>Download Image List</span>
                  </button>
                  <button
                    onClick={downloadCopyScript}
                    disabled={withImages.length === 0}
                    className="bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🚀</span>
                    <span>Download Copy Script</span>
                  </button>
                </div>
                {withImages.length > 0 && (
                  <div className="mt-3 text-xs text-gray-600 bg-white rounded p-3">
                    <p className="font-medium mb-2">📋 Next Steps:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click &quot;Download Copy Script&quot; to get <code className="bg-gray-100 px-1 rounded">copy-matched-images.sh</code></li>
                      <li>Run: <code className="bg-gray-100 px-1 rounded">chmod +x ~/Downloads/copy-matched-images.sh</code></li>
                      <li>Run: <code className="bg-gray-100 px-1 rounded">~/Downloads/copy-matched-images.sh</code></li>
                      <li>Matched images will be in <code className="bg-gray-100 px-1 rounded">~/Downloads/Play_Up_Matched_Images/</code></li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Search by article, color, or description..."
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:border-purple-500 focus:outline-none"
                />
                {searchQuery && (
                  <p className="text-sm text-gray-600 mt-2">
                    Showing {filteredWithImages.length + filteredWithoutImages.length} of {matchedProducts.length} products
                  </p>
                )}
              </div>

              {/* Products with Images */}
              {filteredWithImages.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    ✅ Products with Images ({filteredWithImages.length})
                  </h2>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {filteredWithImages.map((product) => (
                      <div
                        key={`${product.article}_${product.color}`}
                        className="bg-white border-2 border-green-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-900 text-lg">
                              {product.description}
                            </h3>
                            <div className="flex gap-3 mt-1">
                              <span className="text-sm bg-gray-100 px-3 py-1 rounded">
                                📦 {product.article}
                              </span>
                              <span className="text-sm bg-blue-100 px-3 py-1 rounded">
                                🎨 {product.color}
                              </span>
                            </div>
                          </div>
                          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold">
                            {product.imageCount} 📸
                          </div>
                        </div>

                        {/* Image Preview Grid */}
                        <div className="grid grid-cols-6 gap-2">
                          {product.images.map((imgPath, idx) => (
                            <div
                              key={idx}
                              className="relative aspect-square bg-gray-100 rounded overflow-hidden border border-gray-200 group"
                            >
                              <Image
                                src={`file://${imgPath}`}
                                alt={`${product.article} ${idx + 1}`}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center">
                                <span className="text-white font-bold opacity-0 group-hover:opacity-100">
                                  {idx + 1}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products without Images */}
              {filteredWithoutImages.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    ⚠️ Products without Images ({filteredWithoutImages.length})
                  </h2>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {filteredWithoutImages.map((product) => (
                      <div
                        key={`${product.article}_${product.color}`}
                        className="bg-yellow-50 border border-yellow-200 rounded p-3"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium text-gray-900">
                              {product.description}
                            </span>
                            <span className="text-sm text-gray-600 ml-3">
                              {product.article} / {product.color}
                            </span>
                          </div>
                          <span className="text-yellow-600 text-sm">No images</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => {
                    setCurrentStep('upload');
                    setCsvFile(null);
                    setImageListFile(null);
                    setCsvProducts([]);
                    setMatchedProducts([]);
                    setAllImages([]);
                    setSearchQuery('');
                  }}
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
                >
                  ⬅️ Start Over
                </button>
                <button
                  onClick={() => {
                    // Save matched data to sessionStorage for import
                    const matchedData = {
                      csvProducts,
                      matchedProducts,
                      timestamp: Date.now(),
                    };
                    sessionStorage.setItem('playup_matched_images', JSON.stringify(matchedData));
                    
                    // Navigate to product import
                    router.push('/product-import?vendor=playup&withImages=true');
                  }}
                  disabled={withImages.length === 0}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:bg-gray-400 font-medium"
                >
                  ➡️ Continue to Import ({withImages.length} products)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

