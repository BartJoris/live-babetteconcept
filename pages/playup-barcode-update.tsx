import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { NextPage } from 'next';

interface DeliveryProduct {
  article: string;
  color: string;
  description: string;
  size: string;
  quantity: number;
  price: number;
}

interface EANProduct {
  reference: string;
  description: string;
  size: string;
  colourCode: string;
  colourDescription: string;
  price: string;
  retailPrice: string;
  eanCode: string;
  composition: string;
  hsCodes: string;
}

interface MatchedProduct {
  deliveryProduct: DeliveryProduct;
  eanProduct: EANProduct | null;
  odooTemplateId: number | null;
  odooTemplateName: string | null;
  odooVariantId: number | null;
  odooVariantName: string | null;
  normalizedSize: string;
  status: 'ready' | 'ean-only' | 'no-ean' | 'odoo-not-found';
}

const PlayUpBarcodeUpdate: NextPage = () => {
  const { isLoggedIn } = useAuth();
  const [deliveryProducts, setDeliveryProducts] = useState<DeliveryProduct[]>([]);
  const [eanProducts, setEANProducts] = useState<EANProduct[]>([]);
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [updateResults, setUpdateResults] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  // Normalize sizes for matching
  const normalizeSize = (size: string): string => {
    // "3 maand" → "3M"
    // "6 jaar" → "6Y"
    // "0 maand" → "0M"
    const match = size.match(/(\d+)\s*(maand|jaar)/i);
    if (match) {
      const num = match[1];
      const unit = match[2].toLowerCase();
      return unit === 'maand' ? `${num}M` : `${num}Y`;
    }
    return size; // Return as-is if no match (e.g., "XS", "S", "M", "L")
  };

  // Format description with smart capitalization (same as product-import)
  const formatDescription = (desc: string): string => {
    const words = desc.split(' ');
    return words.map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      if (word === 'LS' || (word.length === 2 && word === word.toUpperCase())) {
        return word;
      }
      return word.toLowerCase();
    }).join(' ');
  };

  const handleDeliveryCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const products: DeliveryProduct[] = [];
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      
      if (parts.length >= 6 && parts[0]) {
        products.push({
          article: parts[0],
          color: parts[1],
          description: parts[2],
          size: parts[3],
          quantity: parseInt(parts[4]) || 0,
          price: parseFloat(parts[5]) || 0,
        });
      }
    }
    
    setDeliveryProducts(products);
    console.log(`Parsed ${products.length} delivery products`);
  };

  const handleEANCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const products: EANProduct[] = [];
    
    // Skip header (first 2 lines: "Table 1" and actual headers)
    for (let i = 2; i < lines.length; i++) {
      const parts = lines[i].split(';').map(p => p.trim());
      
      if (parts.length >= 8 && parts[0] && parts[7]) {
        products.push({
          reference: parts[0],
          description: parts[1],
          size: parts[2],
          colourCode: parts[3],
          colourDescription: parts[4],
          price: parts[5],
          retailPrice: parts[6],
          eanCode: parts[7],
          composition: parts[8] || '',
          hsCodes: parts[9] || '',
        });
      }
    }
    
    setEANProducts(products);
    console.log(`Parsed ${products.length} EAN products`);
  };

  const matchProducts = async () => {
    if (deliveryProducts.length === 0 || eanProducts.length === 0) {
      alert('Please upload both CSV files first');
      return;
    }

    setLoading(true);
    const matched: MatchedProduct[] = [];

    for (const delivery of deliveryProducts) {
      const normalizedSize = normalizeSize(delivery.size);
      
      // Find matching EAN
      const ean = eanProducts.find(e => {
        const eanArticle = e.reference.split('/')[1];  // Extract article from "PA01/1AR11002"
        return eanArticle === delivery.article 
          && e.colourCode === delivery.color
          && e.size === normalizedSize;
      });

      matched.push({
        deliveryProduct: delivery,
        eanProduct: ean || null,
        odooTemplateId: null,
        odooTemplateName: null,
        odooVariantId: null,
        odooVariantName: null,
        normalizedSize,
        status: ean ? 'ean-only' : 'no-ean',
      });
    }

    setMatchedProducts(matched);
    setCurrentStep(2);
    setLoading(false);

    const eanMatched = matched.filter(m => m.eanProduct).length;
    const noEAN = matched.filter(m => !m.eanProduct).length;
    
    console.log(`Matched: ${eanMatched} with EAN, ${noEAN} without EAN`);
    alert(`EAN Matching Complete!\n\n✅ Found EAN: ${eanMatched}\n❌ No EAN: ${noEAN}\n\nNext: Find products in Odoo`);
  };

  const findInOdoo = async () => {
    if (!isLoggedIn) {
      alert('Please log in to Odoo first');
      return;
    }

    setLoading(true);

    const updated: MatchedProduct[] = [];

    for (const match of matchedProducts) {
      if (!match.eanProduct) {
        updated.push(match);
        continue;
      }

      // Try to find product in Odoo
      const formattedDesc = formatDescription(match.deliveryProduct.description);
      const newFormatName = `Play Up - ${formattedDesc} (${match.deliveryProduct.article})`;
      const oldFormatName = `Play Up - ${match.deliveryProduct.description} - ${match.deliveryProduct.color}`;

      console.log(`Searching for: ${match.deliveryProduct.article} - ${match.deliveryProduct.description}`);
      console.log(`  Trying: "${newFormatName}"`);

      let template = null;

      try {
        // Try new format first
        let response = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'product.template',
            method: 'search_read',
            args: [[['name', '=', newFormatName]]],
            kwargs: {
              fields: ['id', 'name'],
              limit: 1,
            },
            uid: localStorage.getItem('odoo_uid'),
            password: localStorage.getItem('odoo_pass'),
          }),
        });

        let result = await response.json();
        template = result.success && result.result && result.result.length > 0 ? result.result[0] : null;

        if (template) {
          console.log(`  ✅ Found with new format: ID ${template.id}`);
        }

        // If not found, try old format
        if (!template) {
          console.log(`  Not found with new format, trying: "${oldFormatName}"`);
          response = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.template',
              method: 'search_read',
              args: [[['name', '=', oldFormatName]]],
              kwargs: {
                fields: ['id', 'name'],
                limit: 1,
              },
              uid: localStorage.getItem('odoo_uid'),
              password: localStorage.getItem('odoo_pass'),
            }),
          });

          result = await response.json();
          template = result.success && result.result && result.result.length > 0 ? result.result[0] : null;
          
          if (template) {
            console.log(`  ✅ Found with old format: ID ${template.id}`);
          } else {
            console.log(`  ❌ Not found with either format`);
          }
        }

        if (template) {
          console.log(`  Searching for variant with size: ${match.normalizedSize} or ${match.deliveryProduct.size}`);
          // Get variants for this template
          const variantsResponse = await fetch('/api/odoo-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'product.product',
              method: 'search_read',
              args: [[['product_tmpl_id', '=', template.id]]],
              kwargs: {
                fields: ['id', 'name', 'product_template_attribute_value_ids'],
              },
              uid: localStorage.getItem('odoo_uid'),
              password: localStorage.getItem('odoo_pass'),
            }),
          });

          const variantsResult = await variantsResponse.json();
          const variants = variantsResult.success ? variantsResult.result : [];

          // Find variant with matching size
          let matchingVariant = null;
          for (const variant of variants) {
            if (variant.product_template_attribute_value_ids && variant.product_template_attribute_value_ids.length > 0) {
              // Get attribute values
              const attrResponse = await fetch('/api/odoo-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'product.template.attribute.value',
                  method: 'read',
                  args: [variant.product_template_attribute_value_ids],
                  kwargs: {
                    fields: ['product_attribute_value_id'],
                  },
                  uid: localStorage.getItem('odoo_uid'),
                  password: localStorage.getItem('odoo_pass'),
                }),
              });

              const attrResult = await attrResponse.json();
              if (attrResult.success) {
                const attrValueIds = attrResult.result.map((v: any) => v.product_attribute_value_id[0]);
                
                // Get attribute value names
                const valueResponse = await fetch('/api/odoo-call', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: 'product.attribute.value',
                    method: 'read',
                    args: [attrValueIds],
                    kwargs: {
                      fields: ['name', 'attribute_id'],
                    },
                    uid: localStorage.getItem('odoo_uid'),
                    password: localStorage.getItem('odoo_pass'),
                  }),
                });

                const valueResult = await valueResponse.json();
                if (valueResult.success) {
                  const sizeValue = valueResult.result.find((v: any) => 
                    v.attribute_id[1].toLowerCase().includes('maat') || 
                    v.attribute_id[1].toLowerCase().includes('size')
                  );

                  if (sizeValue) {
                    // Try multiple size formats:
                    // - Normalized: "3M"
                    // - Original: "3 maand"
                    // - Alternative: "03M", "3m"
                    const possibleSizes = [
                      match.normalizedSize,  // "3M"
                      match.deliveryProduct.size,  // "3 maand"
                      match.normalizedSize.toLowerCase(),  // "3m"
                    ];
                    
                    console.log(`    Variant ${variant.id} has size: "${sizeValue.name}" (checking: ${possibleSizes.join(', ')})`);
                    
                    if (possibleSizes.some(s => s === sizeValue.name)) {
                      matchingVariant = variant;
                      console.log(`    ✅ Variant matched!`);
                      break;
                    }
                  }
                }
              }
            }
          }

          if (matchingVariant) {
            console.log(`  ✅ Ready to update: Variant ID ${matchingVariant.id}`);
          } else {
            console.log(`  ⚠️ Product found but no matching variant for size "${match.deliveryProduct.size}"`);
          }

          updated.push({
            ...match,
            odooTemplateId: template.id,
            odooTemplateName: template.name,
            odooVariantId: matchingVariant ? matchingVariant.id : null,
            odooVariantName: matchingVariant ? matchingVariant.name : null,
            status: matchingVariant ? 'ready' : 'odoo-not-found',
          });
        } else {
          updated.push({
            ...match,
            status: 'odoo-not-found',
          });
        }
      } catch (error) {
        console.error('Error finding product:', error);
        updated.push(match);
      }
    }

    setMatchedProducts(updated);
    setLoading(false);
    setCurrentStep(3);

    const ready = updated.filter(m => m.status === 'ready').length;
    const odooNotFound = updated.filter(m => m.status === 'odoo-not-found').length;
    
    console.log(`Ready to update: ${ready}, Odoo not found: ${odooNotFound}`);
    alert(`Odoo Search Complete!\n\n✅ Ready to update: ${ready}\n⚠️ Odoo not found: ${odooNotFound}`);
    
    // Select all ready products by default
    setSelectedProducts(new Set(updated.filter(m => m.status === 'ready').map((_, i) => i.toString())));
  };

  const updateBarcodes = async () => {
    if (!isLoggedIn) {
      alert('Please log in to Odoo first');
      return;
    }

    const selected = matchedProducts.filter((_, i) => selectedProducts.has(i.toString()) && matchedProducts[i].status === 'ready');
    
    if (selected.length === 0) {
      alert('No products selected for update');
      return;
    }

    if (!confirm(`Update ${selected.length} barcodes in Odoo?`)) {
      return;
    }

    setLoading(true);
    const results: any[] = [];

    for (const match of selected) {
      try {
        const response = await fetch('/api/odoo-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'product.product',
            method: 'write',
            args: [
              [match.odooVariantId],
              { barcode: match.eanProduct!.eanCode },
            ],
            uid: localStorage.getItem('odoo_uid'),
            password: localStorage.getItem('odoo_pass'),
          }),
        });

        const result = await response.json();
        
        results.push({
          article: match.deliveryProduct.article,
          size: match.deliveryProduct.size,
          ean: match.eanProduct!.eanCode,
          success: result.success,
          error: result.success ? null : (result.error || 'Unknown error'),
        });
      } catch (error: any) {
        results.push({
          article: match.deliveryProduct.article,
          size: match.deliveryProduct.size,
          ean: match.eanProduct?.eanCode,
          success: false,
          error: error.message,
        });
      }
    }

    setUpdateResults(results);
    setLoading(false);
    setCurrentStep(4);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    alert(`Update Complete!\n\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          Play Up Barcode Update
        </h1>

        {/* Step 1: Upload Files */}
        {currentStep === 1 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Step 1: Upload CSV Files
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Delivery CSV */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  1. Delivery CSV (Products You Received)
                </label>
                <p className="text-xs text-gray-600 mb-2">
                  Format: Article,Color,Description,Size,Quantity,Price
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleDeliveryCSVUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {deliveryProducts.length > 0 && (
                  <p className="text-sm text-green-600 mt-2">
                    ✅ Loaded {deliveryProducts.length} products
                  </p>
                )}
              </div>

              {/* EAN CSV */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  2. EAN Retail List CSV
                </label>
                <p className="text-xs text-gray-600 mb-2">
                  Format: Reference;Description;Size;Colour_Code;...;EAN Code
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleEANCSVUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                {eanProducts.length > 0 && (
                  <p className="text-sm text-green-600 mt-2">
                    ✅ Loaded {eanProducts.length} EAN products
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={matchProducts}
              disabled={loading || deliveryProducts.length === 0 || eanProducts.length === 0}
              className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
            >
              {loading ? 'Matching...' : 'Match Products with EAN List'}
            </button>
          </div>
        )}

        {/* Step 2: EAN Matching Results */}
        {currentStep === 2 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Step 2: EAN Matching Results
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">EAN Found</div>
                <div className="text-3xl font-bold text-green-700">
                  {matchedProducts.filter(m => m.eanProduct).length}
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-600">No EAN</div>
                <div className="text-3xl font-bold text-red-700">
                  {matchedProducts.filter(m => !m.eanProduct).length}
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-blue-600">Total Products</div>
                <div className="text-3xl font-bold text-blue-700">
                  {matchedProducts.length}
                </div>
              </div>
            </div>

            <button
              onClick={findInOdoo}
              disabled={loading || matchedProducts.filter(m => m.eanProduct).length === 0}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold"
            >
              {loading ? 'Searching Odoo...' : 'Find Products in Odoo'}
            </button>
          </div>
        )}

        {/* Step 3: Review & Update */}
        {currentStep === 3 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Step 3: Review & Update Barcodes
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">Ready to Update</div>
                <div className="text-3xl font-bold text-green-700">
                  {matchedProducts.filter(m => m.status === 'ready').length}
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-sm text-yellow-600">EAN Only</div>
                <div className="text-3xl font-bold text-yellow-700">
                  {matchedProducts.filter(m => m.status === 'ean-only').length}
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-orange-600">Odoo Not Found</div>
                <div className="text-3xl font-bold text-orange-700">
                  {matchedProducts.filter(m => m.status === 'odoo-not-found').length}
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-600">No EAN</div>
                <div className="text-3xl font-bold text-red-700">
                  {matchedProducts.filter(m => m.status === 'no-ean').length}
                </div>
              </div>
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto mb-6">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === matchedProducts.filter(m => m.status === 'ready').length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProducts(new Set(matchedProducts
                              .map((m, i) => m.status === 'ready' ? i.toString() : null)
                              .filter(Boolean) as string[]));
                          } else {
                            setSelectedProducts(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">EAN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Odoo Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {matchedProducts.map((match, index) => (
                    <tr key={index} className={
                      match.status === 'ready' ? 'bg-green-50' :
                      match.status === 'odoo-not-found' ? 'bg-orange-50' :
                      match.status === 'no-ean' ? 'bg-red-50' : 'bg-yellow-50'
                    }>
                      <td className="px-4 py-4">
                        {match.status === 'ready' && (
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(index.toString())}
                            onChange={(e) => {
                              const newSet = new Set(selectedProducts);
                              if (e.target.checked) {
                                newSet.add(index.toString());
                              } else {
                                newSet.delete(index.toString());
                              }
                              setSelectedProducts(newSet);
                            }}
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">{match.deliveryProduct.article}</td>
                      <td className="px-6 py-4 text-sm">{match.deliveryProduct.description}</td>
                      <td className="px-6 py-4 text-sm">
                        {match.deliveryProduct.size}
                        <div className="text-xs text-gray-500">({match.normalizedSize})</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono">
                        {match.eanProduct?.eanCode || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {match.odooTemplateName || '-'}
                        {match.odooVariantId && (
                          <div className="text-xs text-gray-500">Variant ID: {match.odooVariantId}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {match.status === 'ready' && (
                          <span className="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-semibold">
                            Ready
                          </span>
                        )}
                        {match.status === 'odoo-not-found' && (
                          <span className="px-2 py-1 bg-orange-200 text-orange-800 rounded text-xs font-semibold">
                            Odoo Not Found
                          </span>
                        )}
                        {match.status === 'no-ean' && (
                          <span className="px-2 py-1 bg-red-200 text-red-800 rounded text-xs font-semibold">
                            No EAN
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-6 py-3 border rounded-lg hover:bg-gray-100"
              >
                ← Back
              </button>
              <button
                onClick={updateBarcodes}
                disabled={loading || selectedProducts.size === 0}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold"
              >
                {loading ? 'Updating...' : `Update ${selectedProducts.size} Barcodes in Odoo`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {currentStep === 4 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Update Results
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-green-600">Successful</div>
                <div className="text-3xl font-bold text-green-700">
                  {updateResults.filter(r => r.success).length}
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-red-600">Failed</div>
                <div className="text-3xl font-bold text-red-700">
                  {updateResults.filter(r => !r.success).length}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {updateResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded ${
                    result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">
                        {result.success ? '✅' : '❌'} {result.article} - {result.size}
                      </div>
                      <div className="text-sm text-gray-600">
                        EAN: {result.ean}
                        {result.error && <div className="text-red-600">Error: {result.error}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setCurrentStep(1);
                setDeliveryProducts([]);
                setEANProducts([]);
                setMatchedProducts([]);
                setUpdateResults([]);
                setSelectedProducts(new Set());
              }}
              className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Start New Update
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayUpBarcodeUpdate;

