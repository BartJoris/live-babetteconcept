import { useState } from 'react';
import Head from 'next/head';

interface ProductRow {
  article: string;
  color: string;
  description: string;
  colorName?: string;
  wholesalePrice?: number;
}

export default function PlayUpCsvMerger() {
  const [productsCSV, setProductsCSV] = useState<ProductRow[]>([]);
  const [colorsMap, setColorsMap] = useState<Map<string, string>>(new Map());
  const [websitePrices, setWebsitePrices] = useState<Map<string, number>>(new Map());
  const [mergedData, setMergedData] = useState('');

  const handleProductsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseProductsCSV(text);
    };
    reader.readAsText(file);
  };

  const handleColorsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseColorsCSV(text);
    };
    reader.readAsText(file);
  };

  const handleWebsiteUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseWebsiteCSV(text);
    };
    reader.readAsText(file);
  };

  const parseProductsCSV = (text: string) => {
    const lines = text.trim().split('\n');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const headers = lines[0].split(',');
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const products: ProductRow[] = [];
    const uniqueProducts = new Map<string, ProductRow>();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const article = values[0];
      const color = values[1];
      const description = values[2];
      
      const key = `${article}-${color}`;
      if (!uniqueProducts.has(key)) {
        uniqueProducts.set(key, {
          article,
          color,
          description,
        });
      }
    }

    setProductsCSV(Array.from(uniqueProducts.values()));
    console.log(`✅ Loaded ${uniqueProducts.size} unique products`);
  };

  const parseColorsCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const map = new Map<string, string>();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length >= 2) {
        const colorName = values[0].toUpperCase();
        const colorCode = values[1].toUpperCase();
        map.set(colorCode, colorName);
      }
    }

    setColorsMap(map);
    console.log(`✅ Loaded ${map.size} color mappings`);
  };

  const parseWebsiteCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const map = new Map<string, number>();

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length >= 4) {
        const article = values[0];
        const wholesalePrice = parseFloat(values[3]) || 0;
        if (wholesalePrice > 0) {
          map.set(article, wholesalePrice);
        }
      }
    }

    setWebsitePrices(map);
    console.log(`✅ Loaded ${map.size} website prices`);
  };

  const generateMergedCSV = () => {
    // Header: Reference,Description,ColorCode,ColorName,TemplateId,Name,WholesalePrice
    let csv = 'Reference,Description,ColorCode,ColorName,TemplateId,Name,WholesalePrice\n';

    productsCSV.forEach(product => {
      const reference = `${product.article}-${product.color}`;
      const colorName = colorsMap.get(product.color.toUpperCase()) || '';
      const wholesalePrice = websitePrices.get(product.article) || 0;
      const name = `Play Up - ${product.description.charAt(0) + product.description.slice(1).toLowerCase()}`;

      csv += `${reference},"${product.description}",${product.color},${colorName},[TEMPLATE_ID],"${name}",${wholesalePrice.toFixed(2)}\n`;
    });

    setMergedData(csv);
  };

  const downloadMerged = () => {
    const blob = new Blob([mergedData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'playup-image-import-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Head>
        <title>Play UP CSV Merger - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🔗 Play UP CSV Merger
            </h1>
            <p className="text-gray-800">
              Combineer je 3 CSV bestanden om een image import template te maken
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-8">
            {/* Upload Section */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {/* Products CSV */}
              <div className="border-2 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-3 text-blue-900">1️⃣ Invoice Products</h3>
                <p className="text-sm text-gray-800 mb-4">playup-products-CFTI22502214.csv</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleProductsUpload}
                  className="hidden"
                  id="products-upload"
                />
                <label
                  htmlFor="products-upload"
                  className={`w-full block text-center px-4 py-3 rounded cursor-pointer ${
                    productsCSV.length > 0 
                      ? 'bg-green-600 text-white hover:bg-green-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {productsCSV.length > 0 ? `✓ ${productsCSV.length} products` : 'Upload Products'}
                </label>
              </div>

              {/* Colors CSV */}
              <div className="border-2 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-3 text-orange-900">2️⃣ Color Mappings</h3>
                <p className="text-sm text-gray-800 mb-4">playup_colors.csv</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleColorsUpload}
                  className="hidden"
                  id="colors-upload"
                />
                <label
                  htmlFor="colors-upload"
                  className={`w-full block text-center px-4 py-3 rounded cursor-pointer ${
                    colorsMap.size > 0 
                      ? 'bg-green-600 text-white hover:bg-green-700' 
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {colorsMap.size > 0 ? `✓ ${colorsMap.size} colors` : 'Upload Colors'}
                </label>
              </div>

              {/* Website Products CSV */}
              <div className="border-2 rounded-lg p-6">
                <h3 className="font-bold text-gray-900 mb-3 text-purple-900">3️⃣ Website Products</h3>
                <p className="text-sm text-gray-800 mb-4">playup-all-products.csv</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleWebsiteUpload}
                  className="hidden"
                  id="website-upload"
                />
                <label
                  htmlFor="website-upload"
                  className={`w-full block text-center px-4 py-3 rounded cursor-pointer ${
                    websitePrices.size > 0 
                      ? 'bg-green-600 text-white hover:bg-green-700' 
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {websitePrices.size > 0 ? `✓ ${websitePrices.size} prices` : 'Upload Website'}
                </label>
              </div>
            </div>

            {/* Generate Button */}
            {productsCSV.length > 0 && colorsMap.size > 0 && (
              <div className="mb-6">
                <button
                  onClick={generateMergedCSV}
                  className="w-full bg-green-600 text-white px-6 py-4 rounded hover:bg-green-700 text-lg font-bold"
                >
                  🔗 Generate Image Import Template
                </button>
              </div>
            )}

            {/* Results */}
            {mergedData && (
              <div>
                <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                  <p className="text-green-800 font-medium">
                    ✅ Merged CSV Generated!
                  </p>
                  <p className="text-sm text-green-700 mt-2">
                    {productsCSV.length} products with color names and prices
                  </p>
                </div>

                <h3 className="font-bold text-gray-900 mb-3">Preview (first 20 rows):</h3>
                <div className="bg-gray-50 border rounded p-4 overflow-x-auto mb-4">
                  <pre className="text-xs font-mono">
                    {mergedData.split('\n').slice(0, 21).join('\n')}
                  </pre>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                  <h4 className="font-bold text-yellow-800 text-gray-900 mb-2">⚠️ Next Steps:</h4>
                  <ol className="text-sm text-yellow-800 list-decimal ml-5 space-y-2">
                    <li>Download this CSV template</li>
                    <li><strong>Import your products</strong> to Odoo first (using /product-import)</li>
                    <li>Note the <strong>Template IDs</strong> from import results</li>
                    <li><strong>Open the downloaded CSV</strong> in Excel/Numbers</li>
                    <li><strong>Replace [TEMPLATE_ID]</strong> with actual Odoo template IDs</li>
                    <li>Upload the completed CSV to <strong>/playup-images-import</strong></li>
                  </ol>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={downloadMerged}
                    className="flex-1 bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 text-lg font-bold"
                  >
                    📥 Download CSV Template
                  </button>
                  <button
                    onClick={() => {
                      setMergedData('');
                      setProductsCSV([]);
                      setColorsMap(new Map());
                      setWebsitePrices(new Map());
                    }}
                    className="px-6 py-3 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    🔄 Reset
                  </button>
                </div>
              </div>
            )}

            {/* Instructions */}
            {!mergedData && (
              <div className="bg-blue-50 border border-blue-200 rounded p-6">
                <h3 className="font-bold text-blue-900 text-gray-900 mb-3">📝 How to Use:</h3>
                <ol className="text-sm text-blue-800 list-decimal ml-5 space-y-2">
                  <li><strong>Upload Invoice Products CSV</strong> - Your converted invoice (playup-products-CFTI22502214.csv)</li>
                  <li><strong>Upload Color Mappings CSV</strong> - Your manual color mappings (playup_colors.csv)</li>
                  <li><strong>Upload Website Products CSV</strong> (Optional) - For price verification (playup-all-products.csv)</li>
                  <li><strong>Click Generate</strong> - Creates merged CSV with all data</li>
                  <li><strong>After product import</strong>, fill in Template IDs in the downloaded CSV</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}




