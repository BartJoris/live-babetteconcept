import { useState } from 'react';
import { NextPage } from 'next';

interface ProductLine {
  barcode: string;
  name: string;
  styleCode: string;
  size: string;
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
    selectedValue?: string;
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

const ThinkingMuLeveringPage: NextPage = () => {
  const [loading, setLoading] = useState(false);
  const [parsedProducts, setParsedProducts] = useState<ProductLine[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [manualBarcodes, setManualBarcodes] = useState('');
  const [activeTab, setActiveTab] = useState<'pdf' | 'csv' | 'manual'>('pdf');
  const [debugInfo, setDebugInfo] = useState<string>('');
  
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
  
  // Track processed barcodes to keep them in their original tables
  const [processedBarcodes, setProcessedBarcodes] = useState<Set<string>>(new Set());

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setDebugInfo('');
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/parse-thinkingmu-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        // Convert API response to ProductLine format
        const products: ProductLine[] = data.products.map((p: any) => ({
          barcode: p.barcode,
          name: p.name,
          styleCode: p.styleCode,
          size: p.size,
          quantity: p.quantity,
          price: p.price,
          total: p.total,
        }));
        
        setParsedProducts(products);
        setCsvContent(data.csv);
        alert(`Successfully parsed ${data.productCount} products from PDF\nTotal quantity: ${data.totalQuantity}\nTotal value: €${data.totalValue.toFixed(2)}`);
      } else {
        alert(`Error: ${data.error}`);
        if (data.debugText) {
          setDebugInfo(data.debugText);
          console.log('Debug text:', data.debugText);
        }
        if (data.debugLines) {
          console.log('Debug lines:', data.debugLines);
        }
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
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
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
            name: parts[1] || '',
            styleCode: parts[2] || '',
            size: parts[3] || '',
            quantity: parseFloat(parts[4]) || 1,
            price: parseFloat(parts[5]) || 0,
            total: parseFloat(parts[6]) || 0,
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
      name: '',
      styleCode: '',
      size: '',
      quantity: 1,
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
      // Convert to the format expected by check-duplicate-barcodes
      const productsForCheck = parsedProducts.map(p => ({
        barcode: p.barcode,
        sku: p.styleCode,
        name: `${p.name} ${p.styleCode},${p.size}`,
        quantity: p.quantity,
        price: p.price,
        total: p.total,
      }));
      
      const barcodes = parsedProducts.map(p => p.barcode);

      const response = await fetch('/api/check-duplicate-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          barcodes, 
          products: productsForCheck, 
          uid, 
          password,
          brandName: 'Thinking Mu' // Specify the brand for new products
        }),
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

  const downloadCSV = () => {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'thinkingmu-products.csv';
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
                costPrice: product.costPrice,
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
                }
              }
            }

            // Validate that we have at least one attribute value
            if (Object.keys(attributeValues).length === 0) {
              throw new Error(`No attribute values selected for ${product.csvName}. Please select at least one attribute value.`);
            }

            const requestData: any = {
              templateId: product.baseProductId,
              barcode: product.barcode,
              quantity: product.quantity,
              costPrice: product.costPrice,
              attributeValues,
              uid,
              password,
            };

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
                : `${data.error}: ${data.details || 'No details available'}`,
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
      
      // Mark successful items as processed
      const successfulBarcodes = results.filter(r => r.success).map(r => r.barcode);
      setProcessedBarcodes(prev => new Set([...prev, ...successfulBarcodes]));
      
      // Remove successfully processed items from their tables
      if (validationAction === 'update') {
        setEditableUpdateStock(prev => prev.filter(p => !successfulBarcodes.includes(p.barcode)));
        setSelectedForUpdate(prev => {
          const newSet = new Set(prev);
          successfulBarcodes.forEach(b => newSet.delete(b));
          return newSet;
        });
      } else if (validationAction === 'variant') {
        setEditableCreateVariant(prev => prev.filter(p => !successfulBarcodes.includes(p.barcode)));
        setSelectedForVariant(prev => {
          const newSet = new Set(prev);
          successfulBarcodes.forEach(b => newSet.delete(b));
          return newSet;
        });
      } else if (validationAction === 'create') {
        setEditableCreateProduct(prev => prev.filter(p => !successfulBarcodes.includes(p.barcode)));
        setSelectedForCreate(prev => {
          const newSet = new Set(prev);
          successfulBarcodes.forEach(b => newSet.delete(b));
          return newSet;
        });
      }
      
      // Show summary
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      alert(`Operation complete!\n✅ Success: ${successCount}\n❌ Failed: ${failCount}\n\n${successCount > 0 ? '✓ Processed items removed from list' : ''}`);

    } catch (error: any) {
      console.error('Error executing operation:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🌿</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                Thinking Mu Levering
              </h1>
              <p className="text-gray-500 dark:text-gray-400">Import products from Thinking Mu PDF invoices</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-2 mb-6 border-b dark:border-gray-700">
            <button
              onClick={() => setActiveTab('pdf')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'pdf'
                  ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              📄 Upload PDF
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'csv'
                  ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              📊 Upload CSV
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'manual'
                  ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              ⌨️ Manual Input
            </button>
          </div>

          {/* PDF Upload Tab */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload Thinking Mu Invoice PDF
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Upload the PDF invoice from Thinking Mu. The system will automatically extract barcodes, product names, sizes, quantities, and prices.
                </p>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePDFUpload}
                  disabled={loading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-900 dark:file:text-emerald-300"
                />
              </div>
              
              {debugInfo && (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">Debug Info (PDF could not be parsed):</h3>
                  <pre className="text-xs text-yellow-700 dark:text-yellow-400 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {debugInfo}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* CSV Upload Tab */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload CSV File
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Expected format: Barcode, Product Name, Style Code, Size, Quantity, Price, Total
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  disabled={loading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-900 dark:file:text-emerald-300"
                />
              </div>
            </div>
          )}

          {/* Manual Input Tab */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enter Barcodes (one per line)
                </label>
                <textarea
                  value={manualBarcodes}
                  onChange={(e) => setManualBarcodes(e.target.value)}
                  placeholder="8435512930002&#10;8435512930019&#10;8435512930934"
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={handleManualInput}
                  disabled={loading || !manualBarcodes.trim()}
                  className="mt-2 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400"
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
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                  Parsed Products ({parsedProducts.length})
                </h2>
                <div className="space-x-2">
                  {csvContent && (
                    <button
                      onClick={downloadCSV}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      📥 Download CSV
                    </button>
                  )}
                  <button
                    onClick={checkForDuplicates}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400"
                  >
                    {loading ? 'Checking...' : checkResult ? '🔄 Re-check in Odoo' : '🔍 Check in Odoo'}
                  </button>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Products</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{parsedProducts.length}</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Quantity</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {parsedProducts.reduce((sum, p) => sum + p.quantity, 0)}
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Value</div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    €{parsedProducts.reduce((sum, p) => sum + p.total, 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Barcode
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Product Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Style Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {parsedProducts.map((product, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">
                          {product.barcode}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs">
                          <div className="break-words">{product.name}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                          {product.styleCode}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">
                            {product.size}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {product.quantity}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          €{product.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          €{product.total.toFixed(2)}
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
          <div id="check-results" className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <button
              onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}
              className="w-full flex items-center justify-between text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <span>
                Duplicate Check Results 
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
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
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Barcodes</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {checkResult.totalBarcodes}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Unique Barcodes</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {checkResult.uniqueBarcodes}
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Duplicates Found</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {checkResult.duplicateCount}
                    </div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Input Duplicates</div>
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {checkResult.inputDuplicates.length}
                    </div>
                  </div>
                </div>

                {/* All Results Toggle */}
                <button
                  onClick={() => setShowAllLookups(!showAllLookups)}
                  className="w-full flex items-center justify-between text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  <span>
                    All Barcode Lookups
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
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
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Barcode</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Odoo Match</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {checkResult.results.map((result, index) => {
                          const totalMatches = result.products.length + result.variants.length;
                          return (
                            <tr key={index} className={totalMatches > 1 ? 'bg-red-50 dark:bg-red-900/20' : totalMatches === 1 ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">{result.barcode}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {totalMatches === 0 && (
                                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                                    Not Found
                                  </span>
                                )}
                                {totalMatches === 1 && (
                                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                                    ✓ Found
                                  </span>
                                )}
                                {totalMatches > 1 && (
                                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                                    ⚠ Duplicate
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {result.products[0]?.name || result.variants[0]?.name || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Sections */}
        {checkResult && (
          <div id="action-sections" className="space-y-6">
            {/* Summary */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg shadow-md p-6 border border-emerald-200 dark:border-emerald-800">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                  📋 Import Summary
                </h2>
                <button
                  onClick={() => {
                    setProcessedBarcodes(new Set());
                    checkForDuplicates();
                  }}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400 text-sm"
                >
                  🔄 Refresh All Data
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Stock Updates</div>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{editableUpdateStock.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Existing products - add stock</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 dark:text-gray-400">New Variants</div>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">{editableCreateVariant.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add to existing product lines</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                  <div className="text-sm text-gray-600 dark:text-gray-400">New Products</div>
                  <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{editableCreateProduct.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create from scratch</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow border-2 border-green-500 dark:border-green-600">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Processed</div>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">{processedBarcodes.size}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">✓ Completed this session</div>
                </div>
              </div>
            </div>

            {/* Section 1: Update Stock */}
            {editableUpdateStock.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
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
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-3 text-left">
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Barcode</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Odoo Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cost Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Stock Update</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty to Add</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {editableUpdateStock.map((product, index) => {
                        const newStock = (product.currentStock || 0) + product.quantity;
                        return (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-3 py-3">
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
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">{product.barcode}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs"><div className="break-words">{product.csvName}</div></td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{product.odooProductName}</td>
                            <td className="px-4 py-3 text-sm">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={product.costPrice}
                                onChange={(e) => {
                                  const updated = [...editableUpdateStock];
                                  updated[index].costPrice = parseFloat(e.target.value) || 0;
                                  setEditableUpdateStock(updated);
                                }}
                                className="px-2 py-1 border rounded text-sm w-20 text-gray-900 dark:text-gray-100 dark:bg-gray-700 dark:border-gray-600"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-gray-500 dark:text-gray-400">{product.currentStock}</span>
                                <span className="text-gray-400 dark:text-gray-500">→</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{newStock}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-center text-green-600 dark:text-green-400 font-semibold">+{product.quantity}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 2: Create Variants */}
            {editableCreateVariant.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">
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
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-3 text-left">
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Barcode</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Base Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cost Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Attributes</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Initial Stock</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {editableCreateVariant.map((product, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-3 py-3">
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
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">{product.barcode}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs"><div className="break-words">{product.csvName}</div></td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-semibold text-green-700 dark:text-green-400">{product.baseProductName}</span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={product.costPrice}
                              onChange={(e) => {
                                const updated = [...editableCreateVariant];
                                updated[index].costPrice = parseFloat(e.target.value) || 0;
                                setEditableCreateVariant(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-20 text-gray-900 dark:text-gray-100 dark:bg-gray-700 dark:border-gray-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {product.attributes && product.attributes.length > 0 ? (
                              <div className="space-y-2">
                                {product.attributes.map((attr, attrIdx) => {
                                  const listId = `attr-${index}-${attrIdx}`;
                                  const currentValue = attr.selectedValue || '';
                                  
                                  return (
                                    <div key={attrIdx}>
                                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{attr.name}:</div>
                                      <div className="flex flex-wrap gap-1">
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
                                                ? 'bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-600 text-green-800 dark:text-green-300 font-semibold'
                                                : 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                                            }`}
                                          >
                                            {value}
                                          </button>
                                        ))}
                                      </div>
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
                                        className="mt-1 px-2 py-1 border rounded text-sm w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                                        placeholder="Or type custom value..."
                                      />
                                      <datalist id={listId}>
                                        {attr.values.map((v, i) => <option key={i} value={v} />)}
                                      </datalist>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-gray-400">No attributes</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <input
                              type="number"
                              min="0"
                              value={product.quantity}
                              onChange={(e) => {
                                const updated = [...editableCreateVariant];
                                updated[index].quantity = parseInt(e.target.value) || 0;
                                setEditableCreateVariant(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-16 text-center text-blue-600 dark:text-blue-400 font-semibold dark:bg-gray-700 dark:border-gray-600"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 3: Create New Products */}
            {editableCreateProduct.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
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
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-3 text-left">
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Barcode</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Product Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Color</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cost Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Initial Stock</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {editableCreateProduct.map((product, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-3 py-3">
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
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">{product.barcode}</td>
                          <td className="px-4 py-3 text-sm">
                            <input
                              type="text"
                              value={product.parsedProductName || ''}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].parsedProductName = e.target.value;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-full font-semibold dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              placeholder="Product name"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <input
                              type="text"
                              value={product.detectedSize || ''}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].detectedSize = e.target.value;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-16 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              placeholder="Size"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <input
                              type="text"
                              value={product.detectedColor || ''}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].detectedColor = e.target.value;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-full dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              placeholder="Color"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={product.costPrice}
                              onChange={(e) => {
                                const updated = [...editableCreateProduct];
                                updated[index].costPrice = parseFloat(e.target.value) || 0;
                                setEditableCreateProduct(updated);
                              }}
                              className="px-2 py-1 border rounded text-sm w-20 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">{product.quantity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                  ℹ️ New products will be created with brand: <strong>{checkResult.defaultBrand?.name || 'Thinking Mu'}</strong>, 
                  category: <strong>{checkResult.defaultCategory?.name || 'Default'}</strong>
                </div>
              </div>
            )}

            {/* Validation Modal */}
            {showValidationModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">
                    Confirm Operation
                  </h3>

                  {validationAction === 'update' && (
                    <div>
                      <p className="mb-4 text-gray-700 dark:text-gray-300">You are about to update stock for {selectedForUpdate.size} product(s):</p>
                      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {editableUpdateStock.filter(p => selectedForUpdate.has(p.barcode)).map(p => (
                          <li key={p.barcode} className="text-sm bg-gray-50 dark:bg-gray-700 p-2 rounded">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{p.odooProductName}</div>
                            <div className="text-gray-600 dark:text-gray-400">Stock: {p.currentStock} → {(p.currentStock || 0) + p.quantity}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationAction === 'variant' && (
                    <div>
                      <p className="mb-4 text-gray-700 dark:text-gray-300">You are about to create {selectedForVariant.size} variant(s):</p>
                      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {editableCreateVariant.filter(p => selectedForVariant.has(p.barcode)).map(p => (
                          <li key={p.barcode} className="text-sm bg-gray-50 dark:bg-gray-700 p-2 rounded">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{p.baseProductName}</div>
                            <div className="text-gray-600 dark:text-gray-400">
                              {p.attributes?.filter(a => a.selectedValue).map(a => `${a.name}: ${a.selectedValue}`).join(', ') || 'No attributes selected'}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationAction === 'create' && (
                    <div>
                      <p className="mb-4 text-gray-700 dark:text-gray-300">You are about to create {selectedForCreate.size} new product(s):</p>
                      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                        {editableCreateProduct.filter(p => selectedForCreate.has(p.barcode)).map(p => (
                          <li key={p.barcode} className="text-sm bg-gray-50 dark:bg-gray-700 p-2 rounded">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{p.parsedProductName}</div>
                            <div className="text-gray-600 dark:text-gray-400">Size: {p.detectedSize}, Color: {p.detectedColor}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={executeOperation}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400"
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
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">
                  Operation Results
                </h2>
                <div className="space-y-2">
                  {operationResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded ${
                        result.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {result.success ? '✅' : '❌'} {result.csvName}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{result.message}</div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{result.barcode}</div>
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

export default ThinkingMuLeveringPage;
