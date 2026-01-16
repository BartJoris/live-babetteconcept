import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';

interface CSVProduct {
  reference: string;
  description: string;
  colorCode: string;
}

interface MatchedProduct {
  reference: string;
  imageReference: string;
  colorCode: string;
  description: string;
  imageCount: number;
  images: string[];
}

const getColorCode = (color: string) => {
  if (!color) return '';
  return color.split(' ')[0].split('-')[0].trim();
};

const getImageReference = (reference: string) => {
  if (reference.startsWith('225-')) {
    return reference.replace(/^225-/, '126-');
  }
  return reference;
};

export default function Ao76ImageMatcher() {
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
  const [sortBy, setSortBy] = useState<'name' | 'images'>('images');
  const [productFilter, setProductFilter] = useState<'all' | 'withImages' | 'withoutImages'>('all');

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
    if (lines.length < 2) {
      alert('CSV is leeg of heeft geen data');
      return;
    }

    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    console.log('📋 CSV Headers:', headers);
    
    const referenceIdx = headers.findIndex(h => h === 'reference');
    const descriptionIdx = headers.findIndex(h => h === 'description');
    const colorIdx = headers.findIndex(h => h === 'colour' || h === 'color');

    console.log(`📋 Column indices: reference=${referenceIdx}, description=${descriptionIdx}, color=${colorIdx}`);

    if (referenceIdx === -1) {
      alert('❌ Kolom "Reference" niet gevonden in CSV!\n\nGevonden headers:\n' + headers.join(', '));
      return;
    }

    const products: CSVProduct[] = [];
    const productMap = new Map<string, CSVProduct>();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      if (values.length === 0) continue;

      const reference = values[referenceIdx] || '';
      if (!reference) continue;
      
      const description = values[descriptionIdx] || '';
      const color = values[colorIdx] || '';
      const colorCode = getColorCode(color);

      // Group by reference only (ignore color variations for now)
      if (!productMap.has(reference)) {
        productMap.set(reference, {
          reference,
          description,
          colorCode: colorCode || 'NO_COLOR', // Use placeholder if no color
        });
      }
    }

    const uniqueProducts = Array.from(productMap.values());
    console.log(`📦 Loaded ${uniqueProducts.length} unique products from CSV`);
    
    setCsvProducts(uniqueProducts);
  };

  const handleImageListUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageListFile(file);
    const text = await file.text();
    const images = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && (line.endsWith('.jpg') || line.endsWith('.jpeg') || line.endsWith('.png')));
    setAllImages(images);
  };

  const matchImagesWithProducts = () => {
    setLoading(true);

    console.log(`🔍 Matching ${csvProducts.length} products with ${allImages.length} images...`);

    const matched: MatchedProduct[] = [];

    csvProducts.forEach((product) => {
      const imageReference = getImageReference(product.reference);
      console.log(`  Product ${product.reference} → Image ref: ${imageReference}`);
      
      // Match images: 126-XXXX-XXX-*.jpg
      const matchingImages = allImages.filter(imgPath => {
        const filename = imgPath.split('/').pop() || '';
        // Match by reference prefix only (ignore color code in filename)
        return filename.startsWith(`${imageReference}-`);
      });

      console.log(`    Found ${matchingImages.length} images`);

      matched.push({
        reference: product.reference,
        imageReference,
        colorCode: product.colorCode !== 'NO_COLOR' ? product.colorCode : '',
        description: product.description,
        imageCount: matchingImages.length,
        images: matchingImages,
      });
    });

    matched.sort((a, b) => b.imageCount - a.imageCount);

    console.log(`✅ Matched ${matched.filter(p => p.imageCount > 0).length}/${matched.length} products with images`);

    setMatchedProducts(matched);
    setCurrentStep('review');
    setLoading(false);
  };

  const filterProducts = (products: MatchedProduct[]) => {
    let filtered = products;
    
    // Apply filter
    if (productFilter === 'withImages') {
      filtered = filtered.filter(p => p.imageCount > 0);
    } else if (productFilter === 'withoutImages') {
      filtered = filtered.filter(p => p.imageCount === 0);
    }
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.reference.toLowerCase().includes(query) ||
        p.colorCode.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    }
    
    // Apply sort
    const sorted = [...filtered];
    if (sortBy === 'images') {
      sorted.sort((a, b) => b.imageCount - a.imageCount);
    } else {
      sorted.sort((a, b) => a.reference.localeCompare(b.reference));
    }
    
    return sorted;
  };

  const downloadMatchedImagesList = () => {
    const matchedImagePaths = matchedProducts
      .filter(p => p.imageCount > 0)
      .flatMap(p => p.images);

    const content = matchedImagePaths.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ao76-matched-images.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCopyScript = () => {
    const matchedImagePaths = matchedProducts
      .filter(p => p.imageCount > 0)
      .flatMap(p => p.images);

    const scriptLines = [
      '#!/bin/bash',
      '# Script to copy matched AO76 images to a new directory',
      '',
      'mkdir -p ~/Downloads/AO76_Matched_Images',
      '',
      ...matchedImagePaths.map(imgPath => {
        const filename = imgPath.split('/').pop();
        return `cp "${imgPath}" ~/Downloads/AO76_Matched_Images/${filename}`;
      }),
      '',
      `echo "✅ Copied ${matchedImagePaths.length} images to ~/Downloads/AO76_Matched_Images"`,
    ];

    const content = scriptLines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'copy-ao76-images.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadProductsWithoutImages = () => {
    const productsWithoutImages = matchedProducts.filter(p => p.imageCount === 0);
    
    const csvLines = [
      'Reference;Image Reference;Color Code;Description',
      ...productsWithoutImages.map(p => 
        `${p.reference};${p.imageReference};${p.colorCode};${p.description}`
      )
    ];

    const content = csvLines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ao76-products-without-images.csv';
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📥 Downloaded ${productsWithoutImages.length} products without images`);
  };

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">🖼️ AO76 Image Matcher</h1>

        {currentStep === 'upload' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h2 className="font-semibold text-gray-900 mb-3">1. Upload AO76 CSV</h2>
                <input type="file" accept=".csv" onChange={handleCsvUpload} />
                {csvFile && csvProducts.length > 0 && (
                  <p className="text-sm text-green-600 mt-2 font-medium">
                    ✅ {csvProducts.length} producten geladen
                  </p>
                )}
                {csvFile && csvProducts.length === 0 && (
                  <p className="text-sm text-red-600 mt-2 font-medium">
                    ❌ 0 producten geladen - controleer CSV format
                  </p>
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-3">2. Upload Image List (txt)</h2>
                <input type="file" accept=".txt" onChange={handleImageListUpload} />
                {imageListFile && (
                  <p className="text-sm text-gray-600 mt-2">
                    ✅ {allImages.length} images geladen
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={matchImagesWithProducts}
              disabled={loading || csvProducts.length === 0 || allImages.length === 0}
              className="mt-6 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
            >
              {loading ? 'Matching...' : '🔍 Match Images'}
            </button>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                ✅ Matched {matchedProducts.filter(p => p.imageCount > 0).length} / {matchedProducts.length} products
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={downloadMatchedImagesList}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  📄 Image List
                </button>
                <button
                  onClick={downloadCopyScript}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  🖥️ Copy Script
                </button>
                <button
                  onClick={downloadProductsWithoutImages}
                  disabled={matchedProducts.filter(p => p.imageCount === 0).length === 0}
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-300"
                >
                  📋 Zonder Images ({matchedProducts.filter(p => p.imageCount === 0).length})
                </button>
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setProductFilter('all')}
                className={`px-4 py-2 rounded ${productFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Alle ({matchedProducts.length})
              </button>
              <button
                onClick={() => setProductFilter('withImages')}
                className={`px-4 py-2 rounded ${productFilter === 'withImages' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
              >
                Met Images ({matchedProducts.filter(p => p.imageCount > 0).length})
              </button>
              <button
                onClick={() => setProductFilter('withoutImages')}
                className={`px-4 py-2 rounded ${productFilter === 'withoutImages' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
              >
                Zonder Images ({matchedProducts.filter(p => p.imageCount === 0).length})
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setSortBy('images')}
                  className={`px-4 py-2 rounded ${sortBy === 'images' ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
                >
                  🔢 Sorteer op Aantal
                </button>
                <button
                  onClick={() => setSortBy('name')}
                  className={`px-4 py-2 rounded ${sortBy === 'name' ? 'bg-purple-600 text-white' : 'bg-gray-200'}`}
                >
                  🔤 Sorteer op Naam
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Zoek op reference, kleur of description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
            />

            <div className="border rounded">
              <div className="overflow-y-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left border-b">
                      <th className="py-2 px-3">Reference</th>
                      <th className="py-2 px-3">Image Ref</th>
                      <th className="py-2 px-3">Kleur</th>
                      <th className="py-2 px-3">Omschrijving</th>
                      <th className="py-2 px-3">Images</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterProducts(matchedProducts).map(product => (
                      <tr key={`${product.reference}_${product.colorCode}`} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium">{product.reference}</td>
                        <td className="py-2 px-3 text-gray-600 font-mono text-xs">{product.imageReference}</td>
                        <td className="py-2 px-3">{product.colorCode}</td>
                        <td className="py-2 px-3">{product.description}</td>
                        <td className="py-2 px-3">
                          {product.imageCount > 0 ? (
                            <span className="text-green-700 font-semibold">{product.imageCount}</span>
                          ) : (
                            <span className="text-red-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 px-3 py-2 border-t text-sm text-gray-600">
                Toont {filterProducts(matchedProducts).length} van {matchedProducts.length} producten
                {' • '}
                {filterProducts(matchedProducts).reduce((sum, p) => sum + p.imageCount, 0)} totale afbeeldingen
              </div>
            </div>

            <div className="mt-6 flex gap-4">
              <button
                onClick={() => setCurrentStep('upload')}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                ← Terug
              </button>
              <button
                onClick={() => {
                  // Save matched data to sessionStorage for upload
                  const matchedData = {
                    csvProducts,
                    matchedProducts,
                    timestamp: Date.now(),
                  };
                  sessionStorage.setItem('ao76_matched_images', JSON.stringify(matchedData));
                  
                  // Navigate to image upload
                  router.push('/product-images-import');
                }}
                disabled={matchedProducts.filter(p => p.imageCount > 0).length === 0}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:bg-gray-400 font-medium"
              >
                ➡️ Continue to Upload ({matchedProducts.filter(p => p.imageCount > 0).length} products)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
