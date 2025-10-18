import { useState } from 'react';
import { NextPage } from 'next';

interface ProductLine {
  barcode: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface ProductMatch {
  barcode: string;
  products: Array<{
    id: number;
    name: string;
    default_code: string;
    type: string;
    list_price: number;
    categ_id: [number, string];
    qty_available?: number;
  }>;
  variants: Array<{
    id: number;
    name: string;
    default_code: string;
    product_tmpl_id: [number, string];
    list_price: number;
    qty_available?: number;
  }>;
}

interface CategorizedProduct {
  barcode: string;
  csvName: string;
  sku: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  action: 'update_stock' | 'create_variant' | 'create_product';
  
  variantId?: number;
  templateId?: number;
  odooProductName?: string;
  currentStock?: number;
  
  baseProductId?: number;
  baseProductName?: string;
  detectedSize?: string;
  detectedColor?: string;
  attributes?: Array<{
    name: string;
    attributeId: number;
    values: string[];
    selectedValue?: string;  // User's selected value for this attribute
  }>;
  
  parsedProductName?: string;
  category?: { id: number; name: string };
  brand?: { id: number; name: string };
}

interface CheckResult {
  success: boolean;
  totalBarcodes: number;
  uniqueBarcodes: number;
  results: ProductMatch[];
  duplicates: ProductMatch[];
  duplicateCount: number;
  inputDuplicates: Array<{ barcode: string; count: number }>;
  
  categorized: CategorizedProduct[];
  toUpdateStock: CategorizedProduct[];
  toCreateVariant: CategorizedProduct[];
  toCreateProduct: CategorizedProduct[];
  
  defaultCategory: { id: number; name: string };
  defaultBrand: { id: number; name: string } | null;
}

const BarcodeDuplicateChecker: NextPage = () => {
  const [loading, setLoading] = useState(false);
  const [parsedProducts, setParsedProducts] = useState<ProductLine[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [manualBarcodes, setManualBarcodes] = useState('');
  const [activeTab, setActiveTab] = useState<'pdf' | 'csv' | 'manual'>('pdf');
  
  // Editable state for categorized products
  const [editableUpdateStock, setEditableUpdateStock] = useState<CategorizedProduct[]>([]);
  const [editableCreateVariant, setEditableCreateVariant] = useState<CategorizedProduct[]>([]);
  const [editableCreateProduct, setEditableCreateProduct] = useState<CategorizedProduct[]>([]);
  
  // Selection state (which products to include in bulk operation)
  const [selectedForUpdate, setSelectedForUpdate] = useState<Set<string>>(new Set());
  const [selectedForVariant, setSelectedForVariant] = useState<Set<string>>(new Set());
  const [selectedForCreate, setSelectedForCreate] = useState<Set<string>>(new Set());
  
  // Modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationAction, setValidationAction] = useState<'update' | 'variant' | 'create' | null>(null);
  const [operationResults, setOperationResults] = useState<any[]>([]);
  
  // Collapsible sections
  const [showDuplicateDetails, setShowDuplicateDetails] = useState(false);
  const [showAllLookups, setShowAllLookups] = useState(false);

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-hvid-invoice', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setParsedProducts(data.products);
        setCsvContent(data.csv);
        alert(`Successfully parsed ${data.totalProducts} products from PDF`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error uploading PDF: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to parse CSV line respecting quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        // Toggle quotes state
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    
    return result;
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const products: ProductLine[] = [];

      // Skip header if it exists
      const startIndex = lines[0].toLowerCase().includes('barcode') ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts[0]) {
          products.push({
            barcode: parts[0],
            sku: parts[1] || '',
            name: parts[2] || '',
            quantity: parseFloat(parts[3]) || 0,
            price: parseFloat(parts[4]) || 0,
            total: parseFloat(parts[5]) || 0,
          });
        }
      }

      setParsedProducts(products);
      setCsvContent(text);
      alert(`Successfully parsed ${products.length} products from CSV`);
    } catch (error: any) {
      alert(`Error parsing CSV: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleManualInput = () => {
    const lines = manualBarcodes.split('\n').filter(line => line.trim());
    const products: ProductLine[] = lines.map(barcode => ({
      barcode: barcode.trim(),
      sku: '',
      name: '',
      quantity: 0,
      price: 0,
      total: 0,
    }));

    setParsedProducts(products);
    alert(`Added ${products.length} barcodes`);
  };

  const checkForDuplicates = async () => {
    if (parsedProducts.length === 0) {
      alert('Please upload a file or enter barcodes first');
      return;
    }

    // Get credentials from localStorage
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');

    if (!uid || !password) {
      alert('Please log in to Odoo first');
      return;
    }

    setLoading(true);
    try {
      const barcodes = parsedProducts.map(p => p.barcode);

      const response = await fetch('/api/check-duplicate-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes, products: parsedProducts, uid, password }),
      });

      const data = await response.json();

      console.log('API Response:', data);

      if (data.success) {
        console.log('Setting check result:', data);
        setCheckResult(data);
        
        // Initialize editable states and selections
        console.log('Products to update stock:', data.toUpdateStock);
        console.log('Products to create variant:', data.toCreateVariant);
        console.log('Products to create new:', data.toCreateProduct);
        
        setEditableUpdateStock(data.toUpdateStock || []);
        setEditableCreateVariant(data.toCreateVariant || []);
        setEditableCreateProduct(data.toCreateProduct || []);
        
        // Log attribute info for variant creation
        data.toCreateVariant?.forEach((p: CategorizedProduct) => {
          console.log(`${p.baseProductName}:`);
          console.log(`  existingSizes: ${p.existingSizes === null ? 'null (no Maat)' : JSON.stringify(p.existingSizes)}`);
          console.log(`  existingColors: ${p.existingColors === null ? 'null (no Kleur)' : JSON.stringify(p.existingColors)}`);
        });
        
        // Select all by default
        setSelectedForUpdate(new Set(data.toUpdateStock?.map((p: CategorizedProduct) => p.barcode) || []));
        setSelectedForVariant(new Set(data.toCreateVariant?.map((p: CategorizedProduct) => p.barcode) || []));
        setSelectedForCreate(new Set(data.toCreateProduct?.map((p: CategorizedProduct) => p.barcode) || []));
        
        console.log('Check result set successfully');
        
        // Scroll to results
        setTimeout(() => {
          const resultsElement = document.getElementById('action-sections');
          if (resultsElement) {
            resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error details:', error);
      alert(`Error checking duplicates: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateBarcode = async (
    productId: number,
    model: 'product.template' | 'product.product',
    newBarcode: string,
    clearBarcode: boolean = false
  ) => {
    if (!clearBarcode && !newBarcode.trim()) {
      alert('Please enter a new barcode or choose to clear it');
      return;
    }

    // Get credentials from localStorage
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');

    if (!uid || !password) {
      alert('Please log in to Odoo first');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/update-product-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, model, newBarcode, clearBarcode, uid, password }),
      });

      const data = await response.json();

      if (data.success) {
        alert('Barcode updated successfully!');
        // Refresh the check
        await checkForDuplicates();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error updating barcode: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk Operations
  const handleUpdateAllStock = async () => {
    const selected = editableUpdateStock.filter(p => selectedForUpdate.has(p.barcode));
    if (selected.length === 0) {
      alert('No products selected for stock update');
      return;
    }

    setValidationAction('update');
    setShowValidationModal(true);
  };

  const handleCreateAllVariants = async () => {
    const selected = editableCreateVariant.filter(p => selectedForVariant.has(p.barcode));
    if (selected.length === 0) {
      alert('No products selected for variant creation');
      return;
    }

    setValidationAction('variant');
    setShowValidationModal(true);
  };

  const handleCreateAllProducts = async () => {
    const selected = editableCreateProduct.filter(p => selectedForCreate.has(p.barcode));
    if (selected.length === 0) {
      alert('No products selected for product creation');
      return;
    }

    setValidationAction('create');
    setShowValidationModal(true);
  };

  const executeOperation = async () => {
    setShowValidationModal(false);
    setLoading(true);
    
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');

    if (!uid || !password) {
      alert('Please log in to Odoo first');
      setLoading(false);
      return;
    }

    const results: any[] = [];

    try {
      if (validationAction === 'update') {
        const selected = editableUpdateStock.filter(p => selectedForUpdate.has(p.barcode));
        
        for (const product of selected) {
          try {
            const response = await fetch('/api/update-stock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                variantId: product.variantId,
                quantityToAdd: product.quantity,
                uid,
                password,
              }),
            });

            const data = await response.json();
            results.push({
              barcode: product.barcode,
              csvName: product.csvName,
              success: data.success,
              message: data.success 
                ? `Stock updated: ${data.previousStock} + ${data.quantityAdded} = ${data.newStock}`
                : data.error,
            });
          } catch (error: any) {
            results.push({
              barcode: product.barcode,
              csvName: product.csvName,
              success: false,
              message: error.message,
            });
          }
        }
      } else if (validationAction === 'variant') {
        const selected = editableCreateVariant.filter(p => selectedForVariant.has(p.barcode));
        
        for (const product of selected) {
          try {
            // Build attribute values object (only non-empty values)
            const attributeValues: { [attrName: string]: string } = {};
            
            if (product.attributes) {
              for (const attr of product.attributes) {
                if (attr.selectedValue && attr.selectedValue.trim()) {
                  attributeValues[attr.name] = attr.selectedValue.trim();
                  console.log(`Including ${attr.name}: ${attr.selectedValue}`);
                }
              }
            }

            const requestData: any = {
              templateId: product.baseProductId,
              barcode: product.barcode,
              sku: product.sku,
              quantity: product.quantity,
              attributeValues,  // Send all attribute values
              uid,
              password,
            };

            console.log('Creating variant with data:', requestData);

            const response = await fetch('/api/create-product-variant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestData),
            });

            const data = await response.json();
            results.push({
              barcode: product.barcode,
              csvName: product.csvName,
              success: data.success,
              message: data.success 
                ? `Variant created: ${data.variant.name}`
                : data.error,
            });
          } catch (error: any) {
            results.push({
              barcode: product.barcode,
              csvName: product.csvName,
              success: false,
              message: error.message,
            });
          }
        }
      } else if (validationAction === 'create') {
        const selected = editableCreateProduct.filter(p => selectedForCreate.has(p.barcode));
        
        for (const product of selected) {
          try {
            if (!product.brand?.id) {
              throw new Error('Brand is required');
            }

            const response = await fetch('/api/create-hvid-product', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: product.parsedProductName || product.csvName,
                barcode: product.barcode,
                sku: product.sku,
                costPrice: product.costPrice,
                salePrice: product.salePrice,
                quantity: product.quantity,
                categoryId: product.category?.id,
                brandId: product.brand.id,
                size: product.detectedSize,
                color: product.detectedColor,
                uid,
                password,
              }),
            });

            const data = await response.json();
            results.push({
              barcode: product.barcode,
              csvName: product.csvName,
              success: data.success,
              message: data.success 
                ? `Product created: ${data.template.name}`
                : data.error,
            });
          } catch (error: any) {
            results.push({
              barcode: product.barcode,
              csvName: product.csvName,
              success: false,
              message: error.message,
            });
          }
        }
      }

      setOperationResults(results);
      
      // Show summary
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      alert(`Operation complete!\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`);
      
      // Refresh the check
      await checkForDuplicates();

    } catch (error: any) {
      console.error('Error executing operation:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            Hvid Levering
          </h1>

          {/* Tab Navigation */}
          <div className="flex space-x-2 mb-6 border-b">
            <button
              onClick={() => setActiveTab('pdf')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'pdf'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Upload PDF
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'csv'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Upload CSV
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'manual'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Manual Input
            </button>
          </div>

          {/* PDF Upload Tab */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload PDF Invoice (Odoo/Factur-X Format)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePDFUpload}
                  disabled={loading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
          )}

          {/* CSV Upload Tab */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload CSV File
                </label>
                <p className="text-sm text-gray-600 mb-2">
                  Expected format: Barcode, SKU, Product Name, Quantity, Price, Total
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  disabled={loading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
          )}

          {/* Manual Input Tab */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Barcodes (one per line)
                </label>
                <textarea
                  value={manualBarcodes}
                  onChange={(e) => setManualBarcodes(e.target.value)}
                  placeholder="5404027808536&#10;5404027808512&#10;5404027800813"
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleManualInput}
                  disabled={loading || !manualBarcodes.trim()}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Add Barcodes
                </button>
              </div>
            </div>
          )}

          {/* Parsed Products Display */}
          {parsedProducts.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  Parsed Products ({parsedProducts.length})
                </h2>
                <div className="space-x-2">
                  {csvContent && (
                    <button
                      onClick={downloadCSV}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Download CSV
                    </button>
                  )}
                  <button
                    onClick={checkForDuplicates}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Checking...' : 'Check for Duplicates in Odoo'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Barcode
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SKU
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedProducts.map((product, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {product.barcode}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.sku}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                          <div className="break-words">{product.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.quantity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          €{product.price.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Check Results */}
        {checkResult && (
          <div id="check-results" className="bg-white rounded-lg shadow-md p-6">
            <button
              onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}
              className="w-full flex items-center justify-between text-2xl font-bold text-gray-800 mb-4 hover:text-blue-600 transition-colors"
            >
              <span>
                Duplicate Check Results 
                <span className="text-sm text-gray-500 ml-2">
                  ({showDuplicateDetails ? 'Click to collapse' : 'Click to expand'})
                </span>
              </span>
              <svg 
                className={`w-6 h-6 transform transition-transform ${showDuplicateDetails ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDuplicateDetails && (
              <div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Total Barcodes</div>
                <div className="text-2xl font-bold text-blue-600">
                  {checkResult.totalBarcodes}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Unique Barcodes</div>
                <div className="text-2xl font-bold text-green-600">
                  {checkResult.uniqueBarcodes}
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Duplicates Found</div>
                <div className="text-2xl font-bold text-red-600">
                  {checkResult.duplicateCount}
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Input Duplicates</div>
                <div className="text-2xl font-bold text-yellow-600">
                  {checkResult.inputDuplicates.length}
                </div>
              </div>
            </div>

            {/* Input Duplicates Warning */}
            {checkResult.inputDuplicates.length > 0 && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                  ⚠️ Duplicate Barcodes in Input
                </h3>
                <div className="space-y-1">
                  {checkResult.inputDuplicates.map((dup, index) => (
                    <div key={index} className="text-sm text-yellow-700">
                      <span className="font-mono">{dup.barcode}</span> appears{' '}
                      <span className="font-semibold">{dup.count} times</span> in your input
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicates in Odoo */}
            {checkResult.duplicateCount > 0 ? (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-red-600">
                  🔴 Duplicate Barcodes in Odoo
                </h3>
                {checkResult.duplicates.map((match, index) => {
                  // Find the CSV product name for this barcode
                  const csvProduct = parsedProducts.find(p => p.barcode === match.barcode);
                  
                  return (
                    <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-lg font-semibold text-gray-800">
                            Barcode: <span className="font-mono text-red-600">{match.barcode}</span>
                          </h4>
                          <span className="px-3 py-1 bg-red-600 text-white rounded-full text-sm">
                            {match.products.length + match.variants.length} matches
                          </span>
                        </div>
                        
                        {/* CSV Product Name */}
                        {csvProduct && csvProduct.name && (
                          <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                            <div className="text-xs text-blue-600 font-semibold mb-1">📄 Product Name from CSV:</div>
                            <div className="text-sm text-blue-900">{csvProduct.name}</div>
                            {csvProduct.sku && (
                              <div className="text-xs text-blue-700 mt-1">SKU: {csvProduct.sku}</div>
                            )}
                          </div>
                        )}
                      </div>

                    {/* Product Templates */}
                    {match.products.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-semibold text-gray-700 mb-2">
                          Product Templates ({match.products.length})
                        </h5>
                        <div className="space-y-2">
                          {match.products.map((product) => (
                            <ProductCard
                              key={`template-${product.id}`}
                              product={product}
                              model="product.template"
                              onUpdate={updateBarcode}
                              loading={loading}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Product Variants */}
                    {match.variants.length > 0 && (
                      <div>
                        <h5 className="font-semibold text-gray-700 mb-2">
                          Product Variants ({match.variants.length})
                        </h5>
                        <div className="space-y-2">
                          {match.variants.map((variant) => (
                            <ProductCard
                              key={`variant-${variant.id}`}
                              product={variant}
                              model="product.product"
                              onUpdate={updateBarcode}
                              loading={loading}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-green-50 border-l-4 border-green-400 p-4">
                <p className="text-green-800 font-semibold">
                  ✅ No duplicate barcodes found in Odoo!
                </p>
              </div>
            )}

            {/* All Results Table */}
            <div className="mt-8">
              <button
                onClick={() => setShowAllLookups(!showAllLookups)}
                className="w-full flex items-center justify-between text-xl font-semibold text-gray-800 mb-4 hover:text-blue-600 transition-colors"
              >
                <span>
                  All Barcode Lookups
                  <span className="text-sm text-gray-500 ml-2">
                    ({showAllLookups ? 'Click to collapse' : 'Click to expand'})
                  </span>
                </span>
                <svg 
                  className={`w-5 h-5 transform transition-transform ${showAllLookups ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showAllLookups && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Barcode
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        CSV Product Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Odoo Product Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Matches
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {checkResult.results.map((result, index) => {
                      const totalMatches = result.products.length + result.variants.length;
                      const csvProduct = parsedProducts.find(p => p.barcode === result.barcode);
                      const odooProductName = result.products[0]?.name || result.variants[0]?.name || '-';
                      
                      return (
                        <tr key={index} className={totalMatches > 1 ? 'bg-red-50' : totalMatches === 1 ? 'bg-green-50' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                            {result.barcode}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                            <div className="break-words">{csvProduct?.name || '-'}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                            <div className="break-words">{odooProductName}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {totalMatches === 0 && (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800">
                                Not Found
                              </span>
                            )}
                            {totalMatches === 1 && (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-200 text-green-800">
                                Unique
                              </span>
                            )}
                            {totalMatches > 1 && (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-200 text-red-800">
                                Duplicate
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
              </div>
            )}
          </div>
        )}

        {/* Action Sections */}
        {checkResult && (
          <div id="action-sections" className="space-y-6">
            {/* Summary of Actions */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg shadow-md p-6 border border-blue-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                📋 Import Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600">Stock Updates</div>
                  <div className="text-3xl font-bold text-blue-600">{editableUpdateStock.length}</div>
                  <div className="text-xs text-gray-500 mt-1">Existing products - add stock</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600">New Variants</div>
                  <div className="text-3xl font-bold text-green-600">{editableCreateVariant.length}</div>
                  <div className="text-xs text-gray-500 mt-1">Add to existing product lines</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600">New Products</div>
                  <div className="text-3xl font-bold text-yellow-600">{editableCreateProduct.length}</div>
                  <div className="text-xs text-gray-500 mt-1">Create from scratch</div>
                </div>
              </div>
              
              {/* Help Info */}
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">ℹ️ How it works:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li><strong>📦 Stock Updates:</strong> Barcodes found in Odoo → Stock will be increased</li>
                  <li><strong>➕ Variants:</strong> New size/color for existing products → New variant added</li>
                  <li><strong>🆕 New Products:</strong> Not found in Odoo → Created from scratch</li>
                </ul>
                <div className="mt-2 text-xs text-blue-600">
                  Review tables below, edit if needed, then click the action buttons to process.
                </div>
              </div>
            </div>

            {/* Section 1: Update Stock */}
            {editableUpdateStock.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-blue-600">
                    📦 Products to Update Stock ({editableUpdateStock.length})
                  </h2>
                  <button
                    onClick={handleUpdateAllStock}
                    disabled={loading || selectedForUpdate.size === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    Update Selected Stock ({selectedForUpdate.size})
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedForUpdate.size === editableUpdateStock.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForUpdate(new Set(editableUpdateStock.map(p => p.barcode)));
                              } else {
                                setSelectedForUpdate(new Set());
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CSV Product Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Odoo Product</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">+ Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Stock</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {editableUpdateStock.map((product, index) => {
                        const newStock = (product.currentStock || 0) + product.quantity;
                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selectedForUpdate.has(product.barcode)}
                                onChange={(e) => {
                                  const newSet = new Set(selectedForUpdate);
                                  if (e.target.checked) {
                                    newSet.add(product.barcode);
                                  } else {
                                    newSet.delete(product.barcode);
                                  }
                                  setSelectedForUpdate(newSet);
                                }}
                                className="rounded"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{product.barcode}</td>
                            <td className="px-6 py-4 text-sm max-w-xs"><div className="break-words">{product.csvName}</div></td>
                            <td className="px-6 py-4 text-sm">{product.odooProductName}</td>
                            <td className="px-6 py-4 text-sm text-center">{product.currentStock}</td>
                            <td className="px-6 py-4 text-sm text-center text-green-600 font-semibold">+{product.quantity}</td>
                            <td className="px-6 py-4 text-sm text-center font-bold text-blue-600">{newStock}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-4 text-sm text-gray-600">
                  ℹ️ Stock will be added to existing variants in Odoo. Current stock + quantity from CSV = new stock level.
                </div>
              </div>
            )}

            {/* Section 2: Create Variants */}
            {editableCreateVariant.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-green-600">
                    ➕ Products to Add as Variants ({editableCreateVariant.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const updated = editableCreateVariant.map(p => ({ ...p, quantity: 0 }));
                        setEditableCreateVariant(updated);
                      }}
                      disabled={loading}
                      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:bg-gray-400"
                    >
                      Voorraad 0
                    </button>
                    <button
                      onClick={handleCreateAllVariants}
                      disabled={loading || selectedForVariant.size === 0}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                    >
                      Create Selected Variants ({selectedForVariant.size})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedForVariant.size === editableCreateVariant.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForVariant(new Set(editableCreateVariant.map(p => p.barcode)));
                              } else {
                                setSelectedForVariant(new Set());
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CSV Product Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Product</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attributes (Click badges)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity (Editable)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {editableCreateVariant.map((product, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedForVariant.has(product.barcode)}
                              onChange={(e) => {
                                const newSet = new Set(selectedForVariant);
                                if (e.target.checked) {
                                  newSet.add(product.barcode);
                                } else {
                                  newSet.delete(product.barcode);
                                }
                                setSelectedForVariant(newSet);
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{product.barcode}</td>
                          <td className="px-6 py-4 text-sm max-w-xs"><div className="break-words">{product.csvName}</div></td>
                          <td className="px-6 py-4 text-sm">
                            <span className="font-semibold text-green-700">{product.baseProductName}</span>
                            <div className="text-xs text-gray-500">ID: {product.baseProductId}</div>
                            {product.attributes && product.attributes.length > 0 && (
                              <div className="text-xs text-blue-600 mt-1">
                                {product.attributes.map(attr => {
                                  const displayName = attr.name.toLowerCase().includes('colour') || attr.name.toLowerCase().includes('color')
                                    ? 'Kleur'
                                    : attr.name.toLowerCase().includes('maat') || attr.name.toLowerCase().includes('size')
                                    ? 'Maat'
                                    : attr.name;
                                  return `🏷️ ${displayName}`;
                                }).join(' ')}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {product.attributes && product.attributes.length > 0 ? (
                              <div className="space-y-3">
                                {product.attributes.map((attr, attrIdx) => {
                                  const listId = `attr-${index}-${attrIdx}`;
                                  const currentValue = attr.selectedValue || '';
                                  const isMatch = attr.values.includes(currentValue);
                                  const displayName = attr.name.toLowerCase().includes('colour') || attr.name.toLowerCase().includes('color')
                                    ? 'Kleur'
                                    : attr.name.toLowerCase().includes('maat') || attr.name.toLowerCase().includes('size')
                                    ? 'Maat'
                                    : attr.name;
                                  
                                  return (
                                    <div key={attrIdx}>
                                      <div className="text-xs font-semibold text-gray-700 mb-1">{displayName}:</div>
                                      <input
                                        type="text"
                                        list={listId}
                                        value={currentValue}
                                        onChange={(e) => {
                                          const updated = [...editableCreateVariant];
                                          if (!updated[index].attributes) updated[index].attributes = [];
                                          updated[index].attributes![attrIdx] = { ...attr, selectedValue: e.target.value };
                                          setEditableCreateVariant(updated);
                                        }}
                                        className={`px-2 py-1 border rounded text-sm w-full ${
                                          isMatch ? 'border-green-500 bg-green-50' : 'border-gray-300'
                                        }`}
                                        placeholder="Leave empty to skip"
                                      />
                                      <datalist id={listId}>
                                        {attr.values.map((v, i) => <option key={i} value={v} />)}
                                      </datalist>
                                      {attr.values.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {attr.values.map((value, i) => (
                                            <button
                                              key={i}
                                              type="button"
                                              onClick={() => {
                                                const updated = [...editableCreateVariant];
                                                if (!updated[index].attributes) updated[index].attributes = [];
                                                updated[index].attributes![attrIdx] = { ...attr, selectedValue: value };
                                                setEditableCreateVariant(updated);
                                              }}
                                              className={`px-2 py-0.5 text-xs rounded border ${
                                                currentValue === value
                                                  ? 'bg-green-100 border-green-500 text-green-800 font-semibold'
                                                  : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                                              }`}
                                            >
                                              {value}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400">No attributes</div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <input
                              type="number"
                              min="0"
                              value={product.quantity}
                              onChange={(e) => {
                                const updated = [...editableCreateVariant];
                                updated[index].quantity = parseInt(e.target.value) || 0;
                                setEditableCreateVariant(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-20 text-center"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="text-sm text-gray-600">
                    ℹ️ These variants will be added to existing products. Select attribute values and edit quantity if needed.
                  </div>
                  <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="font-semibold mb-1">💡 How to use:</div>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>Click a badge</strong> to select an existing value (green = selected, matches existing)</li>
                      <li><strong>Type manually</strong> to create a new value (gray border = will create new)</li>
                      <li><strong>Leave empty</strong> to skip that attribute (variant will only use filled attributes)</li>
                      <li><strong>&quot;Voorraad 0&quot; button</strong> sets all quantities to 0 (for pre-orders)</li>
                    </ul>
                  </div>
                  <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
                    ⚠️ <strong>Important:</strong> Select at least one attribute value for each product. Empty = variant won&apos;t be created.
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Create New Products */}
            {editableCreateProduct.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-yellow-600">
                    🆕 New Products to Create ({editableCreateProduct.length})
                  </h2>
                  <button
                    onClick={handleCreateAllProducts}
                    disabled={loading || selectedForCreate.size === 0}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-400"
                  >
                    Create Selected Products ({selectedForCreate.size})
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedForCreate.size === editableCreateProduct.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForCreate(new Set(editableCreateProduct.map(p => p.barcode)));
                              } else {
                                setSelectedForCreate(new Set());
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CSV Product Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {editableCreateProduct.map((product, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedForCreate.has(product.barcode)}
                              onChange={(e) => {
                                const newSet = new Set(selectedForCreate);
                                if (e.target.checked) {
                                  newSet.add(product.barcode);
                                } else {
                                  newSet.delete(product.barcode);
                                }
                                setSelectedForCreate(newSet);
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{product.barcode}</td>
                          <td className="px-6 py-4 text-sm max-w-xs text-gray-500"><div className="break-words">{product.csvName}</div></td>
                          <td className="px-6 py-4 text-sm">
                            <input
                              type="text"
                              value={product.parsedProductName || ''}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].parsedProductName = e.target.value;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-full font-semibold"
                              placeholder="Product name"
                            />
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <input
                              type="text"
                              value={product.detectedSize || ''}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].detectedSize = e.target.value;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-full"
                              placeholder="Size"
                            />
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <input
                              type="text"
                              value={product.detectedColor || ''}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].detectedColor = e.target.value;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-full"
                              placeholder="Color"
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-center">€{product.costPrice.toFixed(2)}</td>
                          <td className="px-6 py-4 text-sm text-center">€{product.salePrice.toFixed(2)}</td>
                          <td className="px-6 py-4 text-sm text-center">{product.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-4 text-sm text-gray-600">
                  ℹ️ These products will be created from scratch. Edit product name, size, and color before creating. Default category: {checkResult.defaultCategory?.name}, Brand: {checkResult.defaultBrand?.name || 'Hvid'}
                </div>
              </div>
            )}

            {/* Validation Modal */}
            {showValidationModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">
                    Confirm Operation
                  </h3>

                  {validationAction === 'update' && (
                    <div>
                      <p className="mb-4">You are about to update stock for {selectedForUpdate.size} product(s):</p>
                      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {editableUpdateStock.filter(p => selectedForUpdate.has(p.barcode)).map(p => (
                          <li key={p.barcode} className="text-sm bg-gray-50 p-2 rounded">
                            <div className="font-semibold">{p.odooProductName}</div>
                            <div className="text-gray-600">Stock: {p.currentStock} → {(p.currentStock || 0) + p.quantity}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationAction === 'variant' && (
                    <div>
                      <p className="mb-4">You are about to create {selectedForVariant.size} variant(s):</p>
                      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {editableCreateVariant.filter(p => selectedForVariant.has(p.barcode)).map(p => {
                          const selectedAttrs = p.attributes?.filter(a => a.selectedValue && a.selectedValue.trim()) || [];
                          const hasAnyValue = selectedAttrs.length > 0;
                          
                          return (
                            <li key={p.barcode} className={`text-sm p-2 rounded ${hasAnyValue ? 'bg-gray-50' : 'bg-orange-50 border border-orange-300'}`}>
                              <div className="font-semibold">{p.baseProductName}</div>
                              <div className="text-xs text-gray-500 mb-1">
                                Product has: {p.attributes?.map(a => `🏷️ ${a.name}`).join(' ')}
                              </div>
                              <div className="text-gray-600">
                                New variant: 
                                {selectedAttrs.length > 0 ? (
                                  selectedAttrs.map((a, i) => (
                                    <span key={i}>
                                      {i > 0 && ' / '}
                                      {a.name}: <strong>{a.selectedValue}</strong>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-orange-600"> ⚠️ No attributes selected</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Barcode: {p.barcode} | Quantity: {p.quantity}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {editableCreateVariant.filter(p => selectedForVariant.has(p.barcode)).some(p => {
                        const selectedAttrs = p.attributes?.filter(a => a.selectedValue && a.selectedValue.trim()) || [];
                        return selectedAttrs.length === 0;
                      }) && (
                        <div className="bg-orange-100 border border-orange-400 p-3 rounded mb-4">
                          <p className="text-sm text-orange-800 font-semibold">
                            ⚠️ Warning: Some products have no attribute values selected.
                          </p>
                          <p className="text-xs text-orange-700 mt-1">
                            Please select at least one attribute value for each product.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {validationAction === 'create' && (
                    <div>
                      <p className="mb-4">You are about to create {selectedForCreate.size} new product(s):</p>
                      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {editableCreateProduct.filter(p => selectedForCreate.has(p.barcode)).map(p => (
                          <li key={p.barcode} className="text-sm bg-gray-50 p-2 rounded">
                            <div className="font-semibold">{p.parsedProductName}</div>
                            <div className="text-gray-600">Category: {p.category?.name}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={executeOperation}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Processing...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setShowValidationModal(false)}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Operation Results */}
            {operationResults.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  Operation Results
                </h2>
                <div className="space-y-2">
                  {operationResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded ${
                        result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-semibold">
                            {result.success ? '✅' : '❌'} {result.csvName}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{result.message}</div>
                        </div>
                        <div className="text-xs text-gray-500 font-mono">{result.barcode}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Product Card Component for editing
interface ProductCardProps {
  product: any;
  model: 'product.template' | 'product.product';
  onUpdate: (id: number, model: 'product.template' | 'product.product', newBarcode: string, clear: boolean) => void;
  loading: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, model, onUpdate, loading }) => {
  const [newBarcode, setNewBarcode] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">
            🏷️ {model === 'product.template' ? 'Product Template' : 'Product Variant'} in Odoo:
          </div>
          <div className="font-semibold text-gray-800 text-base">{product.name}</div>
          <div className="text-sm text-gray-600 space-y-1 mt-2">
            <div className="flex gap-4">
              <span className="font-medium">ID:</span> {product.id}
            </div>
            <div className="flex gap-4">
              <span className="font-medium">SKU:</span> {product.default_code || 'N/A'}
            </div>
            <div className="flex gap-4">
              <span className="font-medium">Price:</span> €{product.list_price.toFixed(2)}
            </div>
            {product.qty_available !== undefined && (
              <div className="flex gap-4">
                <span className="font-medium">Stock:</span> {product.qty_available}
              </div>
            )}
            {model === 'product.template' && product.categ_id && (
              <div className="flex gap-4">
                <span className="font-medium">Category:</span> {product.categ_id[1]}
              </div>
            )}
            {model === 'product.product' && product.product_tmpl_id && (
              <div className="flex gap-4">
                <span className="font-medium">Template:</span> {product.product_tmpl_id[1]}
              </div>
            )}
          </div>
        </div>

        <div className="ml-4 space-y-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Edit Barcode
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="New barcode"
                className="px-2 py-1 border border-gray-300 rounded text-sm w-full"
              />
              <div className="flex space-x-1">
                <button
                  onClick={() => {
                    onUpdate(product.id, model, newBarcode, false);
                    setIsEditing(false);
                    setNewBarcode('');
                  }}
                  disabled={loading || !newBarcode.trim()}
                  className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    onUpdate(product.id, model, '', true);
                    setIsEditing(false);
                  }}
                  disabled={loading}
                  className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:bg-gray-400"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setNewBarcode('');
                  }}
                  className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodeDuplicateChecker;

