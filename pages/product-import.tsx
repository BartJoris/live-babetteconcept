import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';

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
  sizeAttribute?: string; // Manually editable size attribute (MAAT Baby's, MAAT Kinderen, etc.)
  images?: string[]; // Image URLs (for Play UP and other vendors)
  imagesFetched?: boolean; // Whether images have been fetched from website
}

interface ProductVariant {
  size: string;
  quantity: number; // Editable stock quantity (default 0)
  ean: string;
  sku?: string; // SKU for matching with PDF prices
  price: number;
  rrp: number;
}

type VendorType = 'ao76' | 'lenewblack' | 'playup' | 'floss' | 'armedangels' | null;

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

// Searchable Select Component
interface SearchableSelectProps {
  options: Array<{ id: number; label: string }>;
  value: number | string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function SearchableSelect({ options, value, onChange, placeholder = 'Selecteer...', className = '' }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get selected option label
  const selectedOption = value ? options.find(opt => opt.id.toString() === value.toString()) : null;
  const displayValue = selectedOption ? selectedOption.label : '';

  // Filter options based on search
  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionId: number) => {
    onChange(optionId.toString());
    setIsOpen(false);
    setSearch('');
    inputRef.current?.blur(); // Remove focus after selection
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? search : displayValue}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full border-2 border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-medium cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-600 dark:placeholder-gray-400"
        autoComplete="off"
      />
      {isOpen && (
        <div className="absolute z-50 w-full min-w-max mt-1 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-600 rounded-lg shadow-xl max-h-80 overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-sm text-gray-700 dark:text-gray-300 text-center">Geen resultaten voor &quot;{search}&quot;</div>
          ) : (
            filteredOptions.map(option => (
              <div
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-blue-500 dark:hover:bg-blue-600 hover:text-white cursor-pointer border-b dark:border-gray-700 last:border-b-0 transition-colors"
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Utility function to determine size attribute based on product variants or size string
function determineSizeAttribute(input: ProductVariant[] | string): string {
  // Handle string input
  if (typeof input === 'string') {
    const size = input;
    if (!size) return 'MAAT Kinderen';
    
    // Baby sizes: ends with "maand" or month numbers (3M, 6M, etc.)
    if (size.includes('maand') || /^\d+\s*M$/i.test(size)) {
      return "MAAT Baby's";
    }
    
    // Teen sizes: "jaar" with number >= 10, or Y sizes >= 10 (including 16Y, 18Y)
    if (size.includes('jaar')) {
      const match = size.match(/^(\d+)\s*jaar/i);
      if (match && parseInt(match[1]) >= 10) {
        return 'MAAT Tieners';
      }
    }
    if (/^(\d+)\s*Y$/i.test(size)) {
      const match = size.match(/^(\d+)\s*Y$/i);
      if (match && parseInt(match[1]) >= 10) {
        return 'MAAT Tieners';  // Covers 10Y, 12Y, 14Y, 16Y, 18Y
      }
    }
    
    // Kids sizes: "jaar" with number < 10, or Y sizes < 10
    if (size.includes('jaar') || /^\d+\s*Y$/i.test(size)) {
      return 'MAAT Kinderen';
    }
    
    // Adult sizes: XS, S, M, L, XL
    if (/^(XS|S|M|L|XL)$/i.test(size)) {
      return 'MAAT Volwassenen';
    }
    
    return 'MAAT Kinderen';
  }
  
  // Handle array input
  const variants = input;
  if (variants.length === 0) return 'MAAT Kinderen'; // Default fallback
  
  const firstSize = variants[0]?.size;
  if (!firstSize) return 'MAAT Kinderen'; // Safety check
  
  // Delegate to string version
  return determineSizeAttribute(firstSize);
}

// Map size codes to Dutch size names for MAAT Volwassenen
function mapSizeTodutchName(size: string): string {
  if (!size) return size;
  
  const sizeMapping: { [key: string]: string } = {
    'XS': 'XS - 34',
    'S': 'S - 36',
    'M': 'M - 38',
    'L': 'L - 40',
    'XL': 'XL - 42',
    'XXL': 'XXL - 44',
  };
  
  // If it's already a Dutch name (contains " - "), return as-is
  if (size.includes(' - ')) {
    return size;
  }
  
  // Try to extract the size code from the input
  const match = size.match(/^(XS|S|M|L|XL|XXL)/i);
  if (match) {
    const code = match[1].toUpperCase();
    return sizeMapping[code] || size;
  }
  
  return sizeMapping[size] || size;
}

// Transform product variants before sending to Odoo
function transformProductForUpload(product: ParsedProduct): ParsedProduct {
  // If product uses MAAT Volwassenen, map size codes to Dutch names
  if (product.sizeAttribute === 'MAAT Volwassenen') {
    return {
      ...product,
      variants: product.variants.map(v => ({
        ...v,
        size: mapSizeTodutchName(v.size),
      })),
    };
  }
  return product;
}

export default function ProductImportPage() {
  // @ts-expect-error - unused for now
  const router = useRouter();
  // @ts-expect-error - unused for now
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  // @ts-expect-error - unused for now
  const [file, setFile] = useState<File | null>(null);
  // @ts-expect-error - unused for now
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // @ts-expect-error - unused for now
  const [error, setError] = useState<string | null>(null);
  // @ts-expect-error - unused for now
  const [successCount, setSuccessCount] = useState(0);
  // @ts-expect-error - unused for now
  const [errorCount, setErrorCount] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedVendor, setSelectedVendor] = useState<VendorType>(null);
  const [pdfPrices, setPdfPrices] = useState<Map<string, number>>(new Map());
  const [websitePrices, setWebsitePrices] = useState<Map<string, number>>(new Map());
  const [playupUsername, setPlayupUsername] = useState('');
  const [playupPassword, setPlayupPassword] = useState('');
  const [eanProducts, setEANProducts] = useState<Array<{
    reference: string;
    description: string;
    size: string;
    colourCode: string;
    colourDescription: string;
    price: string;
    retailPrice: string;
    eanCode: string;
  }>>([]);
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
  
  // Search filters for dropdowns
  const [brandSearch, setBrandSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [publicCategorySearch, setPublicCategorySearch] = useState('');
  const [productTagSearch, setProductTagSearch] = useState('');
  
  const [importResults, setImportResults] = useState<{ success: boolean; results: Array<{ success: boolean; reference: string; name?: string; templateId?: number; variantsCreated?: number; message?: string }> } | null>(null);
  const [showApiPreview, setShowApiPreview] = useState(false);
  const [apiPreviewData, setApiPreviewData] = useState<{ product: ParsedProduct; testMode: boolean } | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; currentProduct?: string } | null>(null);
  const [imageImportResults, setImageImportResults] = useState<Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }>>([]);

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
    
    // Load Play UP credentials from localStorage
    const savedPlayupUser = localStorage.getItem('playup_username');
    const savedPlayupPass = localStorage.getItem('playup_password');
    if (savedPlayupUser) setPlayupUsername(savedPlayupUser);
    if (savedPlayupPass) setPlayupPassword(savedPlayupPass);
    
    // Check for matched images from image matcher
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const vendor = urlParams.get('vendor');
      const withImages = urlParams.get('withImages');
      
      if (vendor === 'playup' && withImages === 'true') {
        const matchedData = sessionStorage.getItem('playup_matched_images');
        if (matchedData) {
          try {
            const data = JSON.parse(matchedData);
            console.log('📸 Loading matched images from Image Matcher...');
            
            // Set vendor to playup
            setSelectedVendor('playup');
            
            // Load products with images
            loadMatchedProducts(data);
            
            // Clear sessionStorage after loading
            sessionStorage.removeItem('playup_matched_images');
          } catch (error) {
            console.error('Error loading matched images:', error);
          }
        }
      }
    }
    
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

  const getCredentials = async () => {
    // First, check if user has a valid session
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      if (data.isLoggedIn && data.user) {
        // User is logged in via session, but we need password from localStorage
        // since it's not returned from the session endpoint for security reasons
        const password = localStorage.getItem('odoo_pass');
        if (password) {
          return { uid: String(data.user.uid), password };
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
    
    // Fallback to localStorage (for backward compatibility)
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  const fetchBrands = async () => {
    try {
      const { uid, password } = await getCredentials();
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
      setIsLoading(true);
      const { uid, password } = await getCredentials();
      if (!uid || !password) {
        console.error('No Odoo credentials found');
        setIsLoading(false);
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
      setIsLoading(false);
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
      } else if (selectedVendor === 'playup') {
        parsePlayUpCSV(text);
      } else if (selectedVendor === 'floss') {
        parseFlossCSV(text);
      } else if (selectedVendor === 'armedangels') {
        // Detect if this is invoice CSV or catalog CSV
        const lines = text.trim().split('\n');
        if (lines.length > 0) {
          const firstLine = lines[0];
          // Check if it's a catalog (starts with "Table 1" or has Item Number in header)
          if (firstLine.includes('Table 1') || (lines.length > 1 && lines[1].includes('Item Number'))) {
            console.log('🛡️ Detected Armed Angels Catalog CSV');
            parseArmedAngelsCatalogCSV(text);
          } else {
            console.log('🛡️ Detected Armed Angels Invoice CSV');
            // For Armed Angels, invoice CSV MUST come after catalog CSV
            if (parsedProducts.length === 0) {
              alert('⚠️ EERST de Catalog CSV uploaden!\n\nUpload first:\n1. EAN Retail List (Catalog CSV)\n2. Then your Invoice CSV\n\nThe catalog contains all product info, EAN codes, and prices!');
              return;
            }
            parseArmedAngelsCSV(text);
          }
        }
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

  const loadMatchedProducts = (data: {
    csvProducts: Array<{
      article: string;
      color: string;
      description: string;
      size: string;
      quantity: number;
      price: number;
    }>;
    matchedProducts: Array<{
      article: string;
      color: string;
      description: string;
      imageCount: number;
      images: string[];
    }>;
  }) => {
    try {
      // Create a map of article+color to images
      const imageMap = new Map<string, string[]>();
      data.matchedProducts.forEach(mp => {
        const key = `${mp.article}_${mp.color}`;
        imageMap.set(key, mp.images);
      });

      // Group CSV products by article+color to create products with variants
      const productMap = new Map<string, ParsedProduct>();

      data.csvProducts.forEach(csvProduct => {
        const key = `${csvProduct.article}_${csvProduct.color}`;
        
        if (!productMap.has(key)) {
          // Create new product
          const sizeAttr = determineSizeAttribute(csvProduct.size);
          const images = imageMap.get(key) || [];
          
          productMap.set(key, {
            reference: csvProduct.article,
            name: `Play Up - ${csvProduct.description} - ${csvProduct.article}`,
            originalName: csvProduct.description,
            material: csvProduct.color,
            color: csvProduct.color,
            ecommerceDescription: csvProduct.description,
            variants: [],
            suggestedBrand: 'Play Up',
            publicCategories: [],
            productTags: [],
            isFavorite: false,
            sizeAttribute: sizeAttr,
            images: images,
            imagesFetched: images.length > 0,
          });
        }

        // Add variant
        const product = productMap.get(key)!;
        product.variants.push({
          size: csvProduct.size,
          quantity: csvProduct.quantity || 0,
          ean: '',
          price: csvProduct.price,
          rrp: 0,
        });
      });

      const products = Array.from(productMap.values());
      setParsedProducts(products);
      
      // Show notification
      const withImages = products.filter(p => p.images && p.images.length > 0).length;
      const totalImages = products.reduce((sum, p) => sum + (p.images?.length || 0), 0);
      
      alert(`✅ Loaded ${products.length} products from Image Matcher\n📸 ${withImages} products with images\n🖼️ ${totalImages} total images`);
      
      // Go to step 1.5 (image management)
      setCurrentStep(1.5);
      
      console.log(`✅ Loaded ${products.length} products with ${totalImages} images`);
    } catch (error) {
      console.error('Error loading matched products:', error);
      alert('Error loading matched products. Please try again.');
    }
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
          isFavorite: false, // Default to not favorite
        };
      }

      // Parse prices with comma as decimal separator (European format)
      const parsePrice = (str: string) => {
        if (!str) return 0;
        return parseFloat(str.replace(',', '.'));
      };

      products[reference].variants.push({
        size: row['Size'] || row['size'] || '',
        quantity: parseInt(row['Quantity'] || row['quantity'] || '0'), // Use quantity from CSV
        ean: row['EAN barcode'] || row['barcode'] || '',
        price: parsePrice(row['Price'] || row['price'] || '0'),
        rrp: parsePrice(row['RRP'] || row['rrp'] || '0'),
      });
    }

    const productList = Object.values(products);
    // Initialize size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
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
          isFavorite: false, // Default to not favorite
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
    // Initialize size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
  };

  // Helper function to format Play Up product descriptions with smart capitalization
  const formatDescription = (desc: string): string => {
    const words = desc.split(' ');
    return words.map((word, index) => {
      // First word: capitalize first letter, rest lowercase
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // "LS" or other 2-letter all-caps abbreviations: keep as caps
      if (word === 'LS' || (word.length === 2 && word === word.toUpperCase())) {
        return word;
      }
      // Everything else: lowercase
      return word.toLowerCase();
    }).join(' ');
  };

  // Helper function to format EAN sizes for Odoo
  const formatSizeForOdoo = (eanSize: string): string => {
    // Check for adult sizes FIRST (exact match only)
    const adultSizes: { [key: string]: string } = {
      'XS': 'XS - 34',
      'S': 'S - 36',
      'M': 'M - 38',
      'L': 'L - 40',
      'XL': 'XL - 42',
    };
    
    // If it's an exact match for adult size, return formatted
    if (adultSizes[eanSize.toUpperCase()]) {
      return adultSizes[eanSize.toUpperCase()];
    }
    
    // "3M", "12M" → "3 maand", "12 maand" (has number before M)
    if (/^\d+M$/i.test(eanSize)) {
      const num = eanSize.slice(0, -1);
      return `${num} maand`;
    }
    
    // "3Y", "6Y" → "3 jaar", "6 jaar" (has number before Y)
    if (/^\d+Y$/i.test(eanSize)) {
      const num = eanSize.slice(0, -1);
      return `${num} jaar`;
    }
    
    // Return as-is if no pattern matches
    return eanSize;
  };

  // Helper function to parse price from EAN format
  const parsePrice = (priceStr: string): number => {
    // "12,39 €" or "12.39" → 12.39
    if (!priceStr) return 0;
    return parseFloat(priceStr.replace(/[€\s]/g, '').replace(',', '.')) || 0;
  };

  // Parse EAN Retail CSV
  const handleEANFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseEANCSV(text);
    };
    reader.readAsText(file);
  };

  const parseEANCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const products: Array<{
      reference: string;
      description: string;
      size: string;
      colourCode: string;
      colourDescription: string;
      price: string;
      retailPrice: string;
      eanCode: string;
    }> = [];
    
    // Skip first 2 lines ("Table 1" and headers)
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
        });
      }
    }
    
    setEANProducts(products);
    console.log(`✅ Loaded ${products.length} EAN products from retail list`);
    
    // If delivery CSV was already uploaded, enrich the existing products
    if (parsedProducts.length > 0) {
      console.log(`🔄 Enriching ${parsedProducts.length} existing products with EAN data...`);
      enrichProductsWithEAN(parsedProducts, products);
    }
    
    alert(`✅ Loaded ${products.length} EAN entries from retail list${parsedProducts.length > 0 ? '\nProducts enriched with EAN data!' : ''}`);
  };

  const enrichProductsWithEAN = (existingProducts: ParsedProduct[], eanData: typeof eanProducts) => {
    const enriched = existingProducts.map(product => {
      const article = product.reference.split('_')[0];
      const color = product.reference.split('_')[1];
      
      // Find EAN entry for this product to get proper description and color
      const eanSample = eanData.find(ean => {
        const eanArticle = ean.reference.split('/')[1];
        return eanArticle === article && ean.colourCode === color;
      });
      
      console.log(`Enriching product: ${article} ${color}`);
      
      const enrichedVariants = product.variants.map(variant => {
        console.log(`  Checking variant size: "${variant.size}"`);
        
        // Find EAN match for this specific variant
        const eanMatch = eanData.find(ean => {
          const eanArticle = ean.reference.split('/')[1];
          const sizeMatch = ean.size === variant.size || formatSizeForOdoo(ean.size) === variant.size;
          
          if (eanArticle === article && ean.colourCode === color) {
            console.log(`    Checking EAN size: "${ean.size}" (formatted: "${formatSizeForOdoo(ean.size)}") vs variant: "${variant.size}" = ${sizeMatch}`);
          }
          
          return eanArticle === article && 
                 ean.colourCode === color && 
                 sizeMatch;
        });
        
        if (eanMatch) {
          console.log(`  ✅ ${article} ${variant.size}: EAN ${eanMatch.eanCode}`);
          return {
            ...variant,
            ean: eanMatch.eanCode,
            sku: `${article}_${color}`, // Use article_color format
            price: parsePrice(eanMatch.price),
            rrp: parsePrice(eanMatch.retailPrice),
            size: formatSizeForOdoo(eanMatch.size),
          };
        } else {
          console.log(`  ❌ ${article} ${variant.size}: No EAN match found`);
        }
        return variant;
      });
      
      // Update product name and color with EAN data
      if (eanSample) {
        const formattedDescription = formatDescription(eanSample.description);
        const colorLowercase = eanSample.colourDescription.toLowerCase();
        const newName = `Play Up - ${formattedDescription} (${colorLowercase})`;
        
        return {
          ...product,
          name: newName,
          originalName: eanSample.description,
          color: eanSample.colourDescription,
          ecommerceDescription: eanSample.description,
          variants: enrichedVariants,
        };
      }
      
      return {
        ...product,
        variants: enrichedVariants,
      };
    });
    
    setParsedProducts(enriched);
    console.log(`✅ Enriched ${enriched.length} products with EAN data`);
  };

  const parsePlayUpCSV = (text: string) => {
    // Play UP format parser
    // CSV format: Article,Color,Description,Size,Quantity,Price
    const lines = text.trim().split('\n');
    
    console.log(`📦 Parsing Play UP CSV...`);
    console.log(`📦 Total lines: ${lines.length}`);
    console.log(`📦 First line: ${lines[0]}`);
    console.log(`📦 Second line: ${lines[1]}`);
    
    if (lines.length < 2) {
      console.error('❌ Not enough lines in CSV');
      alert('CSV file is empty or invalid');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const products: { [key: string]: ParsedProduct } = {};

    console.log(`📦 Headers: ${JSON.stringify(headers)}`);
    
    // Validate headers
    if (!headers.includes('Article') || !headers.includes('Description')) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Invalid CSV format. Expected headers: Article,Color,Description,Size,Quantity,Price');
      return;
    }

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue; // Skip empty lines
      
      // Handle quoted fields (descriptions may contain commas)
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue);
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue); // Push last value
      
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = (values[idx] || '').trim();
      });

      const article = row['Article'] || '';
      const color = row['Color'] || '';
      const description = row['Description'] || '';
      const size = row['Size'] || '';
      const quantity = parseInt(row['Quantity'] || '0');
      const price = parseFloat(row['Price'] || '0');

      if (!article) {
        console.log(`⚠️ Skipping line ${i}: no article code`);
        continue;
      }

      // Use article_color as reference (unique product identifier, matches image naming)
      const reference = `${article}_${color}`;

      if (!products[reference]) {
        // Find EAN entry to get proper description and color name
        const eanSample = eanProducts.find(ean => {
          const eanArticle = ean.reference.split('/')[1];
          return eanArticle === article && ean.colourCode === color;
        });
        
        // Use EAN description if available, otherwise use delivery description
        const productDescription = eanSample ? eanSample.description : description;
        const colorDescription = eanSample ? eanSample.colourDescription.toLowerCase() : color;
        
        // Format product name: "Play Up - Description (Color)"
        const formattedDescription = formatDescription(productDescription);
        const formattedName = `Play Up - ${formattedDescription} (${colorDescription})`;
        
        // Try to detect brand (should be Play Up)
        const suggestedBrand = brands.find(b => 
          b.name.toLowerCase().includes('play up')
        );

        products[reference] = {
          reference,
          name: formattedName,
          originalName: productDescription,
          material: color, // Store color code as material
          color: colorDescription, // Use color description from EAN
          ecommerceDescription: productDescription,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
        };
        
        console.log(`➕ Created product: ${reference} - ${formattedName}`);
      }

      // Check if we have a website price for this article
      const websitePrice = websitePrices.has(article) ? websitePrices.get(article)! : null;
      const costPrice = websitePrice || price; // Use website price if available, otherwise CSV price
      
      // Find matching EAN entry for this specific variant
      // Compare delivery size with EAN size (need to normalize delivery size first)
      const normalizeDeliverySize = (s: string): string => {
        // "3 maand" → "3M", "6 jaar" → "6Y", "XS" → "XS"
        if (s.includes('maand')) return s.split(' ')[0] + 'M';
        if (s.includes('jaar')) return s.split(' ')[0] + 'Y';
        return s.toUpperCase();
      };
      
      const normalizedDeliverySize = normalizeDeliverySize(size);
      
      const eanMatch = eanProducts.find(ean => {
        const eanArticle = ean.reference.split('/')[1]; // Extract "1AR11002" from "PA01/1AR11002"
        return eanArticle === article && ean.colourCode === color && ean.size === normalizedDeliverySize;
      });

      const formattedSize = eanMatch ? formatSizeForOdoo(eanMatch.size) : size;
      
      if (eanMatch) {
        console.log(`  🔍 Found EAN for ${article} ${color} ${size}: ${eanMatch.eanCode}`);
      }
      
      const newVariant = {
        size: formattedSize, // "3 maand" (from "3M") or original if no EAN
        quantity: quantity,
        ean: eanMatch?.eanCode || '', // EAN from retail list
        sku: `${article}_${color}`, // Always use article_color format (e.g., "1AR11002_P6179")
        price: eanMatch ? parsePrice(eanMatch.price) : costPrice, // Cost price from EAN or fallback
        rrp: eanMatch ? parsePrice(eanMatch.retailPrice) : (price * 2.4), // Retail price from EAN or calculated
      };
      
      products[reference].variants.push(newVariant);
      
      // Update product color with description from EAN (first match for this article+color)
      if (eanMatch && !products[reference].color.includes(' ')) {
        // Only update if current color is just a code (e.g., "P6179"), not a description
        products[reference].color = eanMatch.colourDescription; // "WATERCOLOR"
      }
      
      console.log(`  Added variant: ${formattedSize} (qty: ${quantity}, EAN: ${newVariant.ean || 'none'}, SKU: ${newVariant.sku})`);
    }

    const productList = Object.values(products);
    console.log(`✅ Parsed ${productList.length} products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Initialize size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    // Don't automatically go to step 2 - stay on step 1 so user can fetch website prices
    // setCurrentStep(2);
  };

  const parseFlossCSV = (text: string) => {
    // Flöss format parser
    // Semicolon-separated format with headers on line 2
    // Handles multi-line quoted fields (company info, descriptions with newlines)
    
    console.log(`🌸 Parsing Flöss CSV...`);
    
    // Parse CSV properly handling quoted fields with semicolons and newlines
    const parseCSVLine = (text: string): string[][] => {
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentField = '';
      let inQuotes = false;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            currentField += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ';' && !inQuotes) {
          // End of field
          currentRow.push(currentField.trim());
          currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
          // End of row (only if not in quotes)
          if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(f => f)) { // Only add non-empty rows
              rows.push(currentRow);
              currentRow = [];
            }
            currentField = '';
          }
          // Skip \r\n combination
          if (char === '\r' && nextChar === '\n') {
            i++;
          }
        } else if (char !== '\r') {
          // Regular character
          currentField += char;
        }
      }
      
      // Add final field and row
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f)) {
          rows.push(currentRow);
        }
      }
      
      return rows;
    };
    
    const rows = parseCSVLine(text);
    
    console.log(`🌸 Total parsed rows: ${rows.length}`);
    if (rows.length > 0) console.log(`🌸 First row: ${rows[0][0]}`);
    if (rows.length > 1) console.log(`🌸 Second row (headers): ${rows[1].slice(0, 5).join(';')}`);
    
    if (rows.length < 3) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Row 0 is "Table 1", Row 1 is headers, Row 2+ is data
    const headers = rows[1];
    const products: { [key: string]: ParsedProduct } = {};

    console.log(`🌸 Headers: ${JSON.stringify(headers.slice(0, 15))}`);
    
    // Validate headers
    if (!headers.includes('Style No') || !headers.includes('Style Name')) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Style No, Style Name, Barcode, Wholesale Price EUR, Recommended Retail Price EUR');
      return;
    }

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    for (let i = 2; i < rows.length; i++) {
      const values = rows[i];
      if (!values || values.length === 0) continue;
      
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      const styleNo = row['Style No'] || '';
      const styleName = row['Style Name'] || '';
      const color = row['Color'] || '';
      const size = row['Size'] || '';
      const quantity = parseInt(row['Qty'] || '0');
      const barcode = row['Barcode'] || '';
      const quality = row['Quality'] || '';
      const description = row['Description'] || '';
      
      // Skip rows that are clearly not product rows
      if (!styleNo || !/^F\d+/.test(styleNo) || !styleName) {
        if (styleNo) {
          console.log(`⚠️ Skipping row ${i}: invalid Style No "${styleNo}"`);
        }
        continue;
      }
      
      const price = parsePrice(row['Wholesale Price EUR'] || '0');
      const rrp = parsePrice(row['Recommended Retail Price EUR'] || '0');

      // Use styleNo as reference
      const reference = styleNo;

      if (!products[reference]) {
        // Format product name to match Le New Black convention
        const toSentenceCase = (str: string) => {
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        const brandName = 'Flöss';
        const productNameWithColor = `${toSentenceCase(styleName)} - ${toSentenceCase(color)}`;
        const formattedName = `${brandName} - ${productNameWithColor}`;
        
        // Auto-detect Flöss brand
        const suggestedBrand = brands.find(b => 
          b.name.toLowerCase().includes('flöss') || b.name.toLowerCase().includes('floss')
        );

        products[reference] = {
          reference,
          name: formattedName,
          originalName: styleName,
          material: quality,
          color: color,
          ecommerceDescription: description,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
        };
        
        console.log(`➕ Created product: ${reference} - ${formattedName}`);
      }
      
      products[reference].variants.push({
        size: size,
        quantity: quantity,
        ean: barcode,
        price: price,
        rrp: rrp,
      });
    }

    const productList = Object.values(products);
    // Initialize size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
  };

  const parseArmedAngelsCSV = (text: string) => {
    // Armed Angels format parser
    // CSV format with headers: Item Number, Description, Color, Size, SKU, Quantity, Price (EUR)
    
    console.log(`🛡️ Parsing Armed Angels CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse CSV header (line 0)
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    console.log(`🛡️ Headers: ${JSON.stringify(headers)}`);
    
    // Validate headers
    if (!headers.includes('Item Number') || !headers.includes('Description') || !headers.includes('Color')) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Item Number, Description, Color, Size, SKU, Quantity, Price (EUR)');
      return;
    }

    // Find column indices
    const itemNumberIdx = headers.indexOf('Item Number');
    const descriptionIdx = headers.indexOf('Description');
    const colorIdx = headers.indexOf('Color');
    const sizeIdx = headers.indexOf('Size');
    const skuIdx = headers.indexOf('SKU');
    const quantityIdx = headers.indexOf('Quantity');
    const priceIdx = headers.indexOf('Price (EUR)');

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    // Parse CSV lines handling quoted fields
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parsing that handles quoted fields
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const nextChar = line[j + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentValue += '"';
            j++; // Skip next quote
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

      if (values.length < Math.max(itemNumberIdx, descriptionIdx, colorIdx) + 1) {
        continue; // Skip incomplete rows
      }

      const itemNumber = values[itemNumberIdx]?.trim() || '';
      const description = values[descriptionIdx]?.trim() || '';
      const color = values[colorIdx]?.trim() || '';
      const size = values[sizeIdx]?.trim() || '';
      const sku = values[skuIdx]?.trim() || '';
      const quantity = parseInt(values[quantityIdx]?.trim() || '0');
      const price = parsePrice(values[priceIdx]?.trim() || '0');

      if (!itemNumber || !description) continue; // Skip invalid rows

      // Use itemNumber as reference (for grouping by product)
      const reference = itemNumber;
      const productKey = `${reference}_${color}`; // Group by item and color

      if (!products[productKey]) {
        // Create new product
        const suggestedBrand = brands.find(b => 
          b.name.toLowerCase().includes('armed angels') || b.name.toLowerCase().includes('armedangels')
        );

        products[productKey] = {
          reference,
          name: `Armed Angels - ${description} - ${itemNumber}`,
          originalName: description,
          color: color,
          material: '',
          ecommerceDescription: '',
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
        };
        
        console.log(`➕ Created product: ${reference} - ${description}`);
      }

      // Add variant
      products[productKey].variants.push({
        size: size,
        quantity: quantity,
        ean: sku || '',
        price: price,
        rrp: price * 2.4, // Calculate RRP similar to Play Up
      });
    }

    const productList = Object.values(products);
    // Initialize size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    console.log(`🛡️ Parsed ${productList.length} products from Armed Angels CSV`);
    
    // If catalog products already exist, enrich them with invoice quantities
    if (parsedProducts.length > 0) {
      console.log(`🔄 Enriching ${parsedProducts.length} catalog products with invoice quantities...`);
      enrichArmedAngelsProducts(parsedProducts, productList);
    } else {
      // Otherwise, just use the invoice products
      setParsedProducts(productList);
      setSelectedProducts(new Set(productList.map(p => p.reference)));
    }
    
    setCurrentStep(2);
  };

  const enrichArmedAngelsProducts = (catalogProducts: ParsedProduct[], invoiceProducts: ParsedProduct[]) => {
    // Enrich catalog products with invoice quantities
    const enrichedReferences = new Set<string>(); // Track which products were enriched
    
    catalogProducts.forEach(catalogProduct => {
      const invoiceProduct = invoiceProducts.find(p => {
        // Exact match: same reference and same color
        if (p.reference === catalogProduct.reference && p.color === catalogProduct.color) {
          return true;
        }
        // Fallback: if invoice has empty color, match by reference only
        if (p.reference === catalogProduct.reference && (!p.color || p.color.trim() === '')) {
          return true;
        }
        return false;
      });
      
      if (invoiceProduct) {
        console.log(`✨ Enriching ${catalogProduct.reference} (${catalogProduct.color || 'no color'}) with invoice data`);
        enrichedReferences.add(catalogProduct.reference + '|' + (catalogProduct.color || '')); // Track this product
        
        // Update quantities based on invoice data
        invoiceProduct.variants.forEach(invoiceVariant => {
          const catalogVariant = catalogProduct.variants.find(v => 
            v.size === invoiceVariant.size || 
            (invoiceVariant.size === 'One Size' && catalogProduct.variants.length === 1)
          );
          
          if (catalogVariant) {
            catalogVariant.quantity = invoiceVariant.quantity;
            console.log(`  Updated ${catalogProduct.reference} size ${invoiceVariant.size}: quantity = ${invoiceVariant.quantity}`);
          }
        });
        
        // Mark invoice product as used so we don't try to match it again
        invoiceProduct.reference = '__USED__' + invoiceProduct.reference;
      }
    });
    
    // Filter to only keep enriched products
    const enrichedProducts = catalogProducts.filter(p => 
      enrichedReferences.has(p.reference + '|' + (p.color || ''))
    ).map(product => ({
      ...product,
      // Remove variants with quantity 0 (not ordered)
      variants: product.variants.filter(v => v.quantity > 0)
    }));
    
    console.log(`✅ Successfully enriched ${enrichedProducts.length} catalog products with invoice data`);
    
    setParsedProducts(enrichedProducts);
    setSelectedProducts(new Set(enrichedProducts.map(p => p.reference)));
  };

  const parseArmedAngelsCatalogCSV = (text: string) => {
    // Armed Angels Catalog format parser (like PlayUp EAN CSV)
    // Semicolon-separated format with headers on line 2
    // Each row is a product variant with all details
    // ID column = ItemNumber + ColorCode combined
    
    console.log(`🛡️ Parsing Armed Angels Catalog CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 3) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Line 0 is "Table 1", Line 1 is headers
    const headers = lines[1].split(';').map(h => h.trim());
    console.log(`🛡️ Found ${headers.length} columns`);
    
    // Find column indices
    const idIdx = headers.indexOf('ID'); // Combined item+color ID
    const itemNumberIdx = headers.indexOf('Item Number');
    const descriptionIdx = headers.indexOf('Item Description');
    const colorDescIdx = headers.indexOf('Color Description');
    const colorCodeIdx = headers.indexOf('Color Code');
    const sizeCodeIdx = headers.indexOf('Size Code');
    const skuIdx = headers.indexOf('SKU Number');
    const eanIdx = headers.indexOf('EAN');
    const priceWholesaleIdx = headers.indexOf('Price Whoesale (EUR)');
    const rrpIdx = headers.indexOf('RPR (EUR)');
    
    // Log the found indices
    console.log(`🛡️ Column indices - ID: ${idIdx}, Item#: ${itemNumberIdx}, EAN: ${eanIdx}, Price: ${priceWholesaleIdx}, RRP: ${rrpIdx}`);
    
    // Debug: show first 25 headers
    console.log(`🛡️ Headers (0-25):`, headers.slice(0, 25).map((h, i) => `${i}:${h}`));
    
    // Validate key headers exist
    if (idIdx === -1 || itemNumberIdx === -1 || descriptionIdx === -1 || eanIdx === -1 || priceWholesaleIdx === -1) {
      console.error('❌ Missing required columns. Found:', headers.slice(0, 15));
      alert('Ongeldig CSV-formaat. Kan de volgende kolommen niet vinden: ID, Item Number, Item Description, EAN, Price Whoesale (EUR)');
      return;
    }

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      // Remove currency symbol and parse
      const cleaned = str.replace(/[€£$]/g, '').replace(',', '.').trim();
      return parseFloat(cleaned);
    };

    // Parse CSV lines (semicolon-separated)
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(';').map(v => v.trim());

      if (values.length < Math.max(idIdx, itemNumberIdx, descriptionIdx, eanIdx, priceWholesaleIdx) + 1) {
        continue; // Skip incomplete rows
      }

      const combinedId = values[idIdx] || ''; // e.g., "300051603232"
      const itemNumber = values[itemNumberIdx] || ''; // e.g., "30005160"
      const description = values[descriptionIdx] || '';
      const colorCode = values[colorCodeIdx] || ''; // e.g., "3232"
      const colorDesc = values[colorDescIdx] || ''; // e.g., "tinted navy"
      const sizeCode = values[sizeCodeIdx] || '';
      const sku = values[skuIdx] || '';
      const ean = values[eanIdx] || '';
      const price = parsePrice(values[priceWholesaleIdx] || '0');
      const rrp = rrpIdx !== -1 ? parsePrice(values[rrpIdx] || '0') : 0;

      if (!combinedId || !itemNumber || !description) continue; // Skip invalid rows

      // Debug first few rows
      if (i <= 5) {
        console.log(`🛡️ Row ${i}: SKU=${sku}, EAN=${ean}, Price=${price}, RRP=${rrp}`);
      }

      // Use combinedId as the product key (includes item + color)
      const productKey = combinedId;
      
      // Combine color code and description
      const colorDisplay = colorCode ? `${colorCode} ${colorDesc}` : colorDesc;

      if (!products[productKey]) {
        // Create new product (once per color variant of an item)
        const suggestedBrand = brands.find(b => 
          b.name.toLowerCase().includes('armed angels') || b.name.toLowerCase().includes('armedangels')
        );

        products[productKey] = {
          reference: itemNumber, // Use item number as reference, not combined ID
          name: `Armed Angels - ${description} - ${colorDisplay}`,
          originalName: description,
          color: colorDisplay,
          material: '',
          ecommerceDescription: '',
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
        };
        
        console.log(`➕ Created product: ${itemNumber} - ${description} - ${colorDisplay}`);
      }

      // Add variant with EAN and pricing
      products[productKey].variants.push({
        size: sizeCode,
        quantity: 0, // Not specified in catalog, will be set during import
        ean: ean || sku || '',
        price: price,
        rrp: rrp,
      });
    }

    const productList = Object.values(products);
    // Initialize size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    console.log(`🛡️ Parsed ${productList.length} products from Armed Angels Catalog CSV`);
    console.log(`🛡️ First product variants:`, productList[0]?.variants.slice(0, 2));
    if (productList.length > 0 && productList[0]) {
      console.log(`🛡️ FULL FIRST PRODUCT:`, JSON.stringify(productList[0], null, 2));
    }
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    // DON'T advance step here - user needs to upload invoice CSV next
  };

  const fetchFlossImages = async (imageFolder: File[]) => {
    if (imageFolder.length === 0) {
      alert('Geen afbeeldingen geselecteerd');
      return;
    }

    if (!importResults || !importResults.results) {
      alert('Geen import resultaten gevonden');
      return;
    }

    const { uid, password } = await getCredentials();
    if (!uid || !password) {
      alert('Geen Odoo credentials gevonden');
      return;
    }

    setIsLoading(true);
    const results: Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }> = [];

    try {
      // Get successful products with Template IDs
      const successfulProducts = importResults.results.filter(r => r.success && r.templateId);

      // Create mapping from Style No to Template ID
      const styleNoToTemplateId: Record<string, number> = {};
      for (const result of successfulProducts) {
        if (result.templateId) {
          styleNoToTemplateId[result.reference] = result.templateId;
        }
      }

      console.log(`🌸 Processing ${imageFolder.length} images...`);

      // Read and convert images
      const imagesToUpload: Array<{ base64: string; filename: string; styleNo: string }> = [];
      
      for (const file of imageFolder) {
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Extract Style No from filename
          // Format: "F10625 - Apple Knit Cardigan - Red Apple - Main.jpg"
          const styleNoMatch = file.name.match(/^([F\d]+)\s*-/);
          const styleNo = styleNoMatch ? styleNoMatch[1] : '';

          if (!styleNo) {
            console.log(`⚠️ Could not extract Style No from: ${file.name}`);
            continue;
          }

          if (!styleNoToTemplateId[styleNo]) {
            console.log(`⚠️ No template ID found for style ${styleNo}`);
            continue;
          }

          imagesToUpload.push({
            base64,
            filename: file.name,
            styleNo,
          });

          console.log(`✅ Loaded image: ${file.name} (Style No: ${styleNo})`);
        } catch (error) {
          console.error(`❌ Error reading file ${file.name}:`, error);
        }
      }

      if (imagesToUpload.length === 0) {
        alert('Geen geldige afbeeldingen gevonden. Zorg ervoor dat bestandsnamen beginnen met Style No (bijv. F10625 - ...)');
        setIsLoading(false);
        return;
      }

      console.log(`🌸 Uploading ${imagesToUpload.length} images...`);

      // Upload images in batches to avoid exceeding request size limits
      // Each image is typically 1-3MB in base64, so we process 2 per batch to stay well under limits
      const BATCH_SIZE = 2; // Process 2 images per request
      const batches = [];
      
      for (let i = 0; i < imagesToUpload.length; i += BATCH_SIZE) {
        batches.push(imagesToUpload.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`📦 Split into ${batches.length} batch(es) of max ${BATCH_SIZE} images`);
      
      // Log total size estimate
      let totalSize = 0;
      for (const img of imagesToUpload) {
        totalSize += img.base64.length;
      }
      console.log(`📊 Total image data size: ~${(totalSize / 1024 / 1024).toFixed(2)}MB`);
      
      let totalUploaded = 0;
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        let batchSize = 0;
        for (const img of batch) {
          batchSize += img.base64.length;
        }
        console.log(`🌸 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images (~${(batchSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        // Upload batch
        const response = await fetch('/api/floss-upload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batch,
            styleNoToTemplateId,
            odooUid: uid,
            odooPassword: password,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Batch ${batchIndex + 1} failed with status ${response.status}:`, errorText.substring(0, 200));
          throw new Error(`Batch ${batchIndex + 1} upload failed with status ${response.status}`);
        }

        const imageResult = await response.json();
        
        if (!imageResult.success) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, imageResult.error);
          for (const result of imageResult.results || []) {
            results.push({
              reference: result.styleNo,
              success: false,
              imagesUploaded: 0,
              error: result.error || 'Unknown error',
            });
          }
        } else {
          console.log(`✅ Batch ${batchIndex + 1} complete: ${imageResult.imagesUploaded}/${imageResult.totalImages} uploaded`);
          totalUploaded += imageResult.imagesUploaded;
          
          if (imageResult.results) {
            for (const result of imageResult.results) {
              results.push({
                reference: result.styleNo,
                success: result.success,
                imagesUploaded: result.success ? 1 : 0,
                error: result.error,
              });
            }
          }
        }
      }
      
      console.log(`🎉 Total uploaded: ${totalUploaded}/${imagesToUpload.length} images`);
      setImageImportResults(results);
      setIsLoading(false);
      setCurrentStep(7);

    } catch (error) {
      console.error('❌ Error uploading images:', error);
      alert(`❌ Error: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlayUpPrices = async () => {
    if (!playupUsername || !playupPassword) {
      alert('Vul eerst Play UP credentials in');
      return;
    }

    setIsLoading(true);
    try {
      // Get unique products with article codes and descriptions
      const uniqueProducts = Array.from(
        new Map(
          parsedProducts.map(p => [
            p.variants[0]?.sku?.split('-')[0] || p.reference,
            {
              article: p.variants[0]?.sku?.split('-')[0] || p.reference,
              description: p.ecommerceDescription || p.material || p.originalName || '',
            }
          ])
        ).values()
      ).filter(p => p.article && p.description);

      console.log(`🎮 Fetching prices for ${uniqueProducts.length} unique products...`);

      const response = await fetch('/api/playup-fetch-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: playupUsername,
          password: playupPassword,
          products: uniqueProducts,
        }),
      });

      const result = await response.json();
      
      if (result.success && result.prices) {
        const priceMap = new Map<string, number>();
        Object.entries(result.prices).forEach(([code, price]) => {
          priceMap.set(code, price as number);
        });
        
        setWebsitePrices(priceMap);
        
        // Update products with website prices
        setParsedProducts(products =>
          products.map(p => ({
            ...p,
            variants: p.variants.map(v => {
              const articleCode = v.sku?.split('-')[0] || '';
              const websitePrice = priceMap.get(articleCode);
              return websitePrice ? { ...v, price: websitePrice } : v;
            }),
          }))
        );
        
        // Save credentials
        localStorage.setItem('playup_username', playupUsername);
        localStorage.setItem('playup_password', playupPassword);
        
        let message = `✅ ${result.count} van ${uniqueProducts.length} prijzen opgehaald van Play UP website\n\n`;
        
        if (result.notFound && result.notFound.length > 0) {
          message += `⚠️ Niet gevonden (${result.notFound.length}):\n`;
          message += result.notFound.slice(0, 10).join('\n');
          if (result.notFound.length > 10) {
            message += `\n... en ${result.notFound.length - 10} meer`;
          }
        }
        
        alert(message);
      } else {
        alert('Fout bij ophalen prijzen: ' + (result.error || 'Onbekende fout'));
      }
    } catch (error) {
      console.error('Error fetching Play UP prices:', error);
      alert('Fout bij ophalen Play UP prijzen');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualImageUpload = (productReference: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('Selecteer alleen afbeeldingen (jpg, png, etc.)');
      return;
    }

    // Convert files to data URLs for preview and storage
    const promises = imageFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (typeof result === 'string') {
            resolve(result);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises)
      .then(dataUrls => {
        setParsedProducts(products =>
          products.map(p =>
            p.reference === productReference
              ? { ...p, images: [...(p.images || []), ...dataUrls] }
              : p
          )
        );
      })
      .catch(error => {
        console.error('Error uploading images:', error);
        alert('Fout bij uploaden van afbeeldingen');
      });
  };

  const removeProductImage = (productReference: string, imageIndex: number) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productReference
          ? { ...p, images: p.images?.filter((_, idx) => idx !== imageIndex) }
          : p
      )
    );
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
      products.map(p => {
        if (p.reference === productRef) {
          // If changing rrp (Verkoopprijs), apply to ALL variants of this product
          if (field === 'rrp') {
            return {
              ...p,
              variants: p.variants.map(v => ({ ...v, rrp: value as number })),
            };
          }
          // For other fields, only update the specific variant
          return {
            ...p,
            variants: p.variants.map((v, idx) =>
              idx === variantIndex ? { ...v, [field]: value } : v
            ),
          };
        }
        return p;
      })
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

  const updateProductSizeAttribute = (productRef: string, newAttribute: string) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef ? { ...p, sizeAttribute: newAttribute } : p
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
    setIsLoading(true);

    try {
      const { uid, password } = await getCredentials();
      if (!uid || !password) {
        alert('Geen Odoo credentials gevonden. Log eerst in.');
        setIsLoading(false);
        return;
      }

      const productsToImport = testMode && apiPreviewData?.product
        ? [apiPreviewData.product]
        : parsedProducts.filter(p => selectedProducts.has(p.reference));

      // Client-side batch processing to avoid Vercel timeout
      const results: Array<{ success: boolean; reference: string; name?: string; templateId?: number; variantsCreated?: number; variantsUpdated?: number; message?: string }> = [];
      
      setImportProgress({ current: 0, total: productsToImport.length });

      for (let i = 0; i < productsToImport.length; i++) {
        const product = productsToImport[i];
        setImportProgress({ 
          current: i + 1, 
          total: productsToImport.length,
          currentProduct: product.name
        });

        try {
          // Import one product at a time to stay under Vercel's 10s timeout
          const response = await fetch('/api/import-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              products: [transformProductForUpload(product)], // Apply Dutch size names before upload
              testMode,
              uid,
              password,
            }),
          });

          const result = await response.json();
          
          if (result.success && result.results && result.results.length > 0) {
            results.push(result.results[0]);
          } else {
            results.push({
              success: false,
              reference: product.reference,
              name: product.name,
              message: result.error || 'Unknown error',
            });
          }
        } catch (error) {
          console.error(`Error importing ${product.reference}:`, error);
          results.push({
            success: false,
            reference: product.reference,
            name: product.name,
            message: String(error),
          });
        }
      }

      setImportProgress(null);
      setImportResults({ success: true, results });
      
      // Save Play UP import results to sessionStorage for image upload
      if (selectedVendor === 'playup') {
        const playupResults = results
          .filter(r => r.success && r.templateId)
          .map(r => ({
            reference: r.reference || '', // Full reference: "1AR11003-R324G"
            colorCode: r.reference?.split('-')[1] || '', // Extract color code (e.g., "R324G")
            description: r.name?.split(' - ')[1] || '', // Extract description from name
            name: r.name || '',
            templateId: r.templateId || 0,
          }));
        
        if (typeof window !== 'undefined' && playupResults.length > 0) {
          sessionStorage.setItem('playup_import_results', JSON.stringify(playupResults));
          console.log(`💾 Saved ${playupResults.length} Play UP products to session for image upload`);
          playupResults.forEach(r => {
            console.log(`   - ${r.reference} → Template ${r.templateId}`);
          });
        }
      }
      
      setCurrentStep(7);
    } catch (error) {
      console.error('Import error:', error);
      alert('Import failed: ' + error);
      setImportProgress(null);
    } finally {
      setIsLoading(false);
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

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              📦 Product Import Wizard
            </h1>
            <p className="text-gray-800 dark:text-gray-300">
              Import producten van leveranciers in bulk met validatie en preview
            </p>
          </div>

          {/* Progress Bar */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
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
                    <div className="text-sm mt-2 font-medium text-gray-700 dark:text-gray-300">
                      {step.name}
                    </div>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-1 w-24 mx-2 ${
                        step.id < currentStep ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
            {/* Step 1: Upload */}
            {currentStep === 1 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">📤 Upload Product Data</h2>
                <p className="text-gray-800 dark:text-gray-300 mb-6 font-medium">
                  Selecteer eerst de leverancier en upload dan de productgegevens.
                </p>

                {/* Vendor Selection */}
                <div className="mb-8">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">1️⃣ Selecteer Leverancier</h3>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <button
                      onClick={() => setSelectedVendor('ao76')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'ao76'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🏷️</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Ao76</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
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
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🎨</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Le New Black</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Order export met Brand name, Product reference, EAN13, Net amount
                      </p>
                      {selectedVendor === 'lenewblack' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('playup')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'playup'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🎮</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Play UP</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        PDF factuur + website prijzen met authenticatie
                      </p>
                      {selectedVendor === 'playup' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('floss')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'floss'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🌸</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Flöss</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Style Details met Style No, Quality, Barcode, Prijzen
                      </p>
                      {selectedVendor === 'floss' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <button
                      onClick={() => setSelectedVendor('armedangels')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'armedangels'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🛡️</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Armed Angels</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        PDF factuur met item numbers, colors, sizes en prijzen
                      </p>
                      {selectedVendor === 'armedangels' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>
                  </div>

                </div>

                {/* File Upload */}
                {selectedVendor && (
                  <>
                    <div className="mb-6">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">2️⃣ Upload Bestand</h3>
                      
                      {/* Automatic Defaults Info */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                        <h3 className="font-bold text-blue-900 dark:text-blue-300 mb-3">✨ Automatische Standaardinstellingen</h3>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Productsoort:</span>{' '}
                            <span className="text-gray-900 dark:text-gray-100">Verbruiksartikel</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Gewicht:</span>{' '}
                            <span className="text-gray-900 dark:text-gray-100">0,20 kg</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Voorraad bijhouden:</span>{' '}
                            <span className="text-green-600 dark:text-green-400">✓ Ingeschakeld</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Kassa:</span>{' '}
                            <span className="text-green-600 dark:text-green-400">✓ Verkopen</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Website:</span>{' '}
                            <span className="text-green-600 dark:text-green-400">✓ Gepubliceerd</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Inkoop:</span>{' '}
                            <span className="text-red-600 dark:text-red-400">✗ Uitgeschakeld</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Voorraad:</span>{' '}
                            <span className="text-gray-900 dark:text-gray-100">0 (instelbaar)</span>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Out of stock bericht:</span>{' '}
                            <span className="text-gray-900 dark:text-gray-100">Verkocht!</span>
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
                          <h3 className="font-bold text-gray-900 mb-2 text-gray-900">CSV File</h3>
                          <p className="text-sm text-gray-800 mb-4 font-medium">
                            {selectedVendor === 'armedangels' 
                              ? 'Invoice CSV with your order' 
                              : 'Product data (required)'}
                          </p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileUpload}
                            disabled={selectedVendor === 'armedangels' && parsedProducts.length === 0}
                            className="hidden"
                            id="csv-upload"
                          />
                          <label
                            htmlFor="csv-upload"
                            className={`inline-block px-4 py-2 rounded cursor-pointer ${
                              selectedVendor === 'armedangels' && parsedProducts.length === 0
                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                            }`}
                          >
                            {selectedVendor === 'armedangels' && parsedProducts.length === 0
                              ? 'Wacht op Catalog CSV ⏳'
                              : 'Kies CSV'}
                          </label>
                          {selectedVendor === 'armedangels' && parsedProducts.length === 0 && (
                            <p className="text-xs text-orange-600 mt-2">
                              ⚠️ Upload EAN Retail List first!
                            </p>
                          )}
                          {selectedVendor === 'armedangels' && parsedProducts.length > 0 && (
                            <p className="text-xs text-green-600 mt-2">
                              ✅ Ready for invoice CSV
                            </p>
                          )}
                        </div>

                        {/* EAN Retail List for Play UP */}
                        {selectedVendor === 'playup' && (
                          <div className="border-2 border-green-400 dark:border-green-600 rounded-lg p-6 text-center">
                            <div className="text-4xl mb-3">📋</div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">EAN Retail List</h3>
                            <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Full catalog with barcodes (optional)</p>
                            <input
                              type="file"
                              accept=".csv"
                              onChange={handleEANFileUpload}
                              className="hidden"
                              id="ean-csv-upload"
                            />
                            <label
                              htmlFor="ean-csv-upload"
                              className={`px-4 py-2 rounded cursor-pointer inline-block ${
                                eanProducts.length > 0 
                                  ? 'bg-green-600 text-white hover:bg-green-700' 
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                            >
                              {eanProducts.length > 0 ? `✓ ${eanProducts.length} EAN entries` : 'Kies EAN CSV'}
                            </label>
                            {eanProducts.length > 0 && (
                              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                                Barcodes, SKUs & prijzen worden automatisch gevuld!
                              </p>
                            )}
                          </div>
                        )}

                        {/* Prijzen CSV - NOT for Armed Angels */}
                        {selectedVendor !== 'armedangels' && (
                        <div className="border-2 border-orange-400 dark:border-orange-600 rounded-lg p-6 text-center">
                          <div className="text-4xl mb-3">💰</div>
                          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Prijzen CSV</h3>
                          <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Cost prices (optional)</p>
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
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              📄 PDF naar CSV converter →
                            </a>
                          </div>
                        </div>
                        )}

                        {/* EAN Retail List for Armed Angels */}
                        {selectedVendor === 'armedangels' && (
                          <div className="border-2 border-green-400 dark:border-green-600 rounded-lg p-6 text-center">
                            <div className="text-4xl mb-3">📋</div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">EAN Retail List</h3>
                            <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Full catalog with barcodes <span className="font-bold text-red-600">(REQUIRED FIRST!)</span></p>
                            <input
                              type="file"
                              accept=".csv"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const text = event.target?.result as string;
                                  parseArmedAngelsCatalogCSV(text);
                                };
                                reader.readAsText(file);
                              }}
                              className="hidden"
                              id="armedangels-ean-upload"
                            />
                            <label
                              htmlFor="armedangels-ean-upload"
                              className={`px-4 py-2 rounded cursor-pointer inline-block ${
                                parsedProducts.length > 0 && parsedProducts[0]?.variants?.[0]?.ean
                                  ? 'bg-green-600 text-white hover:bg-green-700' 
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                            >
                              {parsedProducts.length > 0 ? `✓ ${parsedProducts.length} producten` : 'Kies EAN CSV'}
                            </label>
                            {parsedProducts.length > 0 && (
                              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                                ✅ Catalog loaded! Now upload your invoice CSV above.
                              </p>
                            )}
                            {parsedProducts.length === 0 && (
                              <p className="text-xs text-orange-700 dark:text-orange-400 mt-2">
                                ⚠️ Upload this FIRST! All product info, EAN codes & prices.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {pdfPrices.size > 0 && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 mb-4">
                          <p className="text-green-800 dark:text-green-300 font-medium">
                            ✅ Prijzen CSV geladen: {pdfPrices.size} SKU prijzen beschikbaar
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                            Kostprijzen uit prijzen CSV worden gebruikt in plaats van product CSV prijzen waar beschikbaar
                          </p>
                        </div>
                      )}

                      {/* Play UP Website Credentials */}
                      {selectedVendor === 'playup' && (
                        <div className="border-2 border-purple-300 dark:border-purple-700 rounded-lg p-6 mb-4">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">🔐 Play UP Website Login</h3>
                          <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">
                            Inloggegevens voor pro.playupstore.com om actuele prijzen op te halen
                          </p>
                          
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium dark:text-gray-300 mb-2">Email/Username</label>
                              <input
                                type="text"
                                value={playupUsername}
                                onChange={(e) => setPlayupUsername(e.target.value)}
                                placeholder="your@email.com"
                                className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium dark:text-gray-300 mb-2">Password</label>
                              <input
                                type="password"
                                value={playupPassword}
                                onChange={(e) => setPlayupPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full border rounded px-3 py-2"
                              />
                            </div>
                          </div>

                          {websitePrices.size > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                              <p className="text-green-800 font-medium">
                                ✅ Website prijzen geladen: {websitePrices.size} artikelen
                              </p>
                            </div>
                          )}

                          {parsedProducts.length === 0 && (
                            <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-3">
                              <p className="text-yellow-800 text-sm font-medium">
                                ⚠️ Upload eerst een Product CSV bestand hierboven om prijzen op te kunnen halen
                              </p>
                            </div>
                          )}
                          
                          {parsedProducts.length > 0 && (
                            <div className="bg-blue-50 border border-blue-300 rounded p-3 mb-3">
                              <p className="text-blue-800 text-sm font-medium">
                                ✅ CSV geladen: {parsedProducts.length} producten geparsed
                              </p>
                              <p className="text-blue-700 text-xs mt-1">
                                Je kunt nu optioneel prijzen ophalen van de Play UP website, of direct doorgaan naar import
                              </p>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={fetchPlayUpPrices}
                              disabled={!playupUsername || !playupPassword || parsedProducts.length === 0 || isLoading}
                              className="bg-purple-600 text-white px-4 py-3 rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                            >
                              {isLoading ? '⏳ Bezig...' : '💰 Haal Prijzen Op'}
                            </button>
                            
                            <button
                              onClick={() => setCurrentStep(2)}
                              disabled={parsedProducts.length === 0}
                              className="bg-green-600 text-white px-4 py-3 rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                            >
                              ➡️ Ga Verder
                            </button>
                          </div>
                          
                          <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-4">
                            <p className="text-xs text-blue-800">
                              📸 <strong>Images:</strong> Upload via <strong>🖼️ Upload Play UP Afbeeldingen</strong> button after import
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              💡 Credentials worden lokaal opgeslagen voor toekomstig gebruik
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Format Preview */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h4 className="font-bold text-yellow-900 text-gray-900 mb-2">
                        ⚠️ Verwacht CSV Formaat voor {selectedVendor === 'ao76' ? 'Ao76' : selectedVendor === 'lenewblack' ? 'Le New Black' : selectedVendor === 'playup' ? 'Play UP' : 'Flöss'}:
                      </h4>
                      {selectedVendor === 'ao76' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`EAN barcode;Reference;Description;Quality;Colour;Size;Quantity;Price;RRP;HS code
5400562408965;225-2003-103;silas t-shirt;50% recycled cotton;natural;04;1;21.6;54;6109100010`}
                        </pre>
                      ) : selectedVendor === 'lenewblack' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`order-2995931-20251013
Brand name;Collection;Product name;Product reference;Color name;Description;Size name;EAN13;SKU;Quantity;Net amount;Currency
Hello Simone;Winter 25 - 26;Bear fleece jacket cookie;AW25-BFLJC;Cookie;Large jacket...;3Y;3701153659547;AW25-BFLJC-3Y;1;65,00;EUR

→ Wordt: "Hello Simone - Bear fleece jacket cookie"`}
                        </pre>
                      ) : selectedVendor === 'playup' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Article,Color,Description,Size,Quantity,Price
1AR11002,P6179,"RIB LS T-SHIRT - 100% OGCO",3M,1,12.39
1AR11002,P6179,"RIB LS T-SHIRT - 100% OGCO",6M,1,12.39

→ Wordt: "Play Up - Rib ls t-shirt - 100% ogco"
→ Gebruik Play UP PDF Converter om factuur PDF naar CSV te converteren`}
                        </pre>
                      ) : (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Table 1
Style No;Style Name;Brand;Type;Category;Quality;Color;Size;Qty;Barcode;...;Wholesale Price EUR;Recommended Retail Price EUR
F10625;Apple Knit Cardigan;Flöss Aps;Cardigan;;100% Cotton;Red Apple;68/6M;1;5715777018640;...;22,00;55,00
F10637;Heart Cardigan;Flöss Aps;Cardigan;;100% Cotton;Poppy Red/Soft White;68/6M;1;5715777019197;...;22,00;55,00

→ Product: F10625 - Apple knit cardigan - Red Apple
→ Variant: Maat 68/6M, EAN: 5715777018640, Prijs: €22,00, RRP: €55,00`}
                        </pre>
                      )}
                      {selectedVendor === 'playup' && (
                        <div className="mt-3">
                          <a
                            href="/playup-pdf-converter"
                            target="_blank"
                            className="text-sm text-blue-600 hover:underline font-medium"
                          >
                            🎮 Open Play UP PDF Converter →
                          </a>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!selectedVendor && (
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center">
                    <p className="text-gray-800">👆 Selecteer eerst een leverancier om te beginnen</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 1.5: Play UP Image Management (only for Play UP vendor) */}
            {currentStep === 1.5 && selectedVendor === 'playup' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">📸 Manage Product Images</h2>
                
                {/* Statistics */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <div className="text-green-600 text-sm mb-1">Met Afbeeldingen</div>
                    <div className="text-3xl font-bold">
                      {parsedProducts.filter(p => p.images && p.images.length > 0).length}
                    </div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                    <div className="text-yellow-600 text-sm mb-1">Zonder Afbeeldingen</div>
                    <div className="text-3xl font-bold">
                      {parsedProducts.filter(p => !p.images || p.images.length === 0).length}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded p-4">
                    <div className="text-blue-600 text-sm mb-1">Totaal Afbeeldingen</div>
                    <div className="text-3xl font-bold">
                      {parsedProducts.reduce((sum, p) => sum + (p.images?.length || 0), 0)}
                    </div>
                  </div>
                </div>

                {/* Info Banner for Local Images */}
                {parsedProducts.some(p => p.images?.some(img => img.startsWith('/'))) && (
                  <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
                    <h3 className="font-bold text-blue-900 mb-2">📁 Local Images Ready</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      Images from the matcher are stored locally. Upload them manually using the &quot;📁 Upload Foto&apos;s&quot; button below each product.
                    </p>
                    <p className="text-xs text-blue-700 bg-blue-100 rounded p-2">
                      💡 <strong>Tip:</strong> Images are in <code className="bg-blue-200 px-1 rounded">~/Downloads/Play_Up_Matched_Images/</code>
                    </p>
                  </div>
                )}

                {/* Products Grid */}
                <div className="space-y-4 mb-6 max-h-[600px] overflow-y-auto">
                  {parsedProducts.map((product) => (
                    <div key={`${product.reference}_${product.color}`} className="bg-white border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900">{product.name}</h3>
                          <p className="text-sm text-gray-600">{product.reference}</p>
                        </div>
                        <div className={`px-3 py-1 rounded text-sm font-medium ${
                          product.images && product.images.length > 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {product.images && product.images.length > 0 
                            ? `✅ ${product.images.length} foto&apos;s` 
                            : '⚠️ Geen foto&apos;s'}
                        </div>
                      </div>

                      {/* Image Preview Grid */}
                      {product.images && product.images.length > 0 && (
                        <div className="mb-3">
                          {product.images.some(img => img.startsWith('/') || img.startsWith('file://')) ? (
                            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4">
                              <div className="text-sm font-medium text-gray-700 mb-2">
                                📸 {product.images.length} image{product.images.length !== 1 ? 's' : ''} matched:
                              </div>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {product.images.map((imageUrl, idx) => {
                                  const filename = imageUrl.split('/').pop();
                                  return (
                                    <div key={idx} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border">
                                      <span className="text-gray-700 font-mono">{filename}</span>
                                      <button
                                        onClick={() => removeProductImage(product.reference, idx)}
                                        className="text-red-600 hover:text-red-800 font-bold"
                                        title="Verwijder"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-6 gap-2">
                              {product.images.map((imageUrl, idx) => (
                                <div key={idx} className="relative aspect-square bg-gray-100 rounded overflow-hidden border group">
                                  <Image
                                    src={imageUrl}
                                    alt={`${product.name} ${idx + 1}`}
                                    fill
                                    className="object-cover"
                                    unoptimized={imageUrl.startsWith('data:')}
                                  />
                                  <button
                                    onClick={() => removeProductImage(product.reference, idx)}
                                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    title="Verwijder deze foto"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Manual Upload */}
                      <div className="flex gap-2">
                        <label className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 cursor-pointer inline-block">
                          📁 Upload Foto&apos;s
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => handleManualImageUpload(product.reference, e.target.files)}
                            className="hidden"
                          />
                        </label>
                        {product.images && product.images.length > 0 && (
                          <button
                            onClick={() => {
                              setParsedProducts(products =>
                                products.map(p =>
                                  p.reference === product.reference ? { ...p, images: [] } : p
                                )
                              );
                            }}
                            className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            🗑️ Verwijder Alle Foto&apos;s
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Navigation Buttons */}
                <div className="flex gap-3 justify-between">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
                  >
                    ⬅️ Terug
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        // Clear all images and continue
                        setParsedProducts(products => products.map(p => ({ ...p, images: [] })));
                        setCurrentStep(2);
                      }}
                      className="px-6 py-3 bg-yellow-600 text-white rounded hover:bg-yellow-700 font-medium"
                    >
                      ⏭️ Zonder Afbeeldingen
                    </button>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                    >
                      ➡️ Ga Verder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Mapping */}
            {currentStep === 2 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">🗺️ Field Mapping & Validation</h2>
                <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
                  <p className="text-green-800 font-medium">
                    {parsedProducts.length} rijen geïmporteerd, gegroepeerd in {parsedProducts.length} producten
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="border rounded p-4">
                    <div className="text-gray-900 text-sm font-semibold">Totaal Rijen</div>
                    <div className="text-3xl font-bold text-gray-900">{parsedProducts.reduce((s, p) => s + p.variants.length, 0)}</div>
                  </div>
                  <div className="border rounded p-4">
                    <div className="text-gray-900 text-sm font-semibold">Unieke Producten</div>
                    <div className="text-3xl font-bold text-gray-900">{parsedProducts.length}</div>
                  </div>
                  <div className="border rounded p-4">
                    <div className="text-gray-900 text-sm font-semibold">Totaal Varianten</div>
                    <div className="text-3xl font-bold text-gray-900">{parsedProducts.reduce((s, p) => s + p.variants.length, 0)}</div>
                  </div>
                </div>

                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-3">Product Groepen Preview</h3>
                <div className="border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden flex flex-col" style={{ maxHeight: '600px' }}>
                  {/* Table Header */}
                  <div className="overflow-x-auto flex-shrink-0">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-blue-600 dark:bg-blue-700 text-white sticky top-0 z-10">
                        <tr>
                          <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Reference</th>
                          <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Naam</th>
                          <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Materiaal</th>
                          <th className="p-3 text-left font-semibold border-b border-blue-700 dark:border-blue-800">Kleur</th>
                          <th className="p-3 text-center font-semibold border-b border-blue-700 dark:border-blue-800">Varianten</th>
                          <th className="p-3 text-right font-semibold border-b border-blue-700 dark:border-blue-800">Verkoopprijs</th>
                        </tr>
                      </thead>
                    </table>
                  </div>

                  {/* Table Body with Scroll */}
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {parsedProducts.map((product, idx) => (
                          <tr 
                            key={`${product.reference}_${product.color}`}
                            className={`border-b dark:border-gray-700 transition-colors ${
                              idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
                            } hover:bg-blue-50 dark:hover:bg-blue-900/30`}
                          >
                            <td className="p-3 font-mono text-xs bg-gray-100 dark:bg-gray-700 font-bold text-gray-900 dark:text-gray-100">{product.reference}</td>
                            <td className="p-3 font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">{product.name}</td>
                            <td className="p-3 text-xs text-gray-900 dark:text-gray-200 max-w-xs truncate">{product.material}</td>
                            <td className="p-3 text-sm text-gray-900 dark:text-gray-100">{product.color}</td>
                            <td className="p-3 text-center font-semibold text-blue-600 dark:text-blue-400">{product.variants.length}</td>
                            <td className="p-3 text-right font-bold text-green-600 dark:text-green-400">€{(product.variants[0]?.rrp || product.variants[0]?.price || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer with Count */}
                  <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-700 p-3 border-t dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 font-medium">
                    📊 Totaal: <strong>{parsedProducts.length} producten</strong> met <strong>{parsedProducts.reduce((s, p) => s + p.variants.length, 0)} varianten</strong>
                  </div>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-800"
                  >
                    Volgende: Selectie →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Selection & Stock */}
            {currentStep === 3 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">☑️ Selecteer Producten & Voorraad</h2>
                <p className="text-gray-800 dark:text-gray-300 mb-4 font-medium">
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
                  <button
                    onClick={() => {
                      // Set all variant quantities to 0
                      setParsedProducts(products =>
                        products.map(product => ({
                          ...product,
                          variants: product.variants.map(v => ({ ...v, quantity: 0 }))
                        }))
                      );
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    📦 Voorraad 0
                  </button>
                  <div className="ml-auto bg-blue-50 px-4 py-2 rounded">
                    <strong>{selectedCount}</strong> producten geselecteerd ({totalVariants} varianten)
                  </div>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {parsedProducts.map(product => (
                    <div
                      key={`${product.reference}_${product.color}`}
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
                                <label className="text-xs text-gray-800 font-medium">Product Naam</label>
                                <input
                                  type="text"
                                  value={product.name}
                                  onChange={(e) => updateProductName(product.reference, e.target.value)}
                                  className="w-full border-2 border-blue-300 rounded px-3 py-2 text-base font-bold text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                  placeholder="Product naam..."
                                />
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-800">
                                <div className="flex items-center gap-2">
                                  <span className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">{product.reference}</span>
                                  <span>•</span>
                                  <span className="text-xs">{product.color}</span>
                                  <span>•</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs">📏</span>
                                    <select
                                      value={product.sizeAttribute || determineSizeAttribute(product.variants)}
                                      onChange={(e) => updateProductSizeAttribute(product.reference, e.target.value)}
                                      className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-medium border-purple-300 border focus:border-purple-500 focus:outline-none cursor-pointer"
                                    >
                                      <option value="MAAT Baby's">MAAT Baby&apos;s</option>
                                      <option value="MAAT Kinderen">MAAT Kinderen</option>
                                      <option value="MAAT Tieners">MAAT Tieners</option>
                                      <option value="MAAT Volwassenen">MAAT Volwassenen</option>
                                    </select>
                                  </div>
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
                              <div className="text-sm text-gray-800 mt-1 font-medium">
                                {product.variants.length} varianten • Verkoopprijs: €{(product.variants[0]?.rrp || product.variants[0]?.price || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Variants Table */}
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm border-t dark:border-gray-700">
                              <thead className="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                  <th className="p-2 text-left text-gray-900 dark:text-gray-100 font-semibold">Maat</th>
                                  <th className="p-2 text-left text-gray-900 dark:text-gray-100 font-semibold">EAN</th>
                                  <th className="p-2 text-left text-gray-900 dark:text-gray-100 font-semibold">Kostprijs</th>
                                  <th className="p-2 text-left text-gray-900 dark:text-gray-100 font-semibold">
                                    <div className="flex items-center gap-1">
                                      Verkoopprijs
                                      <span className="text-xs text-blue-600 dark:text-blue-400 font-normal" title="Changing one updates all variants">🔄</span>
                                    </div>
                                  </th>
                                  <th className="p-2 text-left text-gray-900 dark:text-gray-100 font-semibold">Voorraad</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variants.map((variant, idx) => (
                                  <tr key={idx} className="border-b dark:border-gray-700">
                                    <td className="p-2 text-gray-900 dark:text-gray-100">
                                      <input
                                        type="text"
                                        value={product.sizeAttribute === 'MAAT Volwassenen' ? mapSizeTodutchName(variant.size) : variant.size}
                                        onChange={(e) => {
                                          // Extract the original size code from the input (e.g., "S" from "S - 36")
                                          let originalSize = e.target.value;
                                          if (product.sizeAttribute === 'MAAT Volwassenen') {
                                            // Try to extract the original size code
                                            const match = e.target.value.match(/^(XS|S|M|L|XL|XXL)/i);
                                            originalSize = match ? match[1].toUpperCase() : e.target.value;
                                          }
                                          updateVariantField(product.reference, idx, 'size', originalSize);
                                        }}
                                        className="w-16 border dark:border-gray-600 rounded px-2 py-1 text-center text-xs font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                                      />
                                    </td>
                                    <td className="p-2 text-gray-900 dark:text-gray-100">
                                      <input
                                        type="text"
                                        value={variant.ean}
                                        onChange={(e) => updateVariantField(product.reference, idx, 'ean', e.target.value)}
                                        className="w-full border dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                                      />
                                    </td>
                                    <td className="p-2 text-gray-900 dark:text-gray-100">
                                      <div className="flex items-center gap-1">
                                        <span className="mr-1">€</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={variant.price}
                                          onChange={(e) => updateVariantField(product.reference, idx, 'price', parseFloat(e.target.value) || 0)}
                                          className={`w-20 border dark:border-gray-600 rounded px-2 py-1 text-right text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 ${
                                            variant.sku && pdfPrices.has(variant.sku) ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30' : ''
                                          }`}
                                        />
                                        {variant.sku && pdfPrices.has(variant.sku) && (
                                          <span className="text-xs text-orange-600" title="Prijs uit PDF">📋</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-2 text-gray-900 dark:text-gray-100">
                                      <div className="flex items-center relative group">
                                        <span className="mr-1">€</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={variant.rrp}
                                          onChange={(e) => updateVariantField(product.reference, idx, 'rrp', parseFloat(e.target.value) || 0)}
                                          className="w-20 border dark:border-gray-600 rounded px-2 py-1 text-right text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-blue-300 dark:border-blue-600"
                                          title="Changing this will update all variants of this product"
                                        />
                                        <span className="ml-1 text-xs text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-help" title="Updates all variants">
                                          🔄
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-2 text-gray-900 dark:text-gray-100">
                                      <input
                                        type="number"
                                        min="0"
                                        value={variant.quantity}
                                        onChange={(e) => {
                                          const newQty = parseInt(e.target.value) || 0;
                                          updateVariantQuantity(product.reference, idx, newQty);
                                        }}
                                        className="w-20 border dark:border-gray-600 rounded px-2 py-1 text-center text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
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

                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-600 p-4 mt-6">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    💡 <strong>Tip:</strong> Changing the Verkoopprijs (rrp) for any variant will automatically update <strong>all variants</strong> of that product. This ensures consistent pricing across all sizes.
                  </p>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
                  >
                    ← Terug
                  </button>
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-800"
                  >
                    Volgende: Categorieën →
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Categories */}
            {currentStep === 4 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">📁 Categorieën Toewijzen</h2>
                <p className="text-gray-800 dark:text-gray-300 mb-6">
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
                      disabled={isLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                    >
                      🔄 Vernieuw Data
                    </button>
                  </div>
                  {isLoading && (
                    <div className="mt-2 text-sm text-blue-600">⏳ Bezig met laden...</div>
                  )}
                  {!isLoading && (brands.length === 0 || internalCategories.length === 0) && (
                    <div className="mt-2 text-sm text-yellow-700">
                      ⚠️ Data nog niet geladen. Klik op &quot;🔄 Vernieuw Data&quot; om te laden.
                    </div>
                  )}
                </div>

                {/* Batch Assignments */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Batch Brand */}
                  <div className="border rounded p-4">
                    <h3 className="font-bold text-gray-900 mb-3">🏷️ Merk (Batch) ({brands.length} beschikbaar)</h3>
                    <p className="text-xs text-gray-800 mb-2">Merken kunnen duplicaten zijn tussen MERK en Merk 1 attributen</p>
                    
                    {/* Search Input */}
                    <input
                      type="text"
                      placeholder="🔍 Type om te zoeken..."
                      value={brandSearch}
                      onChange={(e) => setBrandSearch(e.target.value)}
                      className="w-full border rounded p-2 mb-2 text-sm text-gray-900 placeholder-gray-600"
                    />
                    
                    {/* Filtered Dropdown */}
                    <select
                      value={batchBrand}
                      onChange={(e) => setBatchBrand(e.target.value)}
                      className="w-full border rounded p-2 mb-2 text-gray-900 bg-white"
                      size={5}
                    >
                      <option value="">Selecteer merk...</option>
                      {brands
                        .filter(brand => 
                          brandSearch === '' || 
                          brand.name.toLowerCase().includes(brandSearch.toLowerCase())
                        )
                        .map(brand => (
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
                    <h3 className="font-bold text-gray-900 mb-3">
                      📂 Interne Categorie (Batch) ({internalCategories.filter(c => c.display_name?.includes('Kleding')).length} beschikbaar)
                    </h3>
                    
                    {/* Search Input */}
                    <input
                      type="text"
                      placeholder="🔍 Type om te zoeken..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="w-full border rounded p-2 mb-2 text-sm text-gray-900 placeholder-gray-600"
                    />
                    
                    {/* Filtered Dropdown */}
                    <select
                      value={batchCategory}
                      onChange={(e) => setBatchCategory(e.target.value)}
                      className="w-full border rounded p-2 mb-2 text-gray-900 bg-white"
                      size={5}
                    >
                      <option value="">Selecteer interne categorie...</option>
                      {internalCategories
                        .filter(c => c.display_name?.includes('Kleding'))
                        .filter(cat =>
                          categorySearch === '' ||
                          cat.display_name?.toLowerCase().includes(categorySearch.toLowerCase()) ||
                          cat.name?.toLowerCase().includes(categorySearch.toLowerCase())
                        )
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
                  <h3 className="font-bold text-gray-900 mb-3">
                    🛍️ eCommerce Categorieën (Batch - Meerdere mogelijk) ({publicCategories.length} beschikbaar)
                  </h3>
                  <p className="text-xs text-gray-800 mb-3">
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

                  {/* Search Input */}
                  <input
                    type="text"
                    placeholder="🔍 Type om te zoeken (bijv. Hello Simone)..."
                    value={publicCategorySearch}
                    onChange={(e) => setPublicCategorySearch(e.target.value)}
                    className="w-full border rounded p-2 mb-2 text-sm text-gray-900 placeholder-gray-600"
                  />

                  {/* Category Selector */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addBatchPublicCategory(e.target.value);
                        e.target.value = '';
                        setPublicCategorySearch(''); // Clear search after selection
                      }
                    }}
                    className="w-full border rounded p-2 mb-3 text-gray-900 bg-white"
                    size={5}
                  >
                    <option value="">+ Voeg eCommerce categorie toe...</option>
                    {publicCategories
                      .filter(c => !batchPublicCategories.includes(c.id))
                      .filter(cat =>
                        publicCategorySearch === '' ||
                        cat.display_name?.toLowerCase().includes(publicCategorySearch.toLowerCase()) ||
                        cat.name?.toLowerCase().includes(publicCategorySearch.toLowerCase())
                      )
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
                  <h3 className="font-bold text-gray-900 mb-3">
                    🏷️ Productlabels (Batch - Meerdere mogelijk) ({productTags.length} beschikbaar)
                  </h3>
                  <p className="text-xs text-gray-800 mb-3">
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

                  {/* Search Input */}
                  <input
                    type="text"
                    placeholder="🔍 Type om te zoeken..."
                    value={productTagSearch}
                    onChange={(e) => setProductTagSearch(e.target.value)}
                    className="w-full border rounded p-2 mb-2 text-sm text-gray-900 placeholder-gray-600"
                  />

                  {/* Tag Selector */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addBatchProductTag(e.target.value);
                        e.target.value = '';
                        setProductTagSearch(''); // Clear search after selection
                      }
                    }}
                    className="w-full border rounded p-2 mb-3 text-gray-900 bg-white"
                    size={5}
                  >
                    <option value="">+ Voeg productlabel toe...</option>
                    {productTags
                      .filter(t => !batchProductTags.includes(t.id))
                      .filter(tag =>
                        productTagSearch === '' ||
                        tag.name?.toLowerCase().includes(productTagSearch.toLowerCase())
                      )
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
                <h3 className="font-bold text-gray-900 mb-3">Per Product Categorieën</h3>
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Tip:</strong> Klik op een veld en begin te typen om te zoeken. Bijvoorbeeld: typ &quot;hello&quot; om &quot;Hello Simone&quot; te vinden. Klik op de match om te selecteren.
                  </p>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto border rounded-lg pb-80">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-200 sticky top-0">
                      <tr>
                        <th className="p-3 text-left font-bold text-gray-900 border-b-2 border-gray-300">Product</th>
                        <th className="p-3 text-left font-bold text-gray-900 border-b-2 border-gray-300">Merk</th>
                        <th className="p-3 text-left font-bold text-gray-900 border-b-2 border-gray-300">Interne Categorie</th>
                        <th className="p-3 text-left font-bold text-gray-900 border-b-2 border-gray-300">eCommerce Cat.</th>
                        <th className="p-3 text-left font-bold text-gray-900 border-b-2 border-gray-300">Productlabels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedProducts.filter(p => selectedProducts.has(p.reference)).map(product => (
                        <tr key={`${product.reference}_${product.color}`} className="border-b hover:bg-gray-50">
                          <td className="p-3 bg-gray-50">
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-xs text-gray-700">{product.reference}</div>
                          </td>
                          <td className="p-3">
                            <SearchableSelect
                              options={brands.map(b => ({ id: b.id, label: `${b.name} (${b.source})` }))}
                              value={product.selectedBrand?.id || ''}
                              onChange={(value) => {
                                const brand = brands.find(b => b.id.toString() === value);
                                setParsedProducts(products =>
                                  products.map(p =>
                                    p.reference === product.reference ? { ...p, selectedBrand: brand } : p
                                  )
                                );
                              }}
                              placeholder="Selecteer merk..."
                            />
                            {product.suggestedBrand && !product.selectedBrand && (
                              <div className="text-xs text-gray-700 mt-1 font-medium">💡 Suggestie: {product.suggestedBrand}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <SearchableSelect
                              options={internalCategories
                                .filter(c => c.display_name?.includes('Kleding'))
                                .map(cat => ({ 
                                  id: cat.id, 
                                  label: cat.display_name?.split(' / ').slice(-2).join(' / ') || cat.name 
                                }))}
                              value={product.category?.id || ''}
                              onChange={(value) => {
                                const category = internalCategories.find(c => c.id.toString() === value);
                                setParsedProducts(products =>
                                  products.map(p =>
                                    p.reference === product.reference ? { ...p, category } : p
                                  )
                                );
                              }}
                              placeholder="Selecteer categorie..."
                            />
                          </td>
                          <td className="p-3">
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
                            <SearchableSelect
                              options={publicCategories
                                .filter(c => !product.publicCategories.some(pc => pc.id === c.id))
                                .map(cat => ({ id: cat.id, label: cat.display_name || cat.name }))}
                              value=""
                              onChange={(value) => {
                                if (value) {
                                  addPublicCategory(product.reference, value);
                                }
                              }}
                              placeholder="+ Toevoegen..."
                            />
                          </td>
                          <td className="p-3">
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
                            <SearchableSelect
                              options={productTags
                                .filter(t => !product.productTags.some(pt => pt.id === t.id))
                                .map(tag => ({ id: tag.id, label: tag.name }))}
                              value=""
                              onChange={(value) => {
                                if (value) {
                                  addProductTag(product.reference, value);
                                }
                              }}
                              placeholder="+ Voeg label toe..."
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-2 border rounded hover:bg-gray-100 text-gray-900 font-medium"
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
                <h2 className="text-2xl font-bold text-gray-900 mb-4">👁️ Preview Import</h2>
                <p className="text-gray-800 mb-6">
                  Review wat er aangemaakt wordt voordat je importeert.
                </p>

                {/* Automatic Defaults Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-blue-900 text-gray-900 mb-3">ℹ️ Automatische Standaardinstellingen</h3>
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
                        <th className="p-2 text-left text-gray-900 font-semibold">Product</th>
                        <th className="p-2 text-left text-gray-900 font-semibold">Merk</th>
                        <th className="p-2 text-left text-gray-900 font-semibold">Categorie</th>
                        <th className="p-2 text-left text-gray-900 font-semibold">eCommerce Cat.</th>
                        <th className="p-2 text-left text-gray-900 font-semibold">Varianten</th>
                        <th className="p-2 text-left text-gray-900 font-semibold">Verkoopprijs</th>
                        <th className="p-2 text-left text-gray-900 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedProducts.filter(p => selectedProducts.has(p.reference)).map(product => {
                        const ready = product.selectedBrand && product.category;
                        return (
                          <tr key={`${product.reference}_${product.color}`} className="border-b">
                            <td className="p-2 text-gray-900">
                              <div className="font-medium">{product.name}</div>
                              <div className="text-xs text-gray-700">{product.reference}</div>
                            </td>
                            <td className="p-2 text-gray-900">{product.selectedBrand?.name || '-'}</td>
                            <td className="p-2 text-xs text-gray-900">{product.category?.display_name?.split(' / ').slice(-1)[0] || product.category?.name || '-'}</td>
                            <td className="p-2">
                              {product.publicCategories.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {product.publicCategories.slice(0, 2).map(c => (
                                    <span key={c.id} className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded text-xs">
                                      {c.name}
                                    </span>
                                  ))}
                                  {product.publicCategories.length > 2 && (
                                    <span className="text-xs text-gray-700 font-medium">+{product.publicCategories.length - 2}</span>
                                  )}
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-2 text-gray-900">{product.variants.length}</td>
                            <td className="p-2 text-gray-900">€{(product.variants[0]?.rrp || product.variants[0]?.price || 0).toFixed(2)}</td>
                            <td className="p-2">
                              {ready ? (
                                <span className="text-green-600 font-semibold">✓ Ready</span>
                              ) : (
                                <span className="text-red-600 font-semibold">✗ Incomplete</span>
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
                    className="px-6 py-2 border rounded hover:bg-gray-100 text-gray-900 font-medium"
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
                <h2 className="text-2xl font-bold text-gray-900 mb-4">🧪 Test Mode</h2>
                <p className="text-gray-800 mb-6">
                  Selecteer een product om eerst te testen voordat je de bulk import uitvoert.
                </p>

                <div className="space-y-3">
                  {readyProducts.map(product => (
                    <div key={`${product.reference}_${product.color}`} className="border rounded p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold">{product.name}</div>
                          <div className="text-sm text-gray-800">
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
                    className="px-6 py-2 border rounded hover:bg-gray-100 text-gray-900 font-medium"
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
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
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

                <h3 className="font-bold text-gray-900 mb-3">Import Details</h3>
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
                            <div className="font-medium text-gray-900">{result.name || result.reference}</div>
                            <div className="text-xs text-gray-700">{result.reference}</div>
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
                          <td className="p-2 text-xs text-gray-800">{result.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Image Import for Play UP */}
                {selectedVendor === 'playup' && imageImportResults.length === 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg">📸 Next Step: Upload Images</h3>
                    <p className="text-sm text-gray-700 mb-4">
                      Import successful! Now upload product images using the dedicated image upload page.
                    </p>
                    <div className="bg-white rounded-lg p-4 mb-4 border border-blue-200">
                      <p className="text-sm font-medium mb-2">📋 What you&apos;ll need:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>The same CSV you just imported</li>
                        <li>Local images from <code className="bg-gray-100 px-1 rounded">~/Downloads/Play_Up_Matched_Images/</code></li>
                        <li>The app will automatically match them!</li>
                      </ul>
                    </div>
                    
                    <Link
                      href="/playup-images-import"
                      className="block w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center px-6 py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 font-bold shadow-lg transition-all"
                    >
                      🖼️ Upload Play UP Afbeeldingen →
                    </Link>
                  </div>
                )}

                {/* Image Import for Flöss */}
                {selectedVendor === 'floss' && imageImportResults.length === 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded p-6 mb-6">
                    <h3 className="font-bold text-purple-900 text-gray-900 mb-3">🌸 Afbeeldingen Importeren (Optioneel)</h3>
                    <p className="text-sm text-purple-800 mb-4">
                      Upload afbeeldingen van je Flöss order folder voor de succesvol geïmporteerde producten.
                    </p>
                    <div className="bg-white rounded p-4 mb-4">
                      <p className="text-sm font-medium mb-2">📝 Vereisten:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>Bestandsnamen moeten beginnen met Style No (bijv. F10625 - Apple Knit Cardigan - Red Apple - Main.jpg)</li>
                        <li>Producten met Template IDs (automatisch van bovenstaande import)</li>
                        <li>Ondersteunde formaten: JPG, JPEG, PNG</li>
                      </ul>
                    </div>

                    <div className="border-2 border-dashed border-purple-300 rounded-lg p-8 text-center mb-4">
                      <div className="text-4xl mb-3">📁</div>
                      <h4 className="font-bold text-purple-900 text-gray-900 mb-2">Selecteer Afbeeldingen</h4>
                      <p className="text-sm text-purple-700 mb-4">Klik om meerdere afbeeldingen uit je Flöss order folder te selecteren</p>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const files = Array.from(e.target.files);
                            console.log(`📁 Selected ${files.length} images`);
                            
                            // Group and show summary
                            const styleNos = new Set(
                              files.map(f => {
                                const match = f.name.match(/^([F\d]+)\s*-/);
                                return match ? match[1] : null;
                              }).filter(Boolean)
                            );
                            
                            if (styleNos.size === 0) {
                              alert('⚠️ Geen geldige afbeeldingen gevonden. Zorg ervoor dat bestandsnamen beginnen met Style No (bijv. F10625 - ...)');
                              return;
                            }

                            alert(`✅ ${files.length} afbeeldingen geselecteerd voor ${styleNos.size} producten\n\nKlik op "Upload Images" om te beginnen`);
                            
                            // Start upload
                            fetchFlossImages(files);
                          }
                        }}
                        className="hidden"
                        id="floss-images-upload"
                      />
                      <label
                        htmlFor="floss-images-upload"
                        className="bg-purple-600 text-white px-6 py-3 rounded cursor-pointer hover:bg-purple-700 font-bold inline-block"
                      >
                        📁 Selecteer Afbeeldingen
                      </label>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-800">
                      <p><strong>💡 Tip:</strong> Je kunt alle afbeeldingen van je Flöss order in een keer selecteren. Het systeem matcher ze automatisch op Style No.</p>
                      <p className="mt-2"><strong>ℹ️ Bestandsnaam formaat:</strong> F10625 - Apple Knit Cardigan - Red Apple - Main.jpg</p>
                    </div>
                  </div>
                )}

                {/* Image Import Results */}
                {imageImportResults.length > 0 && (
                  <div className="bg-white border rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-4 text-lg">🖼️ Afbeeldingen Import Resultaten</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-green-50 border border-green-200 rounded p-3">
                        <div className="text-green-600 text-sm mb-1">Successful</div>
                        <div className="text-2xl font-bold">
                          {imageImportResults.filter((r) => r.success).length}
                        </div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded p-3">
                        <div className="text-red-600 text-sm mb-1">Failed</div>
                        <div className="text-2xl font-bold">
                          {imageImportResults.filter((r) => !r.success).length}
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <div className="text-blue-600 text-sm mb-1">Total Images</div>
                        <div className="text-2xl font-bold">
                          {imageImportResults.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0)}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-800">
                      {imageImportResults.filter(r => r.success).map(r => (
                        <div key={r.reference} className="py-1">
                          ✅ {r.reference}: {r.imagesUploaded} afbeeldingen
                        </div>
                      ))}
                      {imageImportResults.filter(r => !r.success).map(r => (
                        <div key={r.reference} className="py-1 text-red-600">
                          ❌ {r.reference}: {r.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setSelectedVendor(null);
                      setParsedProducts([]);
                      setSelectedProducts(new Set());
                      setImportResults(null);
                      setImageImportResults([]);
                    }}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    🔄 Nieuwe Import
                  </button>
                  
                  {selectedVendor === 'playup' ? (
                    <Link
                      href="/playup-images-import"
                      className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                    >
                      🎮 Upload Play UP Afbeeldingen
                    </Link>
                  ) : (
                    <Link
                      href="/product-images-import"
                      className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                    >
                      📸 Upload Afbeeldingen
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Progress Modal */}
      {importProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">🚀 Importeren...</h3>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Product {importProgress.current} van {importProgress.total}</span>
                <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-blue-600 h-4 transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
            {importProgress.currentProduct && (
              <div className="text-sm text-gray-800 mb-4">
                <div className="font-medium mb-1">Huidige product:</div>
                <div className="bg-gray-50 p-2 rounded">{importProgress.currentProduct}</div>
              </div>
            )}
            <div className="text-xs text-gray-500">
              ⏱️ Dit kan enkele minuten duren. Sluit dit venster niet.
            </div>
          </div>
        </div>
      )}

      {/* API Preview Modal */}
      {showApiPreview && apiPreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto w-full">
            <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">📋 API Call Preview - Production Safety Check</h3>
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
                <h4 className="font-bold text-gray-900 mb-2">📦 Product Informatie:</h4>
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

