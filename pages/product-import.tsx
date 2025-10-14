import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Types
interface ParsedProduct {
  reference: string;
  name: string;
  originalName?: string; // Original product name from CSV (for image search)
  material: string;
  color: string;
  ecommerceDescription?: string; // Description for ecommerce/website
  variants: ProductVariant[];
  suggestedBrand?: string;
  selectedBrand?: { id: number; name: string };
  category?: { id: number; name: string; display_name?: string };
  publicCategories: Array<{ id: number; name: string }>;
  productTags: Array<{ id: number; name: string }>;
  isFavorite: boolean; // Editable favorite flag
}

interface ProductVariant {
  size: string;
  quantity: number; // Editable stock quantity (default 0)
  ean: string;
  sku?: string; // SKU for matching with PDF prices
  price: number;
  rrp: number;
}

type VendorType = 'ao76' | 'lenewblack' | null;

interface Brand {
  id: number;
  name: string;
  source: string;
}

interface Category {
  id: number;
  name: string;
  display_name?: string;
  complete_name?: string;
}

export default function ProductImport() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedVendor, setSelectedVendor] = useState<VendorType>(null);
  const [pdfPrices, setPdfPrices] = useState<Map<string, number>>(new Map());
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [brands, setBrands] = useState<Brand[]>([]);
  const [internalCategories, setInternalCategories] = useState<Category[]>([]);
  const [publicCategories, setPublicCategories] = useState<Category[]>([]);
  const [productTags, setProductTags] = useState<Category[]>([]);
  const [batchBrand, setBatchBrand] = useState('');
  const [batchCategory, setBatchCategory] = useState('');
  const [batchPublicCategories, setBatchPublicCategories] = useState<number[]>([]);
  const [batchProductTags, setBatchProductTags] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [importResults, setImportResults] = useState<{ success: boolean; results: Array<{ success: boolean; reference: string; name?: string; templateId?: number; variantsCreated?: number; message?: string }> } | null>(null);
  const [showApiPreview, setShowApiPreview] = useState(false);
  const [apiPreviewData, setApiPreviewData] = useState<{ product: ParsedProduct; testMode: boolean } | null>(null);

  const steps = [
    { id: 1, name: 'Upload', icon: '📤' },
    { id: 2, name: 'Mapping', icon: '🗺️' },
    { id: 3, name: 'Voorraad', icon: '📦' },
    { id: 4, name: 'Categorieën', icon: '📁' },
    { id: 5, name: 'Preview', icon: '👁️' },
    { id: 6, name: 'Test', icon: '🧪' },
    { id: 7, name: 'Import', icon: '🚀' },
  ];

  // Fetch brands, categories on mount
  useEffect(() => {
    fetchBrands();
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch when reaching categories step
  useEffect(() => {
    if (currentStep === 4 && brands.length === 0) {
      fetchBrands();
    }
    if (currentStep === 4 && (publicCategories.length === 0 || productTags.length === 0)) {
      fetchCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  const fetchBrands = async () => {
    try {
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        console.error('No Odoo credentials found');
        return;
      }

      const response = await fetch('/api/fetch-brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      const data = await response.json();
      
      if (data.success && data.brands) {
        setBrands(data.brands);
        console.log(`✅ Fetched ${data.brands.length} brands`);
      } else {
        console.error('Failed to fetch brands:', data.error);
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        console.error('No Odoo credentials found');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/debug-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      const data = await response.json();
      
      if (data.success) {
        setInternalCategories(data.internalCategories || []);
        setPublicCategories(data.publicCategories || []);
        setProductTags(data.productTags || []);
        console.log(`✅ Loaded ${data.internalCategories?.length || 0} internal categories`);
        console.log(`✅ Loaded ${data.publicCategories?.length || 0} public categories`);
        console.log(`✅ Loaded ${data.productTags?.length || 0} product tags`);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (selectedVendor === 'ao76') {
        parseAo76CSV(text);
      } else if (selectedVendor === 'lenewblack') {
        parseLeNewBlackCSV(text);
      }
    };
    reader.readAsText(file);
  };

  const handlePriceCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split('\n');
      
      if (lines.length < 2) {
        alert('CSV bestand is leeg of ongeldig');
        return;
      }

      const priceMap = new Map<string, number>();
      
      // Skip header line, parse data lines
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          const sku = parts[0].trim();
          const priceStr = parts[1].trim();
          const price = parseFloat(priceStr.replace(',', '.'));
          
          if (sku && !isNaN(price) && price > 0) {
            priceMap.set(sku, price);
          }
        }
      }
      
      setPdfPrices(priceMap);
      console.log(`✅ Loaded ${priceMap.size} prices from CSV`);
      alert(`✅ ${priceMap.size} prijzen geladen uit CSV`);
    };
    reader.readAsText(file);
  };

  const parseAo76CSV = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const headers = lines[0].split(';');
    const products: { [key: string]: ParsedProduct } = {};

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';');
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx]?.trim() || '';
      });

      const reference = row['Reference'] || row['reference'];
      if (!reference) continue;

      if (!products[reference]) {
        const name = row['Description'] || row['description'] || '';
        const material = row['Quality'] || row['Colour'] || row['material'] || '';
        const color = row['Colour'] || row['Color'] || row['color'] || '';
        
        // Auto-detect brand from name
        const nameLower = name.toLowerCase();
        const suggestedBrand = brands.find(b => 
          nameLower.includes(b.name.toLowerCase())
        );

        products[reference] = {
          reference,
          name: name.toLowerCase(),
          originalName: name, // Store original name for image search
          material,
          color,
          ecommerceDescription: name, // Store description for ecommerce (Ao76 uses name as description)
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: true, // Default to favorite
        };
      }

      // Parse prices with comma as decimal separator (European format)
      const parsePrice = (str: string) => {
        if (!str) return 0;
        return parseFloat(str.replace(',', '.'));
      };

      products[reference].variants.push({
        size: row['Size'] || row['size'] || '',
        quantity: 0, // Default stock to 0 (editable by user)
        ean: row['EAN barcode'] || row['barcode'] || '',
        price: parsePrice(row['Price'] || row['price'] || '0'),
        rrp: parsePrice(row['RRP'] || row['rrp'] || '0'),
      });
    }

    const productList = Object.values(products);
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
  };

  const parseLeNewBlackCSV = (text: string) => {
    // Le New Black format parser
    // First line is order reference, skip it and start from line 2 (headers)
    const lines = text.trim().split('\n');
    if (lines.length < 3) return; // Need at least: order ref, headers, and 1 data row

    // Skip first line (order reference), use second line as headers
    const headers = lines[1].split(';');
    const products: { [key: string]: ParsedProduct } = {};

    // Start from line 3 (index 2) for data rows
    for (let i = 2; i < lines.length; i++) {
      const values = lines[i].split(';');
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx]?.trim() || '';
      });

      // Le New Black format uses 'Product reference' as the grouping key
      const reference = row['Product reference'] || row['SKU'];
      if (!reference) continue;

      if (!products[reference]) {
        // Product name includes color at the end (e.g., "Bear fleece jacket Cookie")
        const fullName = row['Product name'] || '';
        const color = row['Color name'] || '';
        const description = row['Description'] || '';
        const brandName = row['Brand name'] || '';
        
        // Helper function to capitalize first letter of each word (Title Case)
        const toTitleCase = (str: string) => {
          return str.toLowerCase().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
        };
        
        // Helper function to capitalize only first letter (Sentence case)
        const toSentenceCase = (str: string) => {
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        // Format: "Hello Simone - Bear fleece jacket cookie"
        // Brand name: Title Case (all words capitalized)
        // Product name: Sentence case (only first word capitalized)
        const formattedBrandName = brandName ? toTitleCase(brandName) : '';
        const formattedProductName = fullName ? toSentenceCase(fullName) : '';
        const combinedName = formattedBrandName 
          ? `${formattedBrandName} - ${formattedProductName}` 
          : formattedProductName;
        
        // Try to detect brand
        const nameLower = brandName.toLowerCase() || fullName.toLowerCase();
        const suggestedBrand = brands.find(b => 
          nameLower.includes(b.name.toLowerCase())
        );

        products[reference] = {
          reference,
          name: combinedName,
          originalName: fullName, // Store original name for image search
          material: description, // Use description as material field
          color: color,
          ecommerceDescription: description, // Store description for ecommerce
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: true, // Default to favorite
        };
      }

      const parsePrice = (str: string) => {
        if (!str) return 0;
        // Le New Black uses comma as decimal separator (European format)
        return parseFloat(str.replace(',', '.'));
      };

      const netAmount = parsePrice(row['Net amount'] || '0');

      const sku = row['SKU'] || '';
      
      // Check if we have a price from PDF for this SKU
      const pdfPrice = sku && pdfPrices.has(sku) ? pdfPrices.get(sku)! : null;
      const costPrice = pdfPrice || netAmount; // Use PDF price if available, otherwise CSV price
      
      products[reference].variants.push({
        size: row['Size name'] || '',
        quantity: 0, // Default stock to 0 (editable by user)
        ean: row['EAN13'] || '',
        sku: sku, // Store SKU for PDF price matching
        price: costPrice, // Use PDF price if available, otherwise Net amount from CSV
        rrp: netAmount * 2.5, // Calculate suggested retail price from CSV net amount
      });
    }

    const productList = Object.values(products);
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
  };

  const toggleProduct = (reference: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(reference)) {
      newSelected.delete(reference);
    } else {
      newSelected.add(reference);
    }
    setSelectedProducts(newSelected);
  };

  const updateVariantQuantity = (productRef: string, variantIndex: number, newQuantity: number) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef
          ? {
              ...p,
              variants: p.variants.map((v, idx) =>
                idx === variantIndex ? { ...v, quantity: newQuantity } : v
              ),
            }
          : p
      )
    );
  };

  const updateVariantField = (productRef: string, variantIndex: number, field: keyof ProductVariant, value: string | number) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef
          ? {
              ...p,
              variants: p.variants.map((v, idx) =>
                idx === variantIndex ? { ...v, [field]: value } : v
              ),
            }
          : p
      )
    );
  };

  const updateProductName = (productRef: string, newName: string) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef ? { ...p, name: newName } : p
      )
    );
  };

  const toggleProductFavorite = (productRef: string) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef ? { ...p, isFavorite: !p.isFavorite } : p
      )
    );
  };

  const applyBatchBrand = () => {
    if (!batchBrand) return;
    const brand = brands.find(b => b.id.toString() === batchBrand);
    if (!brand) return;

    setParsedProducts(products =>
      products.map(p =>
        selectedProducts.has(p.reference)
          ? { ...p, selectedBrand: brand }
          : p
      )
    );
  };

  const applyBatchCategory = () => {
    if (!batchCategory) return;
    const category = internalCategories.find(c => c.id.toString() === batchCategory);
    if (!category) return;

    setParsedProducts(products =>
      products.map(p =>
        selectedProducts.has(p.reference)
          ? { ...p, category }
          : p
      )
    );
  };

  const addBatchPublicCategory = (categoryId: string) => {
    const id = parseInt(categoryId);
    if (!batchPublicCategories.includes(id)) {
      setBatchPublicCategories([...batchPublicCategories, id]);
    }
  };

  const removeBatchPublicCategory = (categoryId: number) => {
    setBatchPublicCategories(batchPublicCategories.filter(id => id !== categoryId));
  };

  const applyBatchPublicCategories = () => {
    if (batchPublicCategories.length === 0) return;
    
    const categoriesToAdd = publicCategories.filter(c => 
      batchPublicCategories.includes(c.id)
    );

    setParsedProducts(products =>
      products.map(p =>
        selectedProducts.has(p.reference)
          ? {
              ...p,
              publicCategories: [
                ...p.publicCategories,
                ...categoriesToAdd.filter(cat => 
                  !p.publicCategories.some(pc => pc.id === cat.id)
                )
              ]
            }
          : p
      )
    );
  };

  const addBatchProductTag = (tagId: string) => {
    const id = parseInt(tagId);
    if (!batchProductTags.includes(id)) {
      setBatchProductTags([...batchProductTags, id]);
    }
  };

  const removeBatchProductTag = (tagId: number) => {
    setBatchProductTags(batchProductTags.filter(id => id !== tagId));
  };

  const applyBatchProductTags = () => {
    if (batchProductTags.length === 0) return;
    
    const tagsToAdd = productTags.filter(t => 
      batchProductTags.includes(t.id)
    );

    setParsedProducts(products =>
      products.map(p =>
        selectedProducts.has(p.reference)
          ? {
              ...p,
              productTags: [
                ...p.productTags,
                ...tagsToAdd.filter(tag => 
                  !p.productTags.some(pt => pt.id === tag.id)
                )
              ]
            }
          : p
      )
    );
  };

  const addPublicCategory = (productRef: string, categoryId: string) => {
    const category = publicCategories.find(c => c.id.toString() === categoryId);
    if (!category) return;

    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef
          ? {
              ...p,
              publicCategories: [...p.publicCategories, category],
            }
          : p
      )
    );
  };

  const removePublicCategory = (productRef: string, categoryId: number) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef
          ? {
              ...p,
              publicCategories: p.publicCategories.filter(c => c.id !== categoryId),
            }
          : p
      )
    );
  };

  const addProductTag = (productRef: string, tagId: string) => {
    const tag = productTags.find(t => t.id.toString() === tagId);
    if (!tag) return;

    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef
          ? {
              ...p,
              productTags: [...p.productTags, tag],
            }
          : p
      )
    );
  };

  const removeProductTag = (productRef: string, tagId: number) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef
          ? {
              ...p,
              productTags: p.productTags.filter(t => t.id !== tagId),
            }
          : p
      )
    );
  };

  const testProduct = async (product: ParsedProduct) => {
    // Show API preview first
    setApiPreviewData({ product, testMode: true });
    setShowApiPreview(true);
  };

  const executeImport = async (testMode: boolean = false) => {
    setShowApiPreview(false);
    setLoading(true);

    try {
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        alert('Geen Odoo credentials gevonden. Log eerst in.');
        setLoading(false);
        return;
      }

      const productsToImport = testMode && apiPreviewData?.product
        ? [apiPreviewData.product]
        : parsedProducts.filter(p => selectedProducts.has(p.reference));

      const response = await fetch('/api/import-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: productsToImport,
          testMode,
          uid,
          password,
        }),
      });

      const result = await response.json();
      setImportResults(result);
      setCurrentStep(7);
    } catch (error) {
      console.error('Import error:', error);
      alert('Import failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = selectedProducts.size;
  const totalVariants = parsedProducts
    .filter(p => selectedProducts.has(p.reference))
    .reduce((sum, p) => sum + p.variants.length, 0);

  const readyProducts = parsedProducts.filter(
    p => selectedProducts.has(p.reference) && p.selectedBrand && p.category
  );

  return (
    <>
      <Head>
        <title>Product Import Wizard - Babette</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              📦 Product Import Wizard
            </h1>
            <p className="text-gray-600">
              Import producten van leveranciers in bulk met validatie en preview
            </p>
          </div>

          {/* Progress Bar */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                        step.id === currentStep
                          ? 'bg-blue-600 text-white'
                          : step.id < currentStep
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {step.icon}
                    </div>
                    <div className="text-sm mt-2 font-medium text-gray-700">
                      {step.name}
                    </div>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-1 w-24 mx-2 ${
                        step.id < currentStep ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            {/* Step 1: Upload */}
            {currentStep === 1 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">📤 Upload Product Data</h2>
                <p className="text-gray-600 mb-6">
                  Selecteer eerst de leverancier en upload dan de productgegevens.
                </p>

                {/* Vendor Selection */}
                <div className="mb-8">
                  <h3 className="font-bold text-lg mb-4">1️⃣ Selecteer Leverancier</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <button
                      onClick={() => setSelectedVendor('ao76')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'ao76'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-4xl mb-3">🏷️</div>
                      <h3 className="font-bold mb-2">Ao76</h3>
                      <p className="text-sm text-gray-600">
                        Standaard format met EAN, Reference, Description, Size
                      </p>
                      {selectedVendor === 'ao76' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('lenewblack')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'lenewblack'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-4xl mb-3">🎨</div>
                      <h3 className="font-bold mb-2">Le New Black</h3>
                      <p className="text-sm text-gray-600">
                        Order export met Brand name, Product reference, EAN13, Net amount
                      </p>
                      {selectedVendor === 'lenewblack' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>
                  </div>

                </div>

                {/* File Upload */}
                {selectedVendor && (
                  <>
                    <div className="mb-6">
                      <h3 className="font-bold text-lg mb-4">2️⃣ Upload Bestand</h3>
                      
                      {/* Automatic Defaults Info */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <h3 className="font-bold text-blue-900 mb-3">✨ Automatische Standaardinstellingen</h3>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Productsoort:</span>{' '}
                            <span className="text-gray-900">Verbruiksartikel</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Gewicht:</span>{' '}
                            <span className="text-gray-900">0,20 kg</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Voorraad bijhouden:</span>{' '}
                            <span className="text-green-600">✓ Ingeschakeld</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Kassa:</span>{' '}
                            <span className="text-green-600">✓ Verkopen</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Website:</span>{' '}
                            <span className="text-green-600">✓ Gepubliceerd</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Inkoop:</span>{' '}
                            <span className="text-red-600">✗ Uitgeschakeld</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Voorraad:</span>{' '}
                            <span className="text-gray-900">0 (instelbaar)</span>
                          </div>
                          <div className="bg-white rounded p-2">
                            <span className="font-medium text-gray-700">Out of stock bericht:</span>{' '}
                            <span className="text-gray-900">Verkocht!</span>
                          </div>
                        </div>
                        {selectedVendor === 'lenewblack' && (
                          <p className="text-xs text-blue-800 mt-3 border-t border-blue-300 pt-2">
                            <strong>Le New Black specifiek:</strong> Verkoopprijs wordt automatisch berekend als <strong>2.5x de inkoopprijs</strong>. Je kunt dit later aanpassen in stap 3.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="border-2 border-blue-500 rounded-lg p-6 text-center">
                          <div className="text-4xl mb-3">📄</div>
                          <h3 className="font-bold mb-2">CSV File</h3>
                          <p className="text-sm text-gray-600 mb-4">Product data (required)</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="csv-upload"
                          />
                          <label
                            htmlFor="csv-upload"
                            className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-700"
                          >
                            Kies CSV
                          </label>
                        </div>

                        <div className="border-2 border-orange-400 rounded-lg p-6 text-center">
                          <div className="text-4xl mb-3">💰</div>
                          <h3 className="font-bold mb-2">Prijzen CSV</h3>
                          <p className="text-sm text-gray-600 mb-4">Cost prices (optional)</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={handlePriceCsvUpload}
                            className="hidden"
                            id="price-csv-upload"
                          />
                          <label
                            htmlFor="price-csv-upload"
                            className={`px-4 py-2 rounded cursor-pointer inline-block ${
                              pdfPrices.size > 0 
                                ? 'bg-green-600 text-white hover:bg-green-700' 
                                : 'bg-orange-600 text-white hover:bg-orange-700'
                            }`}
                          >
                            {pdfPrices.size > 0 ? `✓ ${pdfPrices.size} prijzen geladen` : 'Kies Prijzen CSV'}
                          </label>
                          <div className="mt-3">
                            <a
                              href="/pdf-to-csv-converter"
                              target="_blank"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              📄 PDF naar CSV converter →
                            </a>
                          </div>
                        </div>
                      </div>

                      {pdfPrices.size > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                          <p className="text-green-800 font-medium">
                            ✅ Prijzen CSV geladen: {pdfPrices.size} SKU prijzen beschikbaar
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            Kostprijzen uit prijzen CSV worden gebruikt in plaats van product CSV prijzen waar beschikbaar
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Format Preview */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h4 className="font-bold text-yellow-800 mb-2">
                        ⚠️ Verwacht CSV Formaat voor {selectedVendor === 'ao76' ? 'Ao76' : 'Le New Black'}:
                      </h4>
                      {selectedVendor === 'ao76' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto">
{`EAN barcode;Reference;Description;Quality;Colour;Size;Quantity;Price;RRP;HS code
5400562408965;225-2003-103;silas t-shirt;50% recycled cotton;natural;04;1;21.6;54;6109100010`}
                        </pre>
                      ) : (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto">
{`order-2995931-20251013
Brand name;Collection;Product name;Product reference;Color name;Description;Size name;EAN13;SKU;Quantity;Net amount;Currency
Hello Simone;Winter 25 - 26;Bear fleece jacket cookie;AW25-BFLJC;Cookie;Large jacket...;3Y;3701153659547;AW25-BFLJC-3Y;1;65,00;EUR

→ Wordt: "Hello Simone - Bear fleece jacket cookie"`}
                        </pre>
                      )}
                    </div>
                  </>
                )}

                {!selectedVendor && (
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center">
                    <p className="text-gray-600">👆 Selecteer eerst een leverancier om te beginnen</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Mapping */}
            {currentStep === 2 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">🗺️ Field Mapping & Validation</h2>
                <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
                  <p className="text-green-800 font-medium">
                    {parsedProducts.length} rijen geïmporteerd, gegroepeerd in {parsedProducts.length} producten
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="border rounded p-4">
                    <div className="text-gray-600 text-sm">Totaal Rijen</div>
                    <div className="text-3xl font-bold">{parsedProducts.reduce((s, p) => s + p.variants.length, 0)}</div>
                  </div>
                  <div className="border rounded p-4">
                    <div className="text-gray-600 text-sm">Unieke Producten</div>
                    <div className="text-3xl font-bold">{parsedProducts.length}</div>
                  </div>
                  <div className="border rounded p-4">
                    <div className="text-gray-600 text-sm">Totaal Varianten</div>
                    <div className="text-3xl font-bold">{parsedProducts.reduce((s, p) => s + p.variants.length, 0)}</div>
                  </div>
                </div>

                <h3 className="font-bold mb-3">Product Groepen Preview</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Reference</th>
                        <th className="p-2 text-left">Naam</th>
                        <th className="p-2 text-left">Materiaal</th>
                        <th className="p-2 text-left">Kleur</th>
                        <th className="p-2 text-left">Varianten</th>
                        <th className="p-2 text-left">Verkoopprijs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedProducts.slice(0, 10).map(product => (
                        <tr key={product.reference} className="border-b">
                          <td className="p-2">{product.reference}</td>
                          <td className="p-2">{product.name}</td>
                          <td className="p-2 text-xs">{product.material}</td>
                          <td className="p-2">{product.color}</td>
                          <td className="p-2">{product.variants.length}</td>
                          <td className="p-2">€{product.variants[0]?.rrp.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedProducts.length > 10 && (
                  <p className="text-center text-gray-500 mt-3">... en {parsedProducts.length - 10} meer producten</p>
                )}

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Volgende: Selectie →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Selection & Stock */}
            {currentStep === 3 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">☑️ Selecteer Producten & Voorraad</h2>
                <p className="text-gray-600 mb-4">
                  Kies welke producten je wilt importeren en stel de voorraad in per variant (standaard: 0).
                </p>

                <div className="flex gap-3 mb-6">
                  <button
                    onClick={() => setSelectedProducts(new Set(parsedProducts.map(p => p.reference)))}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    ✓ Alles Selecteren
                  </button>
                  <button
                    onClick={() => setSelectedProducts(new Set())}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    ✗ Alles Deselecteren
                  </button>
                  <div className="ml-auto bg-blue-50 px-4 py-2 rounded">
                    <strong>{selectedCount}</strong> producten geselecteerd ({totalVariants} varianten)
                  </div>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {parsedProducts.map(product => (
                    <div
                      key={product.reference}
                      className={`border rounded-lg p-4 ${
                        selectedProducts.has(product.reference) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      {/* Product Header */}
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.reference)}
                          onChange={() => toggleProduct(product.reference)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="mb-2">
                                <label className="text-xs text-gray-600 font-medium">Product Naam</label>
                                <input
                                  type="text"
                                  value={product.name}
                                  onChange={(e) => updateProductName(product.reference, e.target.value)}
                                  className="w-full border-2 border-blue-300 rounded px-3 py-2 text-base font-bold focus:border-blue-500 focus:outline-none"
                                  placeholder="Product naam..."
                                />
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div>
                                  <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">{product.reference}</span>
                                  <span className="mx-2">•</span>
                                  <span className="text-xs">{product.color}</span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={product.isFavorite}
                                    onChange={() => toggleProductFavorite(product.reference)}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-xs font-medium">⭐ Favoriet</span>
                                </label>
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                {product.variants.length} varianten • Verkoopprijs: €{product.variants[0]?.rrp.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Variants Table */}
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm border-t">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="p-2 text-left">Maat</th>
                                  <th className="p-2 text-left">EAN</th>
                                  <th className="p-2 text-left">Kostprijs</th>
                                  <th className="p-2 text-left">Verkoopprijs</th>
                                  <th className="p-2 text-left">Voorraad</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variants.map((variant, idx) => (
                                  <tr key={idx} className="border-b">
                                    <td className="p-2">
                                      <input
                                        type="text"
                                        value={variant.size}
                                        onChange={(e) => updateVariantField(product.reference, idx, 'size', e.target.value)}
                                        className="w-16 border rounded px-2 py-1 text-center text-xs font-medium"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <input
                                        type="text"
                                        value={variant.ean}
                                        onChange={(e) => updateVariantField(product.reference, idx, 'ean', e.target.value)}
                                        className="w-full border rounded px-2 py-1 text-xs"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <div className="flex items-center gap-1">
                                        <span className="mr-1">€</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={variant.price}
                                          onChange={(e) => updateVariantField(product.reference, idx, 'price', parseFloat(e.target.value) || 0)}
                                          className={`w-20 border rounded px-2 py-1 text-right ${
                                            variant.sku && pdfPrices.has(variant.sku) ? 'border-orange-400 bg-orange-50' : ''
                                          }`}
                                        />
                                        {variant.sku && pdfPrices.has(variant.sku) && (
                                          <span className="text-xs text-orange-600" title="Prijs uit PDF">📋</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-2">
                                      <div className="flex items-center">
                                        <span className="mr-1">€</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={variant.rrp}
                                          onChange={(e) => updateVariantField(product.reference, idx, 'rrp', parseFloat(e.target.value) || 0)}
                                          className="w-20 border rounded px-2 py-1 text-right"
                                        />
                                      </div>
                                    </td>
                                    <td className="p-2">
                                      <input
                                        type="number"
                                        min="0"
                                        value={variant.quantity}
                                        onChange={(e) => {
                                          const newQty = parseInt(e.target.value) || 0;
                                          updateVariantQuantity(product.reference, idx, newQty);
                                        }}
                                        className="w-20 border rounded px-2 py-1 text-center"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => setCurrentStep(4)}
                    disabled={selectedCount === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    Volgende: Categorieën →
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Categories */}
            {currentStep === 4 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">📁 Categorieën Toewijzen</h2>
                <p className="text-gray-600 mb-6">
                  Wijs interne categorie (verplicht) en eCommerce categorieën (optioneel, meerdere mogelijk) toe.
                </p>

                {/* Data Status */}
                <div className={`border rounded p-3 mb-6 ${brands.length === 0 || internalCategories.length === 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Geladen:</span>{' '}
                      <span className="text-gray-900">
                        {brands.length} merken, {internalCategories.length} interne categorieën, {publicCategories.length} eCommerce categorieën, {productTags.length} productlabels
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        fetchBrands();
                        fetchCategories();
                      }}
                      disabled={loading}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      🔄 Vernieuw Data
                    </button>
                  </div>
                  {loading && (
                    <div className="mt-2 text-sm text-blue-600">⏳ Bezig met laden...</div>
                  )}
                  {!loading && (brands.length === 0 || internalCategories.length === 0) && (
                    <div className="mt-2 text-sm text-yellow-700">
                      ⚠️ Data nog niet geladen. Klik op &quot;🔄 Vernieuw Data&quot; om te laden.
                    </div>
                  )}
                </div>

                {/* Batch Assignments */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Batch Brand */}
                  <div className="border rounded p-4">
                    <h3 className="font-bold mb-3">🏷️ Merk (Batch) ({brands.length} beschikbaar)</h3>
                    <p className="text-xs text-gray-600 mb-2">Merken kunnen duplicaten zijn tussen MERK en Merk 1 attributen</p>
                    <select
                      value={batchBrand}
                      onChange={(e) => setBatchBrand(e.target.value)}
                      className="w-full border rounded p-2 mb-2"
                    >
                      <option value="">Selecteer merk...</option>
                      {brands.map(brand => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name} ({brand.source})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={applyBatchBrand}
                      disabled={!batchBrand}
                      className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:bg-gray-300"
                    >
                      Toepassen op Alles
                    </button>
                  </div>

                  {/* Batch Category */}
                  <div className="border rounded p-4">
                    <h3 className="font-bold mb-3">
                      📂 Interne Categorie (Batch) ({internalCategories.filter(c => c.display_name?.includes('Kleding')).length} beschikbaar)
                    </h3>
                    <select
                      value={batchCategory}
                      onChange={(e) => setBatchCategory(e.target.value)}
                      className="w-full border rounded p-2 mb-2"
                    >
                      <option value="">Selecteer interne categorie...</option>
                      {internalCategories
                        .filter(c => c.display_name?.includes('Kleding'))
                        .map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.display_name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={applyBatchCategory}
                      disabled={!batchCategory}
                      className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:bg-gray-300"
                    >
                      Toepassen op Alles
                    </button>
                  </div>
                </div>

                {/* Batch Public Categories */}
                <div className="border-2 border-blue-300 rounded-lg p-4 mb-6">
                  <h3 className="font-bold mb-3">
                    🛍️ eCommerce Categorieën (Batch - Meerdere mogelijk) ({publicCategories.length} beschikbaar)
                  </h3>
                  <p className="text-xs text-gray-600 mb-3">
                    Selecteer meerdere eCommerce categorieën om toe te voegen aan alle geselecteerde producten
                  </p>
                  
                  {/* Selected Categories Display */}
                  {batchPublicCategories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3 p-2 bg-blue-50 rounded">
                      {batchPublicCategories.map(catId => {
                        const cat = publicCategories.find(c => c.id === catId);
                        if (!cat) return null;
                        return (
                          <span
                            key={catId}
                            className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2"
                          >
                            {cat.display_name || cat.name}
                            <button
                              onClick={() => removeBatchPublicCategory(catId)}
                              className="hover:bg-blue-600 rounded-full px-1"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Category Selector */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addBatchPublicCategory(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full border rounded p-2 mb-3"
                  >
                    <option value="">+ Voeg eCommerce categorie toe...</option>
                    {publicCategories
                      .filter(c => !batchPublicCategories.includes(c.id))
                      .map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.display_name || cat.name}
                        </option>
                      ))}
                  </select>

                  <button
                    onClick={applyBatchPublicCategories}
                    disabled={batchPublicCategories.length === 0}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300 font-medium"
                  >
                    Toepassen op {selectedProducts.size} Geselecteerde Producten
                  </button>
                </div>

                {/* Batch Product Tags */}
                <div className="border-2 border-purple-300 rounded-lg p-4 mb-6">
                  <h3 className="font-bold mb-3">
                    🏷️ Productlabels (Batch - Meerdere mogelijk) ({productTags.length} beschikbaar)
                  </h3>
                  <p className="text-xs text-gray-600 mb-3">
                    Selecteer meerdere productlabels om toe te voegen aan alle geselecteerde producten
                  </p>
                  
                  {/* Selected Tags Display */}
                  {batchProductTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3 p-2 bg-purple-50 rounded">
                      {batchProductTags.map(tagId => {
                        const tag = productTags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <span
                            key={tagId}
                            className="bg-purple-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2"
                          >
                            {tag.name}
                            <button
                              onClick={() => removeBatchProductTag(tagId)}
                              className="hover:bg-purple-600 rounded-full px-1"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Tag Selector */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addBatchProductTag(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full border rounded p-2 mb-3"
                  >
                    <option value="">+ Voeg productlabel toe...</option>
                    {productTags
                      .filter(t => !batchProductTags.includes(t.id))
                      .map(tag => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                  </select>

                  <button
                    onClick={applyBatchProductTags}
                    disabled={batchProductTags.length === 0}
                    className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:bg-gray-300 font-medium"
                  >
                    Toepassen op {selectedProducts.size} Geselecteerde Producten
                  </button>
                </div>

                {/* Per Product Assignment */}
                <h3 className="font-bold mb-3">Per Product Categorieën</h3>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-left">Merk</th>
                        <th className="p-2 text-left">Interne Categorie</th>
                        <th className="p-2 text-left">eCommerce Cat.</th>
                        <th className="p-2 text-left">Productlabels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedProducts.filter(p => selectedProducts.has(p.reference)).map(product => (
                        <tr key={product.reference} className="border-b">
                          <td className="p-2">
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-gray-500">{product.reference}</div>
                          </td>
                          <td className="p-2">
                            <select
                              value={product.selectedBrand?.id || ''}
                              onChange={(e) => {
                                const brand = brands.find(b => b.id.toString() === e.target.value);
                                setParsedProducts(products =>
                                  products.map(p =>
                                    p.reference === product.reference ? { ...p, selectedBrand: brand } : p
                                  )
                                );
                              }}
                              className="w-full border rounded p-1 text-xs"
                            >
                              <option value="">Selecteer...</option>
                              {brands.map(brand => (
                                <option key={brand.id} value={brand.id}>
                                  {brand.name} ({brand.source})
                                </option>
                              ))}
                            </select>
                            {product.suggestedBrand && !product.selectedBrand && (
                              <div className="text-xs text-gray-500 mt-1">💡 Suggestie: {product.suggestedBrand}</div>
                            )}
                          </td>
                          <td className="p-2">
                            <select
                              value={product.category?.id || ''}
                              onChange={(e) => {
                                const category = internalCategories.find(c => c.id.toString() === e.target.value);
                                setParsedProducts(products =>
                                  products.map(p =>
                                    p.reference === product.reference ? { ...p, category } : p
                                  )
                                );
                              }}
                              className="w-full border rounded p-1 text-xs"
                            >
                              <option value="">Selecteer...</option>
                              {internalCategories
                                .filter(c => c.display_name?.includes('Kleding'))
                                .map(cat => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.display_name?.split(' / ').slice(-2).join(' / ') || cat.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1 mb-1">
                              {product.publicCategories.map(cat => (
                                <span
                                  key={cat.id}
                                  className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs flex items-center gap-1"
                                >
                                  {cat.name}
                                  <button
                                    onClick={() => removePublicCategory(product.reference, cat.id)}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  addPublicCategory(product.reference, e.target.value);
                                  e.target.value = '';
                                }
                              }}
                              className="w-full border rounded p-1 text-xs"
                            >
                              <option value="">+ Toevoegen...</option>
                              {publicCategories
                                .filter(c => !product.publicCategories.some(pc => pc.id === c.id))
                                .map(cat => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.display_name || cat.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1 mb-1">
                              {product.productTags.map(tag => (
                                <span
                                  key={tag.id}
                                  className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs flex items-center gap-1"
                                >
                                  {tag.name}
                                  <button
                                    onClick={() => removeProductTag(product.reference, tag.id)}
                                    className="text-purple-600 hover:text-purple-800"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  addProductTag(product.reference, e.target.value);
                                  e.target.value = '';
                                }
                              }}
                              className="w-full border rounded p-1 text-xs"
                            >
                              <option value="">+ Voeg label toe...</option>
                              {productTags
                                .filter(t => !product.productTags.some(pt => pt.id === t.id))
                                .map(tag => (
                                  <option key={tag.id} value={tag.id}>
                                    {tag.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Volgende: Preview →
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Preview */}
            {currentStep === 5 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">👁️ Preview Import</h2>
                <p className="text-gray-600 mb-6">
                  Review wat er aangemaakt wordt voordat je importeert.
                </p>

                {/* Automatic Defaults Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-blue-900 mb-3">ℹ️ Automatische Standaardinstellingen</h3>
                  <p className="text-sm text-blue-800 mb-3">
                    Alle geïmporteerde producten krijgen automatisch de volgende instellingen:
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Productsoort:</span>{' '}
                      <span className="text-gray-900">Verbruiksartikel</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Gewicht:</span>{' '}
                      <span className="text-gray-900">0,20 kg (per variant)</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Voorraad bijhouden:</span>{' '}
                      <span className="text-green-600">✓ Ingeschakeld</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Kassa:</span>{' '}
                      <span className="text-green-600">✓ Kan verkocht worden</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Website:</span>{' '}
                      <span className="text-green-600">✓ Babette. (gepubliceerd)</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Inkoop:</span>{' '}
                      <span className="text-red-600">✗ Uitgeschakeld</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Out of stock bericht:</span>{' '}
                      <span className="text-gray-900">&quot;Verkocht!&quot;</span>
                    </div>
                    <div className="bg-white rounded p-2">
                      <span className="font-medium text-gray-700">Facturatiebeleid:</span>{' '}
                      <span className="text-gray-900">Geleverde hoeveelheden</span>
                    </div>
                  </div>
                </div>


                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="border-2 border-blue-200 rounded p-4">
                    <div className="text-blue-600 text-sm mb-1">Product Templates</div>
                    <div className="text-3xl font-bold">{readyProducts.length}</div>
                  </div>
                  <div className="border-2 border-purple-200 rounded p-4">
                    <div className="text-purple-600 text-sm mb-1">Product Varianten</div>
                    <div className="text-3xl font-bold">{totalVariants}</div>
                  </div>
                  <div className="border-2 border-green-200 rounded p-4">
                    <div className="text-green-600 text-sm mb-1">Totale Voorraad</div>
                    <div className="text-3xl font-bold">
                      {parsedProducts
                        .filter(p => selectedProducts.has(p.reference))
                        .reduce((s, p) => s + p.variants.reduce((vs, v) => vs + v.quantity, 0), 0)}
                    </div>
                  </div>
                  <div className="border-2 border-orange-200 rounded p-4">
                    <div className="text-orange-600 text-sm mb-1">Klaar voor Import</div>
                    <div className="text-3xl font-bold">{readyProducts.length}</div>
                  </div>
                </div>

                {readyProducts.length < selectedCount && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                    <p className="text-yellow-800">
                      ⚠️ {selectedCount - readyProducts.length} producten missen nog merk of categorie
                    </p>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-left">Merk</th>
                        <th className="p-2 text-left">Categorie</th>
                        <th className="p-2 text-left">eCommerce Cat.</th>
                        <th className="p-2 text-left">Varianten</th>
                        <th className="p-2 text-left">Verkoopprijs</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedProducts.filter(p => selectedProducts.has(p.reference)).map(product => {
                        const ready = product.selectedBrand && product.category;
                        return (
                          <tr key={product.reference} className="border-b">
                            <td className="p-2">
                              <div className="font-medium">{product.name}</div>
                              <div className="text-xs text-gray-500">{product.reference}</div>
                            </td>
                            <td className="p-2">{product.selectedBrand?.name || '-'}</td>
                            <td className="p-2 text-xs">{product.category?.display_name?.split(' / ').slice(-1)[0] || product.category?.name || '-'}</td>
                            <td className="p-2">
                              {product.publicCategories.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {product.publicCategories.slice(0, 2).map(c => (
                                    <span key={c.id} className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                                      {c.name}
                                    </span>
                                  ))}
                                  {product.publicCategories.length > 2 && (
                                    <span className="text-xs text-gray-500">+{product.publicCategories.length - 2}</span>
                                  )}
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-2">{product.variants.length}</td>
                            <td className="p-2">€{product.variants[0]?.rrp.toFixed(2)}</td>
                            <td className="p-2">
                              {ready ? (
                                <span className="text-green-600">✓ Ready</span>
                              ) : (
                                <span className="text-red-600">✗ Incomplete</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    ← Terug
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCurrentStep(6)}
                      disabled={readyProducts.length === 0}
                      className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
                    >
                      🧪 Test Mode →
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Direct ${readyProducts.length} producten importeren?`)) {
                          executeImport(false);
                        }
                      }}
                      disabled={readyProducts.length === 0}
                      className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
                    >
                      🚀 Direct Importeren
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Test */}
            {currentStep === 6 && (
              <div>
                <h2 className="text-2xl font-bold mb-4">🧪 Test Mode</h2>
                <p className="text-gray-600 mb-6">
                  Selecteer een product om eerst te testen voordat je de bulk import uitvoert.
                </p>

                <div className="space-y-3">
                  {readyProducts.map(product => (
                    <div key={product.reference} className="border rounded p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold">{product.name}</div>
                          <div className="text-sm text-gray-600">
                            {product.variants.length} varianten • {product.selectedBrand?.name} • {product.category?.display_name?.split(' / ').slice(-1)[0] || product.category?.name}
                          </div>
                          {product.publicCategories.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {product.publicCategories.map(c => (
                                <span key={c.id} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                                  {c.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => testProduct(product)}
                          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                          🧪 Test Dit Product
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-6 py-2 border rounded hover:bg-gray-100"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Bulk import ${readyProducts.length} producten?`)) {
                        executeImport(false);
                      }
                    }}
                    className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Skip Test → Direct Importeren
                  </button>
                </div>
              </div>
            )}

            {/* Step 7: Results */}
            {currentStep === 7 && importResults && (
              <div>
                <h2 className="text-2xl font-bold mb-4">
                  {importResults.success ? '✅ Import Voltooid!' : '⚠️ Import Resultaten'}
                </h2>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <div className="text-green-600 text-sm mb-1">Succesvol</div>
                    <div className="text-3xl font-bold">
                      {importResults.results?.filter((r) => r.success).length || 0}
                    </div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded p-4">
                    <div className="text-red-600 text-sm mb-1">Mislukt</div>
                    <div className="text-3xl font-bold">
                      {importResults.results?.filter((r) => !r.success).length || 0}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded p-4">
                    <div className="text-blue-600 text-sm mb-1">Totaal</div>
                    <div className="text-3xl font-bold">{importResults.results?.length || 0}</div>
                  </div>
                </div>

                <h3 className="font-bold mb-3">Import Details</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Product Naam</th>
                        <th className="p-2 text-left">Product ID</th>
                        <th className="p-2 text-left">Varianten</th>
                        <th className="p-2 text-left">Bericht</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.results?.map((result, idx: number) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">
                            {result.success ? (
                              <span className="text-green-600">✅ Success</span>
                            ) : (
                              <span className="text-red-600">❌ Error</span>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{result.name || result.reference}</div>
                            <div className="text-xs text-gray-500">{result.reference}</div>
                          </td>
                          <td className="p-2">
                            {result.templateId ? (
                              <a
                                href={`/product-debug?id=${result.templateId}`}
                                target="_blank"
                                className="text-blue-600 hover:underline"
                              >
                                {result.templateId}
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="p-2">{result.variantsCreated || 0}</td>
                          <td className="p-2 text-xs text-gray-600">{result.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setSelectedVendor(null);
                      setParsedProducts([]);
                      setSelectedProducts(new Set());
                      setImportResults(null);
                    }}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    🔄 Nieuwe Import
                  </button>
                  
                  <Link
                    href="/product-images-import"
                    className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                  >
                    📸 Upload Afbeeldingen
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Preview Modal */}
      {showApiPreview && apiPreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto w-full">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">📋 API Call Preview - Production Safety Check</h3>
              <button
                onClick={() => setShowApiPreview(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
                <p className="text-yellow-800 font-medium">
                  ⚠️ Production Database: Controleer alle velden voordat je bevestigt. Deze API calls zullen permanent data aanmaken in je Odoo systeem.
                </p>
              </div>

              <div className="mb-6">
                <h4 className="font-bold mb-2">📦 Product Informatie:</h4>
                <div className="bg-gray-50 p-3 rounded text-sm">
                  <div><strong>Naam:</strong> {apiPreviewData.product.name}</div>
                  <div><strong>Varianten:</strong> {apiPreviewData.product.variants.length}</div>
                  <div><strong>Merk:</strong> {apiPreviewData.product.selectedBrand?.name}</div>
                  <div><strong>Categorie:</strong> {apiPreviewData.product.category?.display_name}</div>
                  {apiPreviewData.product.publicCategories.length > 0 && (
                    <div><strong>Public Categorieën:</strong> {apiPreviewData.product.publicCategories.map((c) => c.name).join(', ')}</div>
                  )}
                  {apiPreviewData.product.productTags.length > 0 && (
                    <div><strong>Product Tags:</strong> {apiPreviewData.product.productTags.map((t) => t.name).join(', ')}</div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Step 1: Create Product Template
                  </summary>
                  <pre className="p-3 text-xs overflow-x-auto bg-gray-50">
                    {JSON.stringify({
                      model: 'product.template',
                      method: 'create',
                      values: {
                        name: apiPreviewData.product.name,
                        categ_id: apiPreviewData.product.category?.id,
                        list_price: apiPreviewData.product.variants[0]?.rrp,
                        type: 'consu',
                        is_storable: true,
                        weight: 0.2,
                        tracking: 'none',
                        available_in_pos: true,
                        website_id: 1,
                        website_published: true,
                        public_categ_ids: [[6, 0, apiPreviewData.product.publicCategories.map((c) => c.id)]],
                        product_tag_ids: [[6, 0, apiPreviewData.product.productTags.map((t) => t.id)]],
                      }
                    }, null, 2)}
                  </pre>
                </details>

                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Step 2: Add Brand Attribute
                  </summary>
                  <pre className="p-3 text-xs overflow-x-auto bg-gray-50">
                    Brand: {apiPreviewData.product.selectedBrand?.name} (ID: {apiPreviewData.product.selectedBrand?.id})
                  </pre>
                </details>

                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Step 3: Add Size Attribute
                  </summary>
                  <pre className="p-3 text-xs overflow-x-auto bg-gray-50">
                    Sizes: {apiPreviewData.product.variants.map((v) => v.size).join(', ')}
                  </pre>
                </details>

                <details className="border rounded">
                  <summary className="bg-gray-100 p-3 cursor-pointer font-medium">
                    Step 4: Update {apiPreviewData.product.variants.length} Variants (Barcodes & Prices)
                  </summary>
                  <div className="p-3 text-xs overflow-x-auto bg-gray-50">
                    {apiPreviewData.product.variants.map((v, idx: number) => (
                      <div key={idx} className="mb-2 p-2 border rounded">
                        <div>Variant {idx + 1}: Size {v.size}</div>
                        <div>Barcode: {v.ean}</div>
                        <div>Cost Price: €{v.price}</div>
                        <div>Weight: 0.2 kg</div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowApiPreview(false)}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded hover:bg-gray-100"
                >
                  ✕ Annuleren
                </button>
                <button
                  onClick={() => executeImport(apiPreviewData.testMode)}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                >
                  ✅ Bevestigen & Uitvoeren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

