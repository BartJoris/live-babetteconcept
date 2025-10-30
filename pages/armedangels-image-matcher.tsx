import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface ImageInventory {
  reference: string;
  color: string;
  imageCount: number;
  imageFiles: string[];
}

interface ProductFromCSV {
  reference: string;
  description: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
}

interface CatalogProduct {
  reference: string;
  color: string;
  templateId: number;
  sku: string;
}

interface MatchedProduct {
  reference: string;
  color: string;
  description: string;
  imageCount: number;
  images: string[];
  quantity: number;
  price: number;
  templateId?: number;
}

export default function ArmedAngelsImageMatcher() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  
  const [imageInventoryText, setImageInventoryText] = useState('');
  const [productsText, setProductsText] = useState('');
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'review'>('upload');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedForUpload, setSelectedForUpload] = useState<Set<string>>(new Set());
  const [catalogText, setCatalogText] = useState('');

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

  const parseImageInventoryCSV = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      alert('Invalid image inventory CSV - no data');
      return [];
    }

    const inventory: ImageInventory[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Parse CSV: Item Number,Color Code,Image Count,Image Files
      // Handle quoted fields with commas
      const match = line.match(/^(\d+),"(\d+)",(\d+),"(.+)"$/);
      if (!match) continue;

      const reference = match[1];
      const color = match[2];
      const imageCount = parseInt(match[3]);
      const imageFilesStr = match[4];
      const imageFiles = imageFilesStr.split(' | ').map(f => f.trim());

      inventory.push({
        reference,
        color,
        imageCount,
        imageFiles,
      });
    }

    return inventory;
  };

  const parseProductsCSV = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      alert('Invalid products CSV - no data');
      return [];
    }

    const products: ProductFromCSV[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Parse CSV: Item Number,Description,Color,Size,SKU,Quantity,Price (EUR)
      // Need to handle quoted fields properly
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const nextChar = line[j + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentValue += '"';
            j++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim().replace(/^"|"$/g, ''));
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim().replace(/^"|"$/g, ''));

      if (values.length < 7) continue;

      products.push({
        reference: values[0].trim(),
        description: values[1].trim(),
        color: values[2].trim(),
        size: values[3].trim(),
        quantity: parseInt(values[5]) || 0,
        price: parseFloat(values[6].replace(',', '.')) || 0,
      });
    }

    return products;
  };

  const parseCatalogCSV = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      alert('Invalid catalog CSV - no data');
      return [];
    }

    const catalog: CatalogProduct[] = [];
    
    // Check if this is the raw Armed Angels format (semicolon-separated) or processed format (comma-separated)
    const isRawFormat = lines[1].includes(';') && lines[1].includes('Item Number');
    
    if (isRawFormat) {
      // Parse raw Armed Angels catalog format
      const headerLine = lines[1];
      const headers = headerLine.split(';').map(h => h.trim());
      
      // Find column indices
      const itemNumberIdx = headers.indexOf('Item Number');
      const colorCodeIdx = headers.indexOf('Color Code');
      const skuNumberIdx = headers.indexOf('SKU Number');
      
      console.log(`🛡️ Raw format detected - Item#: ${itemNumberIdx}, Color: ${colorCodeIdx}, SKU: ${skuNumberIdx}`);
      
      // Parse data rows (start from line 2, skip header and "Table 1")
      const processedKeys = new Set<string>();
      
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(';').map(v => v.trim());
        
        if (values.length < Math.max(itemNumberIdx, colorCodeIdx, skuNumberIdx) + 1) {
          continue;
        }
        
        const itemNumber = values[itemNumberIdx];
        const colorCode = values[colorCodeIdx];
        const skuNumber = values[skuNumberIdx];
        
        if (!itemNumber || !colorCode || !skuNumber) continue;
        
        // Create a key to track unique item+color combinations (avoid duplicates)
        const key = `${itemNumber}_${colorCode}`;
        if (processedKeys.has(key)) continue;
        processedKeys.add(key);
        
        // Use SKU Number as template ID (it's unique for each product-color combination)
        // Extract just the numeric part of SKU if it's in format like "30001100000021"
        const templateId = parseInt(skuNumber) || 0;
        
        catalog.push({
          reference: itemNumber,
          color: colorCode,
          templateId: templateId, // Use SKU as template ID
          sku: skuNumber,
        });
        
        if (i <= 10) {
          console.log(`  Found: Item=${itemNumber}, Color=${colorCode}, SKU=${skuNumber}, TemplateID=${templateId}`);
        }
      }
      
      console.log(`🛡️ Parsed ${catalog.length} unique product-color combinations from raw catalog`);
    } else {
      // Parse processed format: Reference,Color,Template ID,SKU
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\d+),"(\d+)",(\d+),"(.+)"$/);
        if (!match) continue;

        const reference = match[1];
        const color = match[2];
        const templateId = parseInt(match[3]);
        const sku = match[4];

        catalog.push({
          reference,
          color,
          templateId,
          sku,
        });
      }
    }

    return catalog;
  };

  const handleImageInventoryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setImageInventoryText(text);
    } catch (err) {
      alert(`Error reading file: ${(err as Error).message}`);
    }
  };

  const handleProductsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setProductsText(text);
    } catch (err) {
      alert(`Error reading file: ${(err as Error).message}`);
    }
  };

  const handleCatalogFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setCatalogText(text);
    } catch (err) {
      alert(`Error reading file: ${(err as Error).message}`);
    }
  };

  const matchImagesWithProducts = () => {
    if (!imageInventoryText.trim() || !productsText.trim()) {
      alert('Please paste both Image Inventory CSV and Products CSV');
      return;
    }

    setLoading(true);

    try {
      // Parse CSVs
      const inventory = parseImageInventoryCSV(imageInventoryText);
      const products = parseProductsCSV(productsText);
      const catalog = catalogText.trim() ? parseCatalogCSV(catalogText) : [];

      console.log(`📸 Loaded ${inventory.length} image groups`);
      console.log(`📄 Loaded ${products.length} product rows`);
      console.log(`📋 Loaded ${catalog.length} catalog entries`);

      // Create catalog lookup map
      const catalogMap = new Map<string, CatalogProduct>();
      catalog.forEach(c => {
        const catalogKey = `${c.reference}_${c.color}`;
        catalogMap.set(catalogKey, c);
        console.log(`  Catalog entry: ${catalogKey} → TemplateID: ${c.templateId}`);
      });

      // Group products by reference + color
      const productMap = new Map<string, ProductFromCSV[]>();
      products.forEach(p => {
        const key = `${p.reference}_${p.color}`;
        if (!productMap.has(key)) {
          productMap.set(key, []);
        }
        productMap.get(key)!.push(p);
      });

      console.log(`🔍 Found ${productMap.size} unique reference+color combinations`);

      // Match images with products
      const matched: MatchedProduct[] = [];
      let totalMatches = 0;

      productMap.forEach((productList) => {
        const firstProduct = productList[0];
        const totalQuantity = productList.reduce((sum, p) => sum + p.quantity, 0);

        // Find matching images - extract color code from product color in case it has "code name" format
        const productColorCode = firstProduct.color.split(' ')[0]; // Get first part (e.g., "3232" from "3232 tinted navy")
        
        const matchingImageGroup = inventory.find(
          img => img.reference === firstProduct.reference && 
                  (img.color === firstProduct.color || img.color === productColorCode)
        );

        // Find template ID from catalog - use only the color code for lookup
        const catalogKey = `${firstProduct.reference}_${productColorCode}`;
        const catalogEntry = catalogMap.get(catalogKey);
        
        if (!catalogEntry && productColorCode) {
          console.log(`  Looking for catalog key: ${catalogKey} - Not found`);
        } else if (catalogEntry) {
          console.log(`  ✓ Found catalog entry for ${catalogKey} → TemplateID: ${catalogEntry.templateId}`);
        }

        if (matchingImageGroup) {
          matched.push({
            reference: firstProduct.reference,
            color: firstProduct.color,
            description: firstProduct.description,
            imageCount: matchingImageGroup.imageCount,
            images: matchingImageGroup.imageFiles,
            quantity: totalQuantity,
            price: firstProduct.price,
            templateId: catalogEntry?.templateId,
          });
          totalMatches += matchingImageGroup.imageCount;
        } else {
          // Products without images
          matched.push({
            reference: firstProduct.reference,
            color: firstProduct.color,
            description: firstProduct.description,
            imageCount: 0,
            images: [],
            quantity: totalQuantity,
            price: firstProduct.price,
            templateId: catalogEntry?.templateId,
          });
        }
      });

      // Sort: products with images first
      matched.sort((a, b) => {
        if (b.imageCount !== a.imageCount) return b.imageCount - a.imageCount;
        return a.reference.localeCompare(b.reference);
      });

      setMatchedProducts(matched);
      
      // Auto-select products with images
      const autoSelect = new Set(matched.filter(p => p.imageCount > 0).map(p => `${p.reference}_${p.color}`));
      setSelectedForUpload(autoSelect);
      setSelectedCount(autoSelect.size);
      setCurrentStep('review');

      const withImages = matched.filter(p => p.imageCount > 0).length;
      const withoutImages = matched.filter(p => p.imageCount === 0).length;

      console.log(`✅ Matching complete!`);
      console.log(`   📸 ${withImages} products with images`);
      console.log(`   ⚠️  ${withoutImages} products without images`);
      console.log(`   🖼️  ${totalMatches} total images matched`);
    } catch (err) {
      console.error('Error matching:', err);
      alert(`Error matching: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const filterProducts = (products: MatchedProduct[]) => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(p =>
      p.reference.toLowerCase().includes(query) ||
      p.color.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    );
  };

  const toggleProductSelection = (key: string) => {
    const newSelected = new Set(selectedForUpload);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedForUpload(newSelected);
    setSelectedCount(newSelected.size);
  };

  const getSelectedImages = () => {
    const selectedImages: string[] = [];
    matchedProducts.forEach(product => {
      const key = `${product.reference}_${product.color}`;
      if (selectedForUpload.has(key) && product.images.length > 0) {
        selectedImages.push(...product.images);
      }
    });
    return selectedImages;
  };

  const downloadMatchedImagesList = () => {
    const selectedImages = getSelectedImages();
    if (selectedImages.length === 0) {
      alert('No images selected');
      return;
    }

    const content = selectedImages.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matched-images.txt';
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📥 Downloaded list of ${selectedImages.length} matched images`);
  };

  const downloadCopyScript = () => {
    const selectedImages = getSelectedImages();
    if (selectedImages.length === 0) {
      alert('No images selected');
      return;
    }

    // Generate a shell script to copy images
    const scriptLines = [
      '#!/bin/bash',
      '# Script to copy matched Armed Angels images to a new directory',
      '',
      '# Create target directory',
      'mkdir -p ~/Downloads/ArmedAngels_Matched_Images',
      '',
      '# Copy matched images',
      ...selectedImages.map(imgPath => {
        const filename = imgPath.split('/').pop();
        return `cp "${imgPath}" ~/Downloads/ArmedAngels_Matched_Images/"${filename}"`;
      }),
      '',
      `echo "✅ Copied ${selectedImages.length} images to ~/Downloads/ArmedAngels_Matched_Images"`,
    ];

    const content = scriptLines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'copy-matched-images.sh';
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📥 Downloaded copy script for ${selectedImages.length} images`);
  };

  const filteredProducts = filterProducts(matchedProducts);
  const productsWithImages = matchedProducts.filter(p => p.imageCount > 0).length;
  const productsWithoutImages = matchedProducts.filter(p => p.imageCount === 0).length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🖼️ Armed Angels Image Matcher</h1>
          <p className="text-gray-600">Match images to products and prepare for upload to Odoo</p>
        </div>

        {currentStep === 'upload' && (
          <div className="space-y-6">
            {/* Image Inventory Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Step 1️⃣: Image Inventory CSV</h2>
              <p className="text-sm text-gray-600 mb-3">From the image analyzer (armedangels-images-inventory.csv)</p>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* File Upload */}
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleImageInventoryFileUpload}
                    className="hidden"
                    id="image-inventory-file"
                  />
                  <label
                    htmlFor="image-inventory-file"
                    className="cursor-pointer block"
                  >
                    <div className="text-3xl mb-2">📁</div>
                    <p className="font-medium text-gray-900">Upload CSV File</p>
                    <p className="text-xs text-gray-600 mt-1">Click to select file</p>
                  </label>
                </div>

                {/* Text Paste */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Or paste content:</p>
                  <textarea
                    value={imageInventoryText}
                    onChange={(e) => setImageInventoryText(e.target.value)}
                    placeholder="Item Number,Color Code,Image Count,Image Files
30005160,3232,10,30005160-3232.jpg | ...
..."
                    className="w-full h-24 p-2 border-2 border-gray-300 rounded text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {imageInventoryText && (
                <p className="text-xs text-green-600 font-medium">
                  ✅ {imageInventoryText.trim().split('\n').length} lines loaded
                </p>
              )}
            </div>

            {/* Products CSV Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Step 2️⃣: Products CSV</h2>
              <p className="text-sm text-gray-600 mb-3">From the PDF parser (armedangels-products-200-08510787.csv)</p>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* File Upload */}
                <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center hover:border-green-500 transition-colors">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleProductsFileUpload}
                    className="hidden"
                    id="products-file"
                  />
                  <label
                    htmlFor="products-file"
                    className="cursor-pointer block"
                  >
                    <div className="text-3xl mb-2">📁</div>
                    <p className="font-medium text-gray-900">Upload CSV File</p>
                    <p className="text-xs text-gray-600 mt-1">Click to select file</p>
                  </label>
                </div>

                {/* Text Paste */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Or paste content:</p>
                  <textarea
                    value={productsText}
                    onChange={(e) => setProductsText(e.target.value)}
                    placeholder="Item Number,Description,Color,Size,SKU,Quantity,Price (EUR)
30006327,MAARGO,3232 tinted navy,XS,,1,49.83
..."
                    className="w-full h-24 p-2 border-2 border-gray-300 rounded text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {productsText && (
                <p className="text-xs text-green-600 font-medium">
                  ✅ {productsText.trim().split('\n').length} lines loaded
                </p>
              )}
            </div>

            {/* Catalog CSV Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Step 3️⃣: Catalog CSV</h2>
              <p className="text-sm text-gray-600 mb-3">From the Odoo catalog (armedangels-catalog.csv)</p>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* File Upload */}
                <div className="border-2 border-dashed border-purple-300 rounded-lg p-6 text-center hover:border-purple-500 transition-colors">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCatalogFileUpload}
                    className="hidden"
                    id="catalog-file"
                  />
                  <label
                    htmlFor="catalog-file"
                    className="cursor-pointer block"
                  >
                    <div className="text-3xl mb-2">📁</div>
                    <p className="font-medium text-gray-900">Upload CSV File</p>
                    <p className="text-xs text-gray-600 mt-1">Click to select file</p>
                  </label>
                </div>

                {/* Text Paste */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Or paste content:</p>
                  <textarea
                    value={catalogText}
                    onChange={(e) => setCatalogText(e.target.value)}
                    placeholder="Reference,Color,Template ID,SKU
30005160,3232,10,30005160-3232
..."
                    className="w-full h-24 p-2 border-2 border-gray-300 rounded text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {catalogText && (
                <p className="text-xs text-green-600 font-medium">
                  ✅ {catalogText.trim().split('\n').length} lines loaded
                </p>
              )}
            </div>

            {/* Match Button */}
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={matchImagesWithProducts}
                disabled={loading || !imageInventoryText.trim() || !productsText.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium text-lg w-full"
              >
                {loading ? '⏳ Matching...' : '🔍 Match Images to Products'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Results Summary</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <div className="text-green-700 text-sm font-medium">Total Products</div>
                  <div className="text-3xl font-bold text-green-900">{matchedProducts.length}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <div className="text-blue-700 text-sm font-medium">With Images</div>
                  <div className="text-3xl font-bold text-blue-900">{productsWithImages}</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <div className="text-yellow-700 text-sm font-medium">Without Images</div>
                  <div className="text-3xl font-bold text-yellow-900">{productsWithoutImages}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded p-4">
                  <div className="text-purple-700 text-sm font-medium">Selected for Upload</div>
                  <div className="text-3xl font-bold text-purple-900">{selectedCount}</div>
                </div>
              </div>
            </div>

            {/* Export Images Section */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                📥 Export Matched Images
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Download a list of matched images or a script to copy them to a new folder for import.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={downloadMatchedImagesList}
                  disabled={getSelectedImages().length === 0}
                  className="bg-white border-2 border-blue-300 text-blue-700 px-4 py-3 rounded-lg hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <span>📄</span>
                  <span>Download Image List</span>
                </button>
                <button
                  onClick={downloadCopyScript}
                  disabled={getSelectedImages().length === 0}
                  className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <span>🚀</span>
                  <span>Download Copy Script</span>
                </button>
              </div>
              {getSelectedImages().length > 0 && (
                <div className="mt-3 text-xs text-gray-600 bg-white rounded p-3">
                  <p className="font-medium mb-2">📋 Next Steps:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Click &quot;Download Copy Script&quot; to get <code className="bg-gray-100 px-1 rounded">copy-matched-images.sh</code></li>
                    <li>Run: <code className="bg-gray-100 px-1 rounded">chmod +x ~/Downloads/copy-matched-images.sh</code></li>
                    <li>Run: <code className="bg-gray-100 px-1 rounded">~/Downloads/copy-matched-images.sh</code></li>
                    <li>Matched images will be in <code className="bg-gray-100 px-1 rounded">~/Downloads/ArmedAngels_Matched_Images/</code></li>
                  </ol>
                </div>
              )}
            </div>

            {/* Search and Filter */}
            <div className="bg-white rounded-lg shadow p-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by reference, color, or description..."
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <p className="text-sm text-gray-600 mt-2">
                Showing {filteredProducts.length} of {matchedProducts.length} products
              </p>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-left font-bold">Select</th>
                    <th className="p-3 text-left font-bold">Item #</th>
                    <th className="p-3 text-left font-bold">Color</th>
                    <th className="p-3 text-left font-bold">Description</th>
                    <th className="p-3 text-center font-bold">Images</th>
                    <th className="p-3 text-center font-bold">Template ID</th>
                    <th className="p-3 text-center font-bold">Qty</th>
                    <th className="p-3 text-right font-bold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, idx) => {
                    const key = `${product.reference}_${product.color}`;
                    const isSelected = selectedForUpload.has(key);
                    return (
                      <tr
                        key={key}
                        className={`border-t cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        } hover:bg-blue-100`}
                        onClick={() => toggleProductSelection(key)}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProductSelection(key)}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-bold text-blue-600">{product.reference}</td>
                        <td className="p-3">{product.color}</td>
                        <td className="p-3">{product.description}</td>
                        <td className="p-3 text-center">
                          {product.imageCount > 0 ? (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-bold">
                              {product.imageCount}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">{product.templateId || '—'}</td>
                        <td className="p-3 text-center">{product.quantity}</td>
                        <td className="p-3 text-right">€{product.price.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div className="bg-white rounded-lg shadow p-6 flex gap-3">
              <button
                onClick={() => {
                  setCurrentStep('upload');
                  setImageInventoryText('');
                  setProductsText('');
                  setMatchedProducts([]);
                  setSelectedForUpload(new Set());
                  setSearchQuery('');
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 font-medium"
              >
                ← Back to Upload
              </button>
              <button
                disabled={selectedCount === 0}
                className="ml-auto px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 font-medium"
              >
                📤 Upload {selectedCount} Selected to Odoo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
