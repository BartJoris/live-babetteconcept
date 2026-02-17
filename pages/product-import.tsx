import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

// Types
interface ParsedProduct {
  reference: string;
  name: string;
  originalName?: string; // Original product name from CSV (for image search)
  productName?: string; // Product name from CSV (e.g., "26s063" for 1+ - used in image filenames)
  material: string;
  color: string;
  fabricPrint?: string; // Fabric / print info from CSV (for AI description)
  ecommerceDescription?: string; // Description for ecommerce/website
  csvCategory?: string; // Category from CSV (for auto-matching eCommerce categories)
  variants: ProductVariant[];
  suggestedBrand?: string;
  selectedBrand?: { id: number; name: string };
  category?: { id: number; name: string; display_name?: string };
  publicCategories: Array<{ id: number; name: string }>;
  productTags: Array<{ id: number; name: string }>;
  isFavorite: boolean; // Editable favorite flag
  isPublished: boolean; // Editable website publish flag
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

type VendorType = 'ao76' | 'lenewblack' | 'playup' | 'floss' | 'armedangels' | 'tinycottons' | 'thinkingmu' | 'indee' | 'sundaycollective' | 'goldieandace' | 'jenest' | 'wyncken' | 'onemore' | 'weekendhousekids' | 'thenewsociety' | 'emileetida' | 'bobochoses' | null;

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
    // Also handle Weekend House Kids format: 3/6m, 6/12m, 12/18m, 18/24m
    if (size.includes('maand') || /^\d+\s*M$/i.test(size) || /\d+\/\d+\s*m$/i.test(size)) {
      return "MAAT Baby's";
    }
    
    // Teen sizes: "jaar" with number >= 10, or Y sizes >= 10 (including 16Y, 18Y)
    // Also handle Weekend House Kids format: 11/12, 13/14 (these are teen sizes)
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
    // Weekend House Kids teen sizes: 11/12, 13/14
    if (/^(11\/12|13\/14)$/i.test(size)) {
      return 'MAAT Tieners';
    }
    
    // Kids sizes: "jaar" with number < 10, or Y sizes < 10
    // Also handle Weekend House Kids format: 2, 3/4, 5/6, 7/8, 9/10 (these are kids sizes)
    if (size.includes('jaar') || /^\d+\s*Y$/i.test(size)) {
      return 'MAAT Kinderen';
    }
    // Weekend House Kids kids sizes: 2, 3/4, 5/6, 7/8, 9/10
    if (/^(2|3\/4|5\/6|7\/8|9\/10)$/i.test(size)) {
      return 'MAAT Kinderen';
    }
    
    // Adult sizes: XXS, XS, S, M, L, XL, XXL (matching Odoo attribute values)
    if (/^(XXS|XS|S|M|L|XL|XXL)$/i.test(size)) {
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

// Map size codes to Dutch size names for MAAT Volwassenen (matching Odoo attribute values)
function mapSizeToOdooFormat(size: string): string {
  if (!size) return size;
  
  const sizeMapping: { [key: string]: string } = {
    'XXS': 'XXS - 32',
    'XS': 'XS - 34',
    'S': 'S - 36',
    'M': 'M - 38',
    'L': 'L - 40',
    'XL': 'XL - 42',
    'XXL': 'XXL - 44',
  };
  
  // If it's already in Odoo format (contains " - "), return as-is
  if (size.includes(' - ')) {
    return size;
  }
  
  // Normalize to uppercase and map
  const normalizedSize = size.trim().toUpperCase();
  return sizeMapping[normalizedSize] || size;
}

// Check if a size represents a unit/universal size (no size variants)
const isUnitSize = (size: string) => {
  const normalized = size?.trim().toUpperCase();
  return normalized === 'UNIT' || normalized === 'U' || normalized === 'TU';
};

const isUnitOnlyProduct = (product: ParsedProduct) =>
  product.variants.length > 0 &&
  product.variants.every(variant => isUnitSize(variant.size));

// Transform product variants before sending to Odoo
function transformProductForUpload(product: ParsedProduct): ParsedProduct {
  const isUnitOnly =
    product.variants.length > 0 &&
    product.variants.every(variant => isUnitSize(variant.size));

  if (isUnitOnly) {
    // Combine all unit variants into a single product (sum quantities)
    const combinedVariant = product.variants.reduce<ProductVariant>(
      (acc, variant) => ({
        ...acc,
        quantity: acc.quantity + (variant.quantity || 0),
        ean: acc.ean || variant.ean,
        sku: acc.sku || variant.sku,
        price: acc.price || variant.price,
        rrp: acc.rrp || variant.rrp,
      }),
      {
        size: 'UNIT',
        quantity: 0,
        ean: '',
        price: 0,
        rrp: 0,
      }
    );

    return {
      ...product,
      variants: [combinedVariant],
    };
  }

  // For MAAT Volwassenen, map size codes to Odoo format (XS -> XS - 34, etc.)
  if (product.sizeAttribute === 'MAAT Volwassenen') {
    return {
      ...product,
      variants: product.variants.map(v => ({
        ...v,
        size: mapSizeToOdooFormat(v.size),
      })),
    };
  }
  return product;
}

// CSV Category to Odoo eCommerce category mapping
// Maps English CSV category names to Dutch search terms for matching Odoo categories
const CSV_CATEGORY_TO_DUTCH: Record<string, string[]> = {
  'ACCESSORIES': ['Accessoires', 'Tassen', 'Hoeden'],
  'SHOES': ['Schoenen'],
  'TEE SHIRTS': ['T-shirts', 'Tops'],
  'CARDIGAN & PULLOVER': ['Truien', 'Vesten', 'Cardigans'],
  'DRESSES': ['Jurken'],
  'SKIRTS': ['Rokken'],
  'SHORTS': ['Shorts'],
  'SWEATSHIRTS': ['Sweaters', 'Truien'],
  'BLOUSES': ['Blouses', 'Tops', 'Hemden'],
  'BLOOMERS': ['Broeken', 'Broekjes'],
  'TROUSERS': ['Broeken'],
  'JUMPSUITS': ['Jumpsuits', 'Pakjes'],
};

// Find matching Odoo eCommerce categories based on CSV category and size attribute
function findMatchingPublicCategories(
  csvCategory: string | undefined,
  sizeAttribute: string | undefined,
  publicCategories: Array<{ id: number; name: string; display_name?: string }>
): Array<{ id: number; name: string }> {
  if (!csvCategory) return [];
  
  const upperCategory = csvCategory.toUpperCase().trim();
  const searchTerms = CSV_CATEGORY_TO_DUTCH[upperCategory];
  
  if (!searchTerms) {
    console.log(`⚠️ No mapping found for CSV category: ${csvCategory}`);
    return [];
  }
  
  // Determine age group filter based on sizeAttribute
  // - MAAT Baby's -> look for "Baby" categories
  // - MAAT Kinderen -> look for "Kinderen" categories
  // - MAAT Tieners -> look for "Kinderen" categories (same as Kinderen)
  let ageGroupFilter: string | null = null;
  if (sizeAttribute === "MAAT Baby's") {
    ageGroupFilter = "baby";
  } else if (sizeAttribute === "MAAT Kinderen" || sizeAttribute === "MAAT Tieners") {
    ageGroupFilter = "kinderen";
  }
  
  // Find categories that match any of the search terms AND the age group
  const matches = publicCategories.filter(cat => {
    const catName = (cat.display_name || cat.name).toLowerCase();
    const matchesSearchTerm = searchTerms.some(term => catName.includes(term.toLowerCase()));
    
    // If no age group filter, just match search terms
    if (!ageGroupFilter) {
      return matchesSearchTerm;
    }
    
    // Match search terms AND age group (exclude Dames/Heren)
    const matchesAgeGroup = catName.includes(ageGroupFilter) && 
                            !catName.includes('dames') && 
                            !catName.includes('heren');
    
    return matchesSearchTerm && matchesAgeGroup;
  });
  
  if (matches.length > 0) {
    console.log(`✅ Found ${matches.length} matching categories for "${csvCategory}" (${sizeAttribute}): ${matches.map(m => m.display_name || m.name).join(', ')}`);
  } else {
    console.log(`⚠️ No categories found for "${csvCategory}" (${sizeAttribute})`);
  }
  
  return matches.map(m => ({ id: m.id, name: m.display_name || m.name }));
}

export default function ProductImportPage() {
  const [isLoading, setIsLoading] = useState(false);
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
  const [generatingDescription, setGeneratingDescription] = useState<Set<string>>(new Set()); // Track which products are generating AI descriptions
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptCategory, setPromptCategory] = useState<'kinderen' | 'volwassenen'>('kinderen');
  const [customPromptKinderen, setCustomPromptKinderen] = useState('');
  const [customPromptVolwassenen, setCustomPromptVolwassenen] = useState('');
  const [defaultPrompts, setDefaultPrompts] = useState<{
    kinderen: { systemPrompt: string; name: string };
    volwassenen: { systemPrompt: string; name: string };
  } | null>(null);
  const [goldieAndAceCsvData, setGoldieAndAceCsvData] = useState<Map<string, {
    styleCode: string;
    description: string;
    colourName: string;
    composition: string;
    size: string;
    barcode: string;
    retailPrice: number;
    wholesalePrice: number;
    fitComments: string;
    productFeatures: string;
  }>>(new Map());
  const [wynckenPdfProducts, setWynckenPdfProducts] = useState<Array<{
    style: string;
    fabric: string;
    colour: string;
    materialContent: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>>([]);
  const [wynckenDescriptions, setWynckenDescriptions] = useState<Map<string, {
    productId: string;
    style: string;
    fabric: string;
    colour: string;
    description: string;
    sizes: string;
    textileContent: string;
    wspEur: number;
    rrpEur: number;
  }>>(new Map());
  const [wynckenBarcodes, setWynckenBarcodes] = useState<Map<string, {
    productId: string;
    style: string;
    fabric: string;
    colour: string;
    size: string;
    barcode: string;
  }>>(new Map());
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
  
  const [importResults, setImportResults] = useState<{ 
    success: boolean; 
    results: Array<{ 
      success: boolean; 
      reference: string; 
      name?: string; 
      templateId?: number; 
      variantsCreated?: number; 
      variantsUpdated?: number;
      imagesUploaded?: number;
      message?: string 
    }>;
    summary?: {
      total: number;
      successful: number;
      failed: number;
      totalVariantsCreated: number;
      totalVariantsUpdated: number;
      vendor: string;
      timestamp: string;
    };
  } | null>(null);
  const [showApiPreview, setShowApiPreview] = useState(false);
  const [apiPreviewData, setApiPreviewData] = useState<{ product: ParsedProduct; testMode: boolean } | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; currentProduct?: string } | null>(null);
  const [imageImportResults, setImageImportResults] = useState<Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }>>([]);
  const [thenewsocietyOrderConfirmationLoaded, setThenewsocietyOrderConfirmationLoaded] = useState(false);
  const [thenewsocietyOrderLoaded, setThenewsocietyOrderLoaded] = useState(false);
  
  // Emile et Ida state for two-file upload (Order CSV + TARIF CSV for RRP prices)
  const [emileetidaOrderLoaded, setEmileetidaOrderLoaded] = useState(false);
  const [emileetidaTarifLoaded, setEmileetidaTarifLoaded] = useState(false);
  const [emileetidaPriceMap, setEmileetidaPriceMap] = useState<Map<string, number>>(new Map());

  // Bobo Choses state for two-file upload (Packing list CSV + Price PDF for prices)
  const [bobochosesPackingLoaded, setBobochosesPackingLoaded] = useState(false);
  const [bobochosesPriceLoaded, setBobochosesPriceLoaded] = useState(false);
  const [bobochosesPriceMap, setBobochosesPriceMap] = useState<Map<string, { wholesale: number; rrp: number }>>(new Map());
  // Bobo Choses manual price entry
  const [bobochosesManualWholesale, setBobochosesManualWholesale] = useState<string>('');
  const [bobochosesManualRrp, setBobochosesManualRrp] = useState<string>('');

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
    
    // Load AI prompts from API
    fetch('/api/generate-description')
      .then(res => res.json())
      .then(data => {
        if (data.prompts) {
          setDefaultPrompts({
            kinderen: data.prompts.kinderen,
            volwassenen: data.prompts.volwassenen
          });
          // Initialize custom prompts with defaults
          setCustomPromptKinderen(data.prompts.kinderen.systemPrompt);
          setCustomPromptVolwassenen(data.prompts.volwassenen.systemPrompt);
        }
      })
      .catch(err => console.error('Failed to load AI prompts:', err));
    
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

  // Auto-match CSV categories to Odoo eCommerce categories when publicCategories are loaded
  useEffect(() => {
    if (publicCategories.length > 0 && parsedProducts.length > 0) {
      // Check if any products have csvCategory but no publicCategories yet
      const productsToMatch = parsedProducts.filter(
        p => p.csvCategory && p.publicCategories.length === 0
      );
      
      if (productsToMatch.length > 0) {
        console.log(`🔄 Auto-matching ${productsToMatch.length} products with CSV categories...`);
        
        setParsedProducts(products =>
          products.map(product => {
            if (product.csvCategory && product.publicCategories.length === 0) {
              const matchedCategories = findMatchingPublicCategories(
                product.csvCategory, 
                product.sizeAttribute, 
                publicCategories
              );
              if (matchedCategories.length > 0) {
                return { ...product, publicCategories: matchedCategories };
              }
            }
            return product;
          })
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicCategories]);

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
      
      // Reset file input so same file can be selected again if needed
      if (e.target) {
        e.target.value = '';
      }
      if (selectedVendor === 'ao76') {
        parseAo76CSV(text);
      } else if (selectedVendor === 'lenewblack') {
        parseLeNewBlackCSV(text);
      } else if (selectedVendor === 'playup') {
        parsePlayUpCSV(text);
      } else if (selectedVendor === 'floss') {
        parseFlossCSV(text);
      } else if (selectedVendor === 'tinycottons') {
        parseTinycottonsCSV(text);
      } else if (selectedVendor === 'indee') {
        parseIndeeCSV(text);
      } else if (selectedVendor === 'jenest') {
        parseJenestCSV(text);
      } else if (selectedVendor === 'wyncken') {
        // Detect which CSV file this is
        const firstLine = text.split('\n')[0].toLowerCase();
        if (firstLine.includes('product id') && firstLine.includes('style') && firstLine.includes('barcode')) {
          // This is the BARCODES CSV
          handleWynckenBarcodesCsv(text);
        } else if (firstLine.includes('product id') && firstLine.includes('style') && firstLine.includes('description')) {
          // This is the PRODUCT DESCRIPTIONS CSV
          handleWynckenDescriptionsCsv(text);
        } else {
          alert('⚠️ Onbekend CSV formaat. Upload PRODUCT DESCRIPTIONS.csv of SS26 BARCODES.csv');
        }
      } else if (selectedVendor === 'onemore') {
        parseOnemoreCSV(text);
      } else if (selectedVendor === 'weekendhousekids') {
        // Check if this is the correct file (order-*.csv, not export-Order-*.csv)
        const fileName = file.name.toLowerCase();
        if (fileName.includes('export-order') || fileName.startsWith('export-')) {
          alert('⚠️ Verkeerd bestand gedetecteerd!\n\nGebruik het "order-*.csv" bestand, niet het "export-Order-*.csv" bestand.\n\nHet order-*.csv bestand heeft headers zoals: Order id;Date;Status;Product reference;Product name;...');
          return;
        }
        parseWeekendHouseKidsCSV(text);
      } else if (selectedVendor === 'emileetida') {
        // Emile et Ida - auto-detect Order CSV vs TARIF CSV
        const firstLine = text.split('\n')[0].toLowerCase();
        if (firstLine.includes('rrp eur') && firstLine.includes('gencod')) {
          // This is the TARIF CSV with RRP prices
          parseEmileetidaTarifCSV(text);
        } else if (firstLine.includes('product name') && firstLine.includes('ean13')) {
          // This is the Order CSV
          parseEmileetidaCSV(text);
        } else {
          alert('⚠️ Onbekend CSV formaat voor Emile et Ida.\n\nUpload eerst de Order CSV (met Product name, EAN13)\nof de TARIF CSV (met Gencod, RRP EUR) voor verkoopprijzen.');
        }
      } else if (selectedVendor === 'bobochoses') {
        // Bobo Choses - only handle Packing list CSV here (PDF handled by separate handler)
        const firstLine = text.split('\n')[0].toLowerCase();
        
        // Check if it's the Packing list CSV
        if (firstLine.includes('bobo choses') || text.toUpperCase().includes('BOX;REFERENCE;DESCRIPTION')) {
          parseBobochosesCSV(text);
        } else {
          alert('⚠️ Onbekend CSV bestand voor Bobo Choses.\n\nUpload de Packing list CSV (met BOX, REFERENCE, DESCRIPTION, etc.).\n\nVoor de Price PDF, gebruik de aparte PDF upload knop.');
        }
      } else if (selectedVendor === 'thenewsociety') {
        // Detect if this is order confirmation CSV (with SRP) or order CSV (with EAN13)
        const lines = text.trim().split('\n');
        console.log(`🌿 The New Society: Checking ${lines.length} lines`);
        if (lines.length > 0) {
          // Find header line (can start with ; for Order Confirmation format)
          let headerLine = '';
          let foundOrderConfirmation = false;
          let foundOrderCSV = false;
          
          // Debug: show first few lines
          console.log('🌿 First 10 lines:', lines.slice(0, 10).map((l, i) => `${i + 1}: ${l.substring(0, 80)}`));
          
          for (let i = 0; i < Math.min(50, lines.length); i++) {
            const line = lines[i].trim();
            if (!line || !line.includes(';')) continue;
            
            const lineUpper = line.toUpperCase();
            console.log(`🌿 Checking line ${i + 1}: ${line.substring(0, 80)}`);
            
            // Check for Order Confirmation format: SRP + REFERENCIA + VARIANTE
            const hasSRP = lineUpper.includes('SRP');
            const hasREFERENCIA = lineUpper.includes('REFERENCIA');
            const hasVARIANTE = lineUpper.includes('VARIANTE');
            
            if (hasSRP && hasREFERENCIA && hasVARIANTE) {
              headerLine = lineUpper;
              foundOrderConfirmation = true;
              console.log(`✅ Found Order Confirmation header at line ${i + 1}: ${line.substring(0, 100)}`);
              break;
            }
            
            // Check for Order CSV format: Product reference + EAN13
            const hasProductRef = lineUpper.includes('PRODUCT REFERENCE');
            const hasEAN = lineUpper.includes('EAN13') || lineUpper.includes('EAN');
            
            if (hasProductRef && hasEAN) {
              headerLine = lineUpper;
              foundOrderCSV = true;
              console.log(`✅ Found Order CSV header at line ${i + 1}: ${line.substring(0, 100)}`);
              break;
            }
          }
          
          // If we didn't find a clear header, try to find any line with SRP or Product reference
          if (!headerLine) {
            console.log('⚠️ No clear header found, trying fallback detection...');
            for (let i = 0; i < Math.min(50, lines.length); i++) {
              const line = lines[i].trim();
              if (line && line.includes(';')) {
                const lineUpper = line.toUpperCase();
                if (lineUpper.includes('SRP')) {
                  headerLine = lineUpper;
                  foundOrderConfirmation = true;
                  console.log(`⚠️ Found potential Order Confirmation header (SRP only) at line ${i + 1}`);
                  break;
                }
                if (lineUpper.includes('PRODUCT REFERENCE')) {
                  headerLine = lineUpper;
                  foundOrderCSV = true;
                  console.log(`⚠️ Found potential Order CSV header at line ${i + 1}`);
                  break;
                }
              }
            }
          }
          
          if (foundOrderCSV) {
            console.log('🌿 Detected The New Society Order CSV (with EAN13)');
            parseTheNewSocietyOrderCSV(text);
          } else if (foundOrderConfirmation) {
            console.log('🌿 Detected The New Society Order Confirmation CSV (with SRP, REFERENCIA, VARIANTE)');
            // Order Confirmation CSV should come after Order CSV - it only provides SRP prices
            if (parsedProducts.length === 0) {
              alert('⚠️ EERST de Order CSV uploaden!\n\nUpload first:\n1. Order CSV (met EAN13, SKU\'s, sizes, quantities, etc.)\n2. Then Order Confirmation CSV (alleen voor SRP/verkoopprijs)\n\nThe Order CSV contains all the import data!');
              return;
            }
            parseTheNewSocietyOrderConfirmationCSV(text);
          } else {
            console.error('❌ Could not detect CSV format. Header line:', headerLine);
            alert('⚠️ Onbekend CSV-formaat!\n\nVerwacht:\n- Order Confirmation CSV met SRP en REFERENCIA kolommen\n- Order CSV met Product reference en EAN13 kolommen');
          }
        }
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

  const handleThinkingMuPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/parse-thinkingmu-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.products) {
        parseThinkingMuProducts(data.products);
        alert(`✅ ${data.productCount} producten geparsed uit PDF\nTotaal aantal: ${data.totalQuantity}\nTotale waarde: €${data.totalValue?.toFixed(2) || '0.00'}`);
      } else {
        alert(`❌ Fout bij parsen PDF: ${data.error || 'Onbekende fout'}`);
        if (data.debugText) {
          console.log('Debug text:', data.debugText);
        }
      }
    } catch (error: any) {
      alert(`❌ Fout bij uploaden PDF: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert product name from "QUICK STRIPES RAIDA TOP" to "Quick stripes raida top"
  const formatProductName = (name: string): string => {
    if (!name) return name;
    // Convert to lowercase, then capitalize first letter
    const lowercased = name.toLowerCase();
    return lowercased.charAt(0).toUpperCase() + lowercased.slice(1);
  };

  const parseThinkingMuProducts = (pdfProducts: Array<{
    barcode: string;
    name: string;
    styleCode: string;
    size: string;
    quantity: number;
    price: number;
    total: number;
  }>) => {
    console.log(`🌿 Parsing ${pdfProducts.length} Thinking Mu products...`);
    
    const products: Map<string, ParsedProduct> = new Map();
    
    for (const item of pdfProducts) {
      // Create a product key based on style code + color (product name)
      const productKey = `${item.styleCode}-${item.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      // Format product name: "QUICK STRIPES RAIDA TOP" -> "Quick stripes raida top"
      const formattedName = formatProductName(item.name);
      
      if (!products.has(productKey)) {
        // Auto-detect Thinking Mu brand
        const suggestedBrand = brands.find(b => 
          b.name.toLowerCase().includes('thinking') || b.name.toLowerCase().includes('mu')
        );
        
        products.set(productKey, {
          reference: item.styleCode,
          name: `Thinking Mu - ${formattedName}`,
          originalName: formattedName,
          color: '',
          material: '',
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: 'Maat',
        });
      }
      
      const product = products.get(productKey)!;
      
      // Add variant for this size
      product.variants.push({
        size: item.size,
        ean: item.barcode,
        sku: `${item.styleCode}-${item.size}`,
        quantity: item.quantity,
        price: item.price, // Cost price from invoice
        rrp: item.price * 2.5, // Default markup for retail price
      });
    }
    
    // Convert to array and determine size attribute
    const productList = Array.from(products.values());
    
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    console.log(`🌿 Parsed ${productList.length} Thinking Mu products`);
    
    setParsedProducts(productList);
    if (productList.length > 0) {
      setCurrentStep(2);
    }
  };

  // Convert product name from "LONG SLEEVES OVERSIZED DRESS" to "Long sleeves oversized dress"
  const formatIndeeName = (name: string): string => {
    if (!name) return name;
    const lowercased = name.toLowerCase();
    return lowercased.charAt(0).toUpperCase() + lowercased.slice(1);
  };

  const parseIndeeCSV = (text: string) => {
    // Indee CSV format (semicolon separated):
    // Season;Product Category 1;Product Category 2;Style;Colour;Description;Size;Barcode;Textile Content;WSP EUR;Ccy Symbol;RRP;Sales Order Quantity
    console.log('👗 Parsing Indee CSV...');
    
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header
    const headers = lines[0].split(';').map(h => h.trim());
    console.log('Headers:', headers);

    // Find column indexes
    const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
    const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
    const barcodeIdx = headers.findIndex(h => h.toLowerCase() === 'barcode');
    const textileIdx = headers.findIndex(h => h.toLowerCase() === 'textile content');
    const wspIdx = headers.findIndex(h => h.toLowerCase() === 'wsp eur');
    const rrpIdx = headers.findIndex(h => h.toLowerCase() === 'rrp');
    const qtyIdx = headers.findIndex(h => h.toLowerCase() === 'sales order quantity');
    if (styleIdx === -1 || sizeIdx === -1 || barcodeIdx === -1) {
      alert('CSV mist verplichte kolommen: Style, Size, of Barcode');
      return;
    }

    const products: { [key: string]: ParsedProduct } = {};

    // Auto-detect Indee brand (search for variations)
    console.log(`👗 Looking for Indee brand among ${brands.length} brands...`);
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('indee') || 
      b.name.toLowerCase() === 'indee'
    );
    
    if (suggestedBrand) {
      console.log(`✅ Found brand: ${suggestedBrand.name} (ID: ${suggestedBrand.id})`);
    } else {
      console.log('⚠️ Indee brand not found in Odoo. Available brands:', brands.map(b => b.name).slice(0, 20));
    }

    // Parse data lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(';').map(v => v.trim());
      
      const style = values[styleIdx] || '';
      const colour = values[colourIdx] || '';
      const description = values[descriptionIdx] || '';
      let size = values[sizeIdx] || '';
      const barcode = values[barcodeIdx] || '';
      const textileContent = textileIdx !== -1 ? values[textileIdx] || '' : '';
      const wspStr = wspIdx !== -1 ? values[wspIdx] || '0' : '0';
      const rrpStr = rrpIdx !== -1 ? values[rrpIdx] || '0' : '0';
      const qtyStr = qtyIdx !== -1 ? values[qtyIdx] || '1' : '1';

      if (!style || !barcode) continue;

      // Parse prices - WSP is wholesale price (cost), RRP is retail price
      const costPrice = parseFloat(wspStr.replace(',', '.')) || 0;
      // RRP might have "€" symbol, e.g., "€ 155.00"
      const rrpClean = rrpStr.replace(/[€\s]/g, '').replace(',', '.');
      const retailPrice = parseFloat(rrpClean) || 0;

      const quantity = parseInt(qtyStr) || 1;

      // Handle TU (Taille Unique = One Size) as unit size
      if (size.toUpperCase() === 'TU') {
        size = 'U';
      }

      // Create product key based on style + colour
      const productKey = `${style}-${colour}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      if (!products[productKey]) {
        // Format names: "VILLAGGIO" -> "Villaggio", "LONG SLEEVES OVERSIZED DRESS" -> "Long sleeves oversized dress"
        const formattedStyle = formatIndeeName(style);
        const formattedDescription = formatIndeeName(description);
        const formattedColour = formatIndeeName(colour);
        
        // Product name: "Indee - Villaggio long sleeves oversized dress tomato red"
        const productName = `Indee - ${formattedStyle} ${formattedDescription.toLowerCase()} ${formattedColour.toLowerCase()}`.trim();

        products[productKey] = {
          reference: style,
          name: productName,
          originalName: `${style} ${description}`,
          color: colour,
          material: textileContent,
          ecommerceDescription: description,
          variants: [],
          suggestedBrand: suggestedBrand?.name || 'Indee',
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };
      }

      // Add variant
      products[productKey].variants.push({
        size,
        ean: barcode,
        sku: `${style}-${colour}-${size}`.replace(/\s+/g, '-'),
        quantity,
        price: costPrice,
        rrp: retailPrice,
      });
    }

    const productList = Object.values(products);
    
    // Determine size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });

    console.log(`👗 Parsed ${productList.length} Indee products`);
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    
    if (productList.length > 0) {
      setCurrentStep(2);
      
      // Provide feedback about brand detection
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk "Indee" niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit Indee CSV${brandMessage}`);
    } else {
      alert('⚠️ Geen producten gevonden in CSV');
    }
  };

  // Sunday Collective PDF upload handler
  const handleSundayCollectivePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/parse-sundaycollective-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.products) {
        parseSundayCollectiveProducts(data.products);
        alert(`✅ ${data.productCount} producten geparsed uit PDF\nTotaal aantal: ${data.totalQuantity}\nTotale waarde: €${data.totalValue?.toFixed(2) || '0.00'}\n\n⚠️ Let op: Barcodes moeten handmatig worden toegevoegd!`);
      } else {
        console.error('Failed to parse PDF:', data.error);
        if (data.debugLines) {
          console.log('Debug lines:', data.debugLines);
        }
        alert(`❌ Fout bij parsen PDF: ${data.error}\n\nControleer de browser console voor meer details.`);
      }
    } catch (error: unknown) {
      alert(`❌ Fout bij uploaden PDF: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert product name to sentence case for Sunday Collective
  const formatSundayCollectiveName = (name: string): string => {
    if (!name) return name;
    // "Avenue Shorts" -> "Avenue shorts"
    const words = name.split(' ');
    return words.map((word, idx) => 
      idx === 0 ? word : word.toLowerCase()
    ).join(' ');
  };

  const parseSundayCollectiveProducts = (pdfProducts: Array<{
    sku: string;
    name: string;
    color: string;
    size: string;
    quantity: number;
    price: number;
    msrp: number;
    total: number;
  }>) => {
    console.log(`☀️ Parsing ${pdfProducts.length} Sunday Collective products...`);
    
    const products: Map<string, ParsedProduct> = new Map();
    
    // Auto-detect Sunday Collective brand
    console.log(`☀️ Looking for Sunday Collective brand among ${brands.length} brands...`);
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('sunday') || 
      b.name.toLowerCase().includes('collective') ||
      b.name.toLowerCase() === 'the sunday collective'
    );
    
    if (suggestedBrand) {
      console.log(`✅ Found brand: ${suggestedBrand.name} (ID: ${suggestedBrand.id})`);
    } else {
      console.log('⚠️ Sunday Collective brand not found in Odoo');
    }
    
    for (const item of pdfProducts) {
      // Create a product key based on SKU prefix (without size) + color
      // SKU format: S26W2161-GR-2 -> S26W2161-GR
      const skuBase = item.sku.replace(/-\d{1,2}$/, '');
      const productKey = `${skuBase}-${item.color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      // Format product name: "The Sunday Collective - Avenue shorts in cucumber stripe"
      const formattedName = formatSundayCollectiveName(item.name);
      const formattedColor = item.color.toLowerCase();
      const productName = `The Sunday Collective - ${formattedName} in ${formattedColor}`;
      
      if (!products.has(productKey)) {
        products.set(productKey, {
          reference: skuBase,
          name: productName,
          originalName: `${item.name} In ${item.color}`,
          color: item.color,
          material: '',
          variants: [],
          suggestedBrand: suggestedBrand?.name || 'The Sunday Collective',
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: 'MAAT Kinderen', // Sunday Collective is kids clothing
        });
      }
      
      const product = products.get(productKey)!;
      
      // Add variant for this size (no barcode - will be added manually)
      product.variants.push({
        size: item.size,
        ean: '', // No barcode available - to be filled manually
        sku: item.sku,
        quantity: item.quantity,
        price: item.price, // Cost price from invoice
        rrp: item.msrp, // MSRP from invoice
      });
    }
    
    // Convert to array
    const productList = Array.from(products.values());
    
    // Determine size attributes (should already be MAAT Kinderen for Sunday Collective)
    productList.forEach(product => {
      // Keep MAAT Kinderen as default for Sunday Collective (kids clothing)
      if (!product.sizeAttribute) {
        product.sizeAttribute = determineSizeAttribute(product.variants);
      }
    });
    
    console.log(`☀️ Parsed ${productList.length} Sunday Collective products`);
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    
    if (productList.length > 0) {
      setCurrentStep(2);
      
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit Sunday Collective PDF${brandMessage}\n\n⚠️ Barcodes zijn leeg - vul deze handmatig aan in stap 3!`);
    } else {
      alert('⚠️ Geen producten gevonden in PDF');
    }
  };

  // Parse Goldie and Ace CSV (handles multi-line PRODUCT FEATURES)
  const parseGoldieAndAceCSV = (text: string) => {
    console.log('🌻 Parsing Goldie and Ace CSV...');
    
    const lines = text.split('\n');
    if (lines.length < 2) {
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header
    const headers = lines[0].split(';').map(h => h.trim());
    const styleCodeIdx = headers.findIndex(h => h.toLowerCase() === 'style code');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    const colourNameIdx = headers.findIndex(h => h.toLowerCase() === 'colour name');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
    const barcodesIdx = headers.findIndex(h => h.toLowerCase() === 'barcodes');
    const retailEurIdx = headers.findIndex(h => h.toLowerCase() === 'retail eur');
    const wsEurIdx = headers.findIndex(h => h.toLowerCase() === 'w/s eur');
    const fitCommentsIdx = headers.findIndex(h => h.toLowerCase() === 'fit comments');
    const productFeaturesIdx = headers.findIndex(h => h.toLowerCase() === 'product features');

    if (styleCodeIdx === -1 || descriptionIdx === -1 || sizeIdx === -1) {
      alert('CSV mist verplichte kolommen: Style Code, Description, of Size');
      return;
    }

    const csvData = new Map<string, {
      styleCode: string;
      description: string;
      colourName: string;
      composition: string;
      size: string;
      barcode: string;
      retailPrice: number;
      wholesalePrice: number;
      fitComments: string;
      productFeatures: string;
    }>();

    // Parse CSV with proper handling of quoted multi-line PRODUCT FEATURES
    let i = 1;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }
      
      // Split by semicolon to check PRODUCT FEATURES column
      const parts = line.split(';');
      
      // Check if PRODUCT FEATURES (last column) starts with quote but doesn't end with quote on same line
      const productFeaturesValue = parts[productFeaturesIdx] || '';
      const isMultiLineFeatures = productFeaturesValue.startsWith('"') && !productFeaturesValue.endsWith('"');
      
      if (isMultiLineFeatures) {
        // Multi-line PRODUCT FEATURES - collect until we find closing quote
        // First line contains all fields before PRODUCT FEATURES, and PRODUCT FEATURES starts with quote
        const productFeaturesLines: string[] = [];
        let j = i;
        let foundClosingQuote = false;
        
        // Extract all fields from first line (before PRODUCT FEATURES)
        const styleCode = parts[styleCodeIdx]?.trim() || '';
        const description = parts[descriptionIdx]?.trim() || '';
        const colourName = parts[colourNameIdx]?.trim() || '';
        const composition = parts[compositionIdx]?.trim() || '';
        const size = parts[sizeIdx]?.trim() || '';
        const barcode = parts[barcodesIdx]?.trim() || '';
        const retailStr = parts[retailEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
        const wholesaleStr = parts[wsEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
        const fitComments = parts[fitCommentsIdx]?.trim() || '';
        
        // Get PRODUCT FEATURES start (remove the opening quote)
        const firstFeaturesLine = parts[productFeaturesIdx]?.replace(/^"/, '') || '';
        productFeaturesLines.push(firstFeaturesLine);
        
        // Continue reading lines until we find the closing quote
        j = i + 1;
        while (j < lines.length && !foundClosingQuote) {
          const nextLine = lines[j].trim();
          productFeaturesLines.push(nextLine);
          
          // Check if this line ends with a quote (closing the PRODUCT FEATURES field)
          if (nextLine.endsWith('"')) {
            // Remove the closing quote from the last line
            productFeaturesLines[productFeaturesLines.length - 1] = nextLine.slice(0, -1);
            foundClosingQuote = true;
          }
          j++;
        }
        
        // Combine PRODUCT FEATURES lines
        const productFeatures = productFeaturesLines.join('\n').trim();
        
        const retailPrice = parseFloat(retailStr) || 0;
        const wholesalePrice = parseFloat(wholesaleStr) || 0;
        
        const key = `${description}-${colourName}-${size}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        csvData.set(key, {
          styleCode,
          description,
          colourName,
          composition,
          size,
          barcode,
          retailPrice,
          wholesalePrice,
          fitComments,
          productFeatures,
        });
        
        i = j;
      } else {
        // Single-line product (PRODUCT FEATURES on same line or empty)
        if (parts.length > productFeaturesIdx) {
          const styleCode = parts[styleCodeIdx]?.trim() || '';
          const description = parts[descriptionIdx]?.trim() || '';
          const colourName = parts[colourNameIdx]?.trim() || '';
          const composition = parts[compositionIdx]?.trim() || '';
          const size = parts[sizeIdx]?.trim() || '';
          const barcode = parts[barcodesIdx]?.trim() || '';
          const retailStr = parts[retailEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
          const wholesaleStr = parts[wsEurIdx]?.replace(/[€\s]/g, '').replace(',', '.') || '0';
          const fitComments = parts[fitCommentsIdx]?.trim() || '';
          const productFeatures = parts[productFeaturesIdx]?.replace(/^"/, '').replace(/"$/, '').trim() || '';
          
          const retailPrice = parseFloat(retailStr) || 0;
          const wholesalePrice = parseFloat(wholesaleStr) || 0;
          
          const key = `${description}-${colourName}-${size}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
          
          csvData.set(key, {
            styleCode,
            description,
            colourName,
            composition,
            size,
            barcode,
            retailPrice,
            wholesalePrice,
            fitComments,
            productFeatures,
          });
        }
        
        i++;
      }
    }

    console.log(`🌻 Parsed ${csvData.size} products from CSV`);
    setGoldieAndAceCsvData(csvData);
    
    if (csvData.size > 0) {
      alert(`✅ ${csvData.size} producten geladen uit CSV Line Sheet\n\nUpload nu de PDF factuur om de producten te importeren.`);
    } else {
      alert('⚠️ Geen producten gevonden in CSV');
    }
  };

  // Wyncken PDF upload handler
  const handleWynckenPdfUploadHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleWynckenPdfUpload(file);
  };

  // Goldie and Ace PDF upload handler
  const handleGoldieAndAcePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (goldieAndAceCsvData.size === 0) {
      alert('⚠️ Upload eerst de CSV Line Sheet!\n\n1. Upload CSV Line Sheet\n2. Upload PDF Factuur');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/parse-goldieandace-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.products) {
        parseGoldieAndAceProducts(data.products);
      } else {
        console.error('Failed to parse PDF:', data.error);
        if (data.debugLines) {
          console.log('Debug lines:', data.debugLines);
        }
        alert(`❌ Fout bij parsen PDF: ${data.error}\n\nControleer de browser console voor meer details.`);
      }
    } catch (error: unknown) {
      alert(`❌ Fout bij uploaden PDF: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Goldie and Ace CSV upload handler
  const handleGoldieAndAceCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseGoldieAndAceCSV(text);
    };
    reader.readAsText(file);
  };

  // Parse Goldie and Ace products (match PDF invoice with CSV data)
  const parseGoldieAndAceProducts = (invoiceProducts: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>) => {
    console.log(`🌻 Parsing ${invoiceProducts.length} Goldie and Ace invoice products...`);
    
    // Auto-detect Goldie and Ace brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('goldie') || 
      b.name.toLowerCase().includes('ace') ||
      b.name.toLowerCase().includes('goldie and ace')
    );
    
    if (suggestedBrand) {
      console.log(`✅ Found brand: ${suggestedBrand.name} (ID: ${suggestedBrand.id})`);
    } else {
      console.log('⚠️ Goldie and Ace brand not found in Odoo');
    }

    const products: Map<string, ParsedProduct> = new Map();

    for (const invoiceItem of invoiceProducts) {
      // Extract product name and size from invoice description
      // Format: "COLOUR BLOCK OXFORD BURTON OVERALLS 2Y" or "RIB APPLE TANK 3Y"
      const invoiceDesc = invoiceItem.description.trim();
      
      // Try to extract size (last part: 2Y, 3Y, 1-2Y, 0-3M, etc.)
      const sizeMatch = invoiceDesc.match(/(\d+Y|\d+-\d+Y|\d+-\d+M|\d+M|\dY)$/i);
      if (!sizeMatch) continue;
      
      const size = sizeMatch[1];
      const productName = invoiceDesc.substring(0, invoiceDesc.length - size.length).trim();
      
      // Try to match with CSV data
      // We need to find matching description + colour + size
      let matchedCsvData: {
        styleCode: string;
        description: string;
        colourName: string;
        composition: string;
        size: string;
        barcode: string;
        retailPrice: number;
        wholesalePrice: number;
        fitComments: string;
        productFeatures: string;
      } | null = null;
      
      // Try exact match first
      for (const [, csvItem] of goldieAndAceCsvData.entries()) {
        // Normalize sizes for comparison (2Y vs 2Y, 1-2Y vs 1-2Y)
        const csvSizeNormalized = csvItem.size.toUpperCase();
        const invoiceSizeNormalized = size.toUpperCase();
        
        // Check if description matches (case insensitive, allow partial match)
        const csvDescNormalized = csvItem.description.trim().toUpperCase();
        const invoiceNameNormalized = productName.toUpperCase();
        
        if (csvSizeNormalized === invoiceSizeNormalized && 
            (csvDescNormalized === invoiceNameNormalized || 
             csvDescNormalized.includes(invoiceNameNormalized) ||
             invoiceNameNormalized.includes(csvDescNormalized))) {
          matchedCsvData = csvItem;
          break;
        }
      }
      
      // If no exact match, try to find by description only (might have different color name)
      if (!matchedCsvData) {
        for (const csvItem of goldieAndAceCsvData.values()) {
          const csvDescNormalized = csvItem.description.trim().toUpperCase();
          const invoiceNameNormalized = productName.toUpperCase();
          
          if (csvDescNormalized === invoiceNameNormalized || 
              csvDescNormalized.includes(invoiceNameNormalized) ||
              invoiceNameNormalized.includes(csvDescNormalized)) {
            // Check if size matches
            const csvSizeNormalized = csvItem.size.toUpperCase();
            const invoiceSizeNormalized = size.toUpperCase();
            
            if (csvSizeNormalized === invoiceSizeNormalized) {
              matchedCsvData = csvItem;
              break;
            }
          }
        }
      }
      
      if (!matchedCsvData) {
        console.warn(`⚠️ No CSV match found for: ${invoiceDesc}`);
        continue;
      }
      
      // Convert size to Dutch format
      const convertSizeToDutch = (sizeStr: string): string => {
        // Handle age ranges: 1-2Y -> 1 jaar, 3-4Y -> 3 jaar, etc.
        if (sizeStr.match(/^\d+-\d+Y$/i)) {
          const match = sizeStr.match(/^(\d+)-\d+Y$/i);
          return match ? `${match[1]} jaar` : sizeStr;
        }
        // Handle single ages: 2Y -> 2 jaar
        if (sizeStr.match(/^\d+Y$/i)) {
          const match = sizeStr.match(/^(\d+)Y$/i);
          return match ? `${match[1]} jaar` : sizeStr;
        }
        // Handle months: 0-3M -> 0-3 maand, 6-12M -> 6-12 maand
        if (sizeStr.match(/\d+-\d+M$/i)) {
          return sizeStr.replace(/M$/i, ' maand');
        }
        // Handle single months: 3M -> 3 maand
        if (sizeStr.match(/^\d+M$/i)) {
          return sizeStr.replace(/M$/i, ' maand');
        }
        return sizeStr;
      };
      
      const dutchSize = convertSizeToDutch(size);
      
      // Create product key: styleCode + colourName
      const productKey = `${matchedCsvData.styleCode}-${matchedCsvData.colourName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      // Format product name: "Goldie and Ace - Colour block oxford burton overalls"
      const formattedDescription = matchedCsvData.description.trim();
      const productNameFormatted = `Goldie and Ace - ${formattedDescription.charAt(0).toUpperCase() + formattedDescription.slice(1).toLowerCase()}`;
      
      // Combine FIT COMMENTS + PRODUCT FEATURES for ecommerceDescription
      const ecommerceDescription = [
        matchedCsvData.fitComments,
        matchedCsvData.productFeatures
      ].filter(Boolean).join('\n\n').trim();
      
      if (!products.has(productKey)) {
        products.set(productKey, {
          reference: matchedCsvData.styleCode,
          name: productNameFormatted,
          originalName: formattedDescription,
          color: matchedCsvData.colourName,
          material: matchedCsvData.composition,
          ecommerceDescription: ecommerceDescription,
          variants: [],
          suggestedBrand: suggestedBrand?.name || 'Goldie and Ace',
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        });
      }
      
      const product = products.get(productKey)!;
      
      // Add variant
      product.variants.push({
        size: dutchSize,
        ean: matchedCsvData.barcode,
        sku: `${matchedCsvData.styleCode}-${matchedCsvData.colourName}-${size}`.replace(/\s+/g, '-'),
        quantity: invoiceItem.quantity,
        price: invoiceItem.unitPrice, // Use price from invoice
        rrp: matchedCsvData.retailPrice, // Use retail price from CSV
      });
    }
    
    const productList = Array.from(products.values());
    
    // Determine size attributes
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    console.log(`🌻 Parsed ${productList.length} Goldie and Ace products`);
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    
    if (productList.length > 0) {
      setCurrentStep(2);
      
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit Goldie and Ace invoice${brandMessage}`);
    } else {
      alert('⚠️ Geen producten gevonden - controleer of CSV en PDF matchen');
    }
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
            isPublished: true,
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

        const toTitleCase = (str: string) =>
          str
            .toLowerCase()
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        // Auto-detect brand from name
        const nameLower = name.toLowerCase();
        const suggestedBrand = brands.find(b => 
          nameLower.includes(b.name.toLowerCase())
        );

        const formattedName = `Ao76 - ${toTitleCase(name)}`;

        products[reference] = {
          reference,
          name: formattedName,
          originalName: name, // Store original name for image search
          material,
          color,
          ecommerceDescription: formattedName,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false, // Default to not favorite
          isPublished: true,
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
          isPublished: true,
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
      'XXS': 'XXS - 32',
      'XS': 'XS - 34',
      'S': 'S - 36',
      'M': 'M - 38',
      'L': 'L - 40',
      'XL': 'XL - 42',
      'XXL': 'XXL - 44',
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
          isPublished: true,
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
          isPublished: true,
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

  const parseTinycottonsCSV = (text: string) => {
    // Tinycottons (Tiny Big Sister) format parser
    // Semicolon-separated format with headers
    // Format: Order id;Season;Brand name;Category;Product name;Composition;Size name;EAN13;Quantity;Unit price;RRP
    
    console.log(`🎀 Parsing Tinycottons CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (first line)
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`🎀 Headers: ${JSON.stringify(headers)}`);
    
    // Validate headers
    if (!headers.includes('Product name') || !headers.includes('EAN13')) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Order id, Season, Brand name, Category, Product name, Composition, Size name, EAN13, Quantity, Unit price, RRP');
      return;
    }

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      const productName = row['Product name'] || '';
      const composition = row['Composition'] || '';
      const size = row['Size name'] || '';
      const quantity = parseInt(row['Quantity'] || '0');
      const ean = row['EAN13'] || '';
      
      // Skip rows without product name or EAN
      if (!productName || !ean) {
        if (productName || ean) {
          console.log(`⚠️ Skipping row ${i}: incomplete data`);
        }
        continue;
      }
      
      const price = parsePrice(row['Unit price'] || '0');
      const rrp = parsePrice(row['RRP'] || '0');

      // Use original product name as reference (for internal notes in Odoo)
      // This will be stored in the description field and used to find products later
      const reference = productName;

      if (!products[reference]) {
        // Format product name to match other vendors
        const toSentenceCase = (str: string) => {
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        const formattedName = `Tiny Big sister - ${toSentenceCase(productName)}`;
        
        // Auto-detect Tiny Big sister brand
        const suggestedBrand = brands.find(b => 
          b.name.toLowerCase().includes('tiny big sister') ||
          b.name.toLowerCase().includes('tinycottons') || 
          b.name.toLowerCase().includes('tiny cottons')
        );

        products[reference] = {
          reference,
          name: formattedName,
          originalName: productName,
          material: composition,
          color: '', // No color field in Tinycottons CSV
          ecommerceDescription: formattedName,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: '', // Will be auto-determined
        };

        console.log(`✅ Created product: ${formattedName} (${reference})`);
      }
      
      products[reference].variants.push({
        size: size,
        quantity: quantity,
        ean: ean,
        price: price,
        rrp: rrp,
      });
    }

    const productList = Object.values(products);
    console.log(`🎀 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Set size attribute to MAAT Volwassenen for all Tiny Big sister products
    productList.forEach(product => {
      product.sizeAttribute = 'MAAT Volwassenen';
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
  };

  // Emile et Ida TARIF CSV parser - builds price lookup map by EAN (Gencod)
  const parseEmileetidaTarifCSV = (text: string) => {
    console.log(`🌸 Parsing Emile et Ida TARIF CSV for RRP prices...`);
    
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      console.error('❌ TARIF CSV is leeg');
      alert('TARIF CSV bestand is leeg of ongeldig');
      return;
    }
    
    // Headers: Saison;Famille;Marque;Référence;Couleur;Taille;Gencod;Désignation;WHLS EUR;RRP EUR
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`🌸 TARIF Headers: ${JSON.stringify(headers)}`);
    
    // Find column indices
    const gencodIdx = headers.findIndex(h => h.toLowerCase() === 'gencod');
    const rrpIdx = headers.findIndex(h => h.toLowerCase() === 'rrp eur');
    
    if (gencodIdx === -1 || rrpIdx === -1) {
      console.error('❌ Missing required TARIF headers. Found:', headers);
      alert('Ongeldig TARIF CSV-formaat. Verwachte headers: Gencod, RRP EUR');
      return;
    }
    
    const priceMap = new Map<string, number>();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(';').map(v => v.trim());
      const gencod = values[gencodIdx] || '';
      const rrpStr = values[rrpIdx] || '0';
      
      if (!gencod) continue;
      
      // Parse price with comma as decimal separator (European format)
      const rrp = parseFloat(rrpStr.replace(',', '.')) || 0;
      
      if (rrp > 0) {
        priceMap.set(gencod, rrp);
      }
    }
    
    console.log(`🌸 Built price map with ${priceMap.size} EAN->RRP entries`);
    setEmileetidaPriceMap(priceMap);
    setEmileetidaTarifLoaded(true);
    
    // If order is already loaded, update RRP prices
    if (emileetidaOrderLoaded && parsedProducts.length > 0) {
      const updatedProducts = parsedProducts.map(product => ({
        ...product,
        variants: product.variants.map(variant => {
          const rrp = priceMap.get(variant.ean) || variant.rrp;
          return { ...variant, rrp };
        })
      }));
      setParsedProducts(updatedProducts);
      console.log(`🌸 Updated ${updatedProducts.length} products with RRP prices from TARIF`);
    }
  };

  // Emile et Ida Order CSV parser
  const parseEmileetidaCSV = (text: string, tarifPriceMap?: Map<string, number>) => {
    // Emile et Ida format parser
    // Semicolon-separated format with headers
    // Headers: Order id;Date;Status;Season;Brand name;Brand sales person;Collection;Category;Product name;Product reference;Color name;Description;Composition;Fabric / print;Size family name;Size name;EAN13;SKU;Quantity;Unit price;Net amount;Pre-discount amount;Discount rate;Currency
    
    console.log(`🌸 Parsing Emile et Ida Order CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (first line)
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`🌸 Headers: ${JSON.stringify(headers.slice(0, 15))}...`);
    
    // Find column indices
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
    const productRefIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
    const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    const fabricPrintIdx = headers.findIndex(h => h.toLowerCase() === 'fabric / print');
    const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');
    const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
    const ean13Idx = headers.findIndex(h => h.toLowerCase() === 'ean13');
    const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
    const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
    
    // Validate required headers
    if (productNameIdx === -1 || ean13Idx === -1 || productRefIdx === -1) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Product name, Product reference, EAN13');
      return;
    }

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.')) || 0;
    };

    // Convert Emile et Ida size format to display format
    // 02A -> 2 jaar, 03A -> 3 jaar, 03M -> 3 maand, TU -> U
    // 06-18M -> 6 - 18 maand, 02A-04A -> 2 - 4 jaar
    const convertSize = (size: string): string => {
      if (!size) return '';
      const upperSize = size.toUpperCase().trim();
      
      // TU = Taille Unique = One Size
      if (upperSize === 'TU') return 'U';
      
      // Match range patterns like 06-18M (months range)
      const monthRangeMatch = upperSize.match(/^(\d+)-(\d+)M$/);
      if (monthRangeMatch) {
        const from = parseInt(monthRangeMatch[1]);
        const to = parseInt(monthRangeMatch[2]);
        return `${from} - ${to} maand`;
      }
      
      // Match range patterns like 02A-04A (years range)
      const yearRangeMatch = upperSize.match(/^(\d+)A-(\d+)A$/);
      if (yearRangeMatch) {
        const from = parseInt(yearRangeMatch[1]);
        const to = parseInt(yearRangeMatch[2]);
        return `${from} - ${to} jaar`;
      }
      
      // Match single patterns like 02A, 03A, 10A (years)
      const yearMatch = upperSize.match(/^(\d+)A$/);
      if (yearMatch) {
        const years = parseInt(yearMatch[1]);
        return `${years} jaar`;
      }
      
      // Match single patterns like 03M, 06M, 12M, 18M (months)
      const monthMatch = upperSize.match(/^(\d+)M$/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1]);
        return `${months} maand`;
      }
      
      // Return original if no pattern matches
      return size;
    };

    // Auto-detect Emile et Ida brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('emile') && b.name.toLowerCase().includes('ida') ||
      b.name.toLowerCase() === 'emile et ida'
    );
    
    if (suggestedBrand) {
      console.log(`✅ Found brand: ${suggestedBrand.name} (ID: ${suggestedBrand.id})`);
    } else {
      console.log('⚠️ Emile et Ida brand not found in Odoo. Available brands:', brands.map(b => b.name).slice(0, 20));
    }

    // Use the passed tarifPriceMap or the state
    const priceMap = tarifPriceMap || emileetidaPriceMap;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(';').map(v => v.trim());
      
      const productName = productNameIdx !== -1 ? values[productNameIdx] || '' : '';
      const productRef = productRefIdx !== -1 ? values[productRefIdx] || '' : '';
      const colorName = colorNameIdx !== -1 ? values[colorNameIdx] || '' : '';
      const composition = compositionIdx !== -1 ? values[compositionIdx] || '' : '';
      const fabricPrint = fabricPrintIdx !== -1 ? values[fabricPrintIdx] || '' : '';
      const csvCategory = categoryIdx !== -1 ? values[categoryIdx] || '' : '';
      const sizeName = sizeNameIdx !== -1 ? values[sizeNameIdx] || '' : '';
      const ean13 = ean13Idx !== -1 ? values[ean13Idx] || '' : '';
      const sku = skuIdx !== -1 ? values[skuIdx] || '' : '';
      const quantity = quantityIdx !== -1 ? parseInt(values[quantityIdx] || '0') || 0 : 0;
      const unitPrice = unitPriceIdx !== -1 ? parsePrice(values[unitPriceIdx] || '0') : 0;
      
      // Skip rows without product name or EAN
      if (!productName || !ean13) {
        if (productName || ean13) {
          console.log(`⚠️ Skipping row ${i}: incomplete data (productName: ${productName}, ean13: ${ean13})`);
        }
        continue;
      }
      
      // Look up RRP from TARIF CSV by EAN, or calculate from unit price
      const rrp = priceMap.get(ean13) || (unitPrice * 2.5); // Default to 2.5x markup if no TARIF price
      
      // Create product key based on Product reference + Color name (unique product combo)
      const productKey = `${productRef}|${colorName}`;
      
      // Helper to convert to sentence case (first letter uppercase, rest lowercase)
      const toSentenceCase = (str: string) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      };
      
      // Product Name format: "Emile & Ida - Product name - Color name (product reference)"
      // Example: "Emile & Ida - Chapeau - Vivi (ad207d)"
      // Note: Always use "Emile & Ida" regardless of CSV brand name (which may be "Emile Et Ida")
      const displayBrand = 'Emile & Ida';
      const formattedName = `${displayBrand} - ${toSentenceCase(productName)} - ${toSentenceCase(colorName)} (${productRef.toLowerCase()})`;
      
      // E-commerce reference: "Product name" "Fabric / print"
      const ecommerceRef = fabricPrint ? `${productName} ${fabricPrint}` : productName;
      
      // Convert size for display
      const displaySize = convertSize(sizeName);

      if (!products[productKey]) {
        // Create unique reference by combining productRef and color for product selection
        // This ensures different colors of same product are treated as separate products
        const uniqueReference = colorName ? `${productRef}_${colorName.toUpperCase().replace(/\s+/g, '')}` : productRef;
        
        products[productKey] = {
          reference: uniqueReference,
          name: formattedName,
          originalName: productName,
          productName: productRef, // Used for image matching (keep original for matching)
          material: composition,
          color: colorName,
          fabricPrint: fabricPrint, // Store fabric/print info for AI description
          csvCategory: csvCategory, // Store CSV category for auto-matching
          ecommerceDescription: ecommerceRef,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: '', // Will be auto-determined based on size
        };

        console.log(`✅ Created product: ${formattedName} (Category: ${csvCategory})`);
      }
      
      products[productKey].variants.push({
        size: displaySize,
        quantity: quantity,
        ean: ean13,
        sku: sku,
        price: unitPrice,
        rrp: rrp,
      });
    }

    const productList = Object.values(products);
    console.log(`🌸 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Auto-determine size attribute based on sizes in the product
    productList.forEach(product => {
      // Check if any variant has baby sizes (months)
      const hasBabySizes = product.variants.some(v => v.size.includes('maand'));
      // Check if any variant has teen sizes (10+ jaar)
      const hasTeenSizes = product.variants.some(v => {
        const match = v.size.match(/^(\d+)\s*jaar/);
        return match && parseInt(match[1]) >= 10;
      });
      // Check if any variant has adult sizes (XXS, XS, S, M, L, XL, XXL - matching Odoo attribute values)
      const hasAdultSizes = product.variants.some(v => 
        /^(XXS|XS|S|M|L|XL|XXL)$/i.test(v.size.trim())
      );
      
      if (hasBabySizes) {
        product.sizeAttribute = "MAAT Baby's";
      } else if (hasTeenSizes) {
        product.sizeAttribute = 'MAAT Tieners';
      } else if (hasAdultSizes) {
        product.sizeAttribute = 'MAAT Volwassenen';
      } else {
        product.sizeAttribute = 'MAAT Kinderen';
      }
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setEmileetidaOrderLoaded(true);
    setCurrentStep(2);
  };

  // Bobo Choses PDF upload handler - calls API to parse PDF
  const handleBobochosesPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      console.log(`🎪 Uploading Bobo Choses PDF: ${file.name}`);
      const response = await fetch('/api/parse-bobochoses-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success && data.priceMap) {
        const priceMap = new Map<string, { wholesale: number; rrp: number }>();
        
        // Convert priceMap object to Map
        for (const [ref, prices] of Object.entries(data.priceMap)) {
          priceMap.set(ref, prices as { wholesale: number; rrp: number });
        }
        
        console.log(`🎪 Built price map with ${priceMap.size} REF->Price entries`);
        setBobochosesPriceMap(priceMap);
        setBobochosesPriceLoaded(true);
        
        // If packing list is already loaded, update prices
        if (bobochosesPackingLoaded && parsedProducts.length > 0) {
          const updatedProducts = parsedProducts.map(product => {
            // Try to match by base reference (without color code suffix)
            const baseRef = product.reference.split('_')[0].toUpperCase();
            const priceData = priceMap.get(baseRef) || priceMap.get(product.reference.toUpperCase());
            if (!priceData) return product;
            
            return {
              ...product,
              variants: product.variants.map(variant => ({
                ...variant,
                price: priceData.wholesale || variant.price,
                rrp: priceData.rrp || variant.rrp,
              }))
            };
          });
          setParsedProducts(updatedProducts);
          
          // Count how many products were matched
          const matchedCount = updatedProducts.filter(p => {
            const baseRef = p.reference.split('_')[0].toUpperCase();
            return priceMap.has(baseRef) || priceMap.has(p.reference.toUpperCase());
          }).length;
          
          alert(`✅ ${data.count} prijzen geladen uit PDF!\n\n${matchedCount} van ${updatedProducts.length} producten gematcht met prijzen.`);
        } else {
          alert(`✅ ${data.count} prijzen geladen uit PDF!\n\nUpload nu de Packing List CSV om producten te laden.`);
        }
      } else {
        console.error('PDF parse error:', data);
        alert(`❌ Fout bij parsen PDF: ${data.error || 'Onbekende fout'}\n\nProbeer de manuele prijs invoer te gebruiken.`);
        if (data.debugText) {
          console.log('Debug text:', data.debugText);
        }
      }
    } catch (error: unknown) {
      console.error('PDF upload error:', error);
      alert(`❌ Fout bij uploaden PDF: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };


  // Bobo Choses Packing List CSV parser
  const parseBobochosesCSV = (text: string, priceMapParam?: Map<string, { wholesale: number; rrp: number }>) => {
    console.log(`🎪 Parsing Bobo Choses Packing List CSV...`);
    
    const lines = text.trim().split('\n');
    
    // Find the header line (starts with BOX;REFERENCE;...)
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i].toUpperCase();
      if (line.includes('BOX') && line.includes('REFERENCE') && line.includes('DESCRIPTION')) {
        headerLineIdx = i;
        break;
      }
    }
    
    if (headerLineIdx === -1) {
      console.error('❌ Could not find header line in Bobo Choses CSV');
      alert('Ongeldig CSV-formaat. Verwachte headers: BOX;REFERENCE;DESCRIPTION;COLOR;SIZE;EAN;...');
      return;
    }
    
    // Parse header
    const headers = lines[headerLineIdx].split(';').map(h => h.trim().toUpperCase());
    console.log(`🎪 Headers: ${JSON.stringify(headers)}`);
    
    // Find column indices
    const refIdx = headers.findIndex(h => h === 'REFERENCE');
    const descIdx = headers.findIndex(h => h === 'DESCRIPTION');
    const colorIdx = headers.findIndex(h => h === 'COLOR');
    const sizeIdx = headers.findIndex(h => h === 'SIZE');
    const eanIdx = headers.findIndex(h => h === 'EAN');
    const qtyIdx = headers.findIndex(h => h === 'QUANTITY');
    
    if (refIdx === -1 || descIdx === -1 || sizeIdx === -1 || eanIdx === -1) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: REFERENCE, DESCRIPTION, SIZE, EAN');
      return;
    }
    
    const products: { [key: string]: ParsedProduct } = {};
    const priceMap = priceMapParam || bobochosesPriceMap;
    
    // Auto-detect Bobo Choses brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('bobo') || 
      b.name.toLowerCase().includes('choses')
    );
    
    // Helper to format product name
    const toTitleCase = (str: string): string => {
      if (!str) return '';
      return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };
    
    // Bobo Choses color code mapping (based on typical patterns)
    const getColorName = (colorCode: string): string => {
      // Color codes are numeric in Bobo Choses
      // Common patterns based on their system
      const colorMap: { [key: string]: string } = {
        '199': 'Off White',
        '311': 'Green',
        '421': 'Beige',
        '611': 'Red',
        '661': 'Pink',
        '721': 'Orange',
        '991': 'Multi',
        '211': 'Yellow',
      };
      return colorMap[colorCode] || `Color ${colorCode}`;
    };
    
    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(';').map(v => v.trim());
      
      const reference = values[refIdx] || '';
      const description = values[descIdx] || '';
      const colorCode = values[colorIdx] || '';
      const size = values[sizeIdx] || '';
      const ean = values[eanIdx] || '';
      const quantity = parseInt(values[qtyIdx] || '0', 10) || 1;
      
      if (!reference || !description) continue;
      
      // Create product key based on reference + color
      const productKey = `${reference}|${colorCode}`;
      const colorName = getColorName(colorCode);
      
      // Format product name: "Bobo Choses - Description - Color"
      const formattedName = `Bobo Choses - ${toTitleCase(description)} - ${colorName}`;
      
      // Look up prices from price map
      const priceData = priceMap.get(reference.toUpperCase());
      const wholesalePrice = priceData?.wholesale || 0;
      const rrpPrice = priceData?.rrp || 0;
      
      // Convert size for display (handle HEAD58, ONE SIZE, etc.)
      let displaySize = size;
      if (size === 'ONE SIZE') {
        displaySize = 'U';
      } else if (size.startsWith('HEAD')) {
        displaySize = size; // Keep as-is for head sizes
      }
      
      if (!products[productKey]) {
        // Create unique reference combining ref and color
        const uniqueReference = colorCode ? `${reference}_${colorCode}` : reference;
        
        products[productKey] = {
          reference: uniqueReference,
          name: formattedName,
          originalName: description,
          productName: reference,
          material: '',
          color: colorName,
          ecommerceDescription: description,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: '', // Will be auto-determined
        };
        
        console.log(`✅ Created product: ${formattedName} (Ref: ${reference})`);
      }
      
      products[productKey].variants.push({
        size: displaySize,
        quantity: quantity,
        ean: ean,
        sku: reference,
        price: wholesalePrice,
        rrp: rrpPrice,
      });
    }
    
    const productList = Object.values(products);
    console.log(`🎪 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Auto-determine size attribute based on sizes
    productList.forEach(product => {
      // Check if any variant has adult sizes (XS, S, M, L, XL, XXL)
      const hasAdultSizes = product.variants.some(v => 
        /^(XXS|XS|S|M|L|XL|XXL)$/i.test(v.size.trim())
      );
      // Check for shoe sizes (37-42 range typically adult)
      const hasAdultShoeSizes = product.variants.some(v => {
        const num = parseInt(v.size, 10);
        return num >= 35 && num <= 45;
      });
      // Check for head sizes
      const hasHeadSizes = product.variants.some(v => 
        v.size.toUpperCase().includes('HEAD')
      );
      // Check for ONE SIZE / U
      const hasOneSize = product.variants.some(v => 
        v.size === 'U' || v.size.toUpperCase() === 'ONE SIZE'
      );
      
      if (hasAdultSizes || hasAdultShoeSizes) {
        product.sizeAttribute = 'MAAT Volwassenen';
      } else if (hasHeadSizes || hasOneSize) {
        // For accessories, default to Kinderen unless clearly adult
        product.sizeAttribute = 'MAAT Kinderen';
      } else {
        product.sizeAttribute = 'MAAT Kinderen';
      }
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setBobochosesPackingLoaded(true);
    setCurrentStep(2);
  };

  const parseJenestCSV = (text: string) => {
    // Jenest format parser
    // Semicolon-separated format with headers
    // Format: Order no.;Date;Currency;Drop;Total Quantity;Total price;VAT;Shipping;Handling fee;VAT Amount;Total price after VAT;Comments;Order reference;Product name;Item number;Color;Size;Collection;SKU;EAN Number;Rec retail price;Line quantity;Line unit price;Total line price;Product description;Top categories;Sub categories;HS Tariff Code;Country of origin;Composition;Wash and care
    
    console.log(`👕 Parsing Jenest CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (first line)
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`👕 Headers: ${JSON.stringify(headers.slice(0, 15))}`);
    
    // Find column indices
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
    const itemNumberIdx = headers.findIndex(h => h.toLowerCase() === 'item number');
    const colorIdx = headers.findIndex(h => h.toLowerCase() === 'color');
    const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
    const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
    const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean number');
    const retailPriceIdx = headers.findIndex(h => h.toLowerCase() === 'rec retail price');
    const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'line quantity');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'line unit price');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'product description');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    
    // Validate required headers
    if (itemNumberIdx === -1 || productNameIdx === -1 || sizeIdx === -1) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Product name, Item number, Color, Size, EAN Number, Rec retail price, Line unit price, Product description');
      return;
    }

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      // Remove € symbol and spaces, replace comma with dot
      return parseFloat(str.replace(/[€\s]/g, '').replace(',', '.')) || 0;
    };

    // Auto-detect Jenest brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('jenest')
    );

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(';').map(v => v.trim());
      
      const productName = values[productNameIdx] || '';
      const itemNumber = values[itemNumberIdx] || '';
      const color = values[colorIdx] || '';
      const size = values[sizeIdx] || '';
      const sku = values[skuIdx] || '';
      const ean = values[eanIdx] || '';
      const retailPriceStr = values[retailPriceIdx] || '0';
      const quantityStr = values[quantityIdx] || '0';
      const unitPriceStr = values[unitPriceIdx] || '0';
      const description = values[descriptionIdx] || '';
      const composition = values[compositionIdx] || '';

      // Skip rows without item number or product name
      if (!itemNumber || !productName) {
        continue;
      }

      const retailPrice = parsePrice(retailPriceStr);
      const unitPrice = parsePrice(unitPriceStr);
      const quantity = parseInt(quantityStr) || 0;

      // Convert size to Dutch format (same as Goldie and Ace, with exceptions)
      const convertSizeToDutch = (sizeStr: string): string => {
        // Normalize: remove spaces and convert to uppercase for matching
        const normalized = sizeStr.trim().replace(/\s+/g, '').toUpperCase();
        
        // Handle age ranges: X-Yy -> X jaar (or Y jaar for exceptions)
        // Pattern: X-Yy or X-Y y (with or without space, case insensitive)
        if (normalized.match(/^\d+-\d+Y$/)) {
          const match = normalized.match(/^(\d+)-(\d+)Y$/);
          if (match) {
            const first = parseInt(match[1]);
            const second = parseInt(match[2]);
            
            // Exceptions: use second number for these ranges
            if ((first === 7 && second === 8) || 
                (first === 9 && second === 10) || 
                (first === 11 && second === 12)) {
              return `${second} jaar`;
            }
            // Default: use first number
            return `${first} jaar`;
          }
          return sizeStr;
        }
        // Handle single ages: 2Y -> 2 jaar
        if (normalized.match(/^\d+Y$/)) {
          const match = normalized.match(/^(\d+)Y$/);
          return match ? `${match[1]} jaar` : sizeStr;
        }
        // Handle months: 0-3M -> 0-3 maand, 6-12M -> 6-12 maand
        if (normalized.match(/^\d+-\d+M$/)) {
          return normalized.replace(/M$/, ' maand');
        }
        // Handle single months: 3M -> 3 maand
        if (normalized.match(/^\d+M$/)) {
          return normalized.replace(/M$/, ' maand');
        }
        // Convert SIZE formats: SIZE 24-27 -> 24/27, SIZE 28-31 -> 28/31, etc.
        if (normalized.startsWith('SIZE')) {
          const sizeMatch = normalized.match(/SIZE(\d+)-(\d+)/);
          if (sizeMatch) {
            return `${sizeMatch[1]}/${sizeMatch[2]}`;
          }
          return sizeStr;
        }
        return sizeStr;
      };

      const dutchSize = convertSizeToDutch(size);

      // Create product key based on item number + color
      const productKey = `${itemNumber}-${color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      if (!products[productKey]) {
        // Format product name: "Jenest - Product name - Color"
        const toSentenceCase = (str: string) => {
          if (!str) return str;
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        const formattedName = `Jenest - ${toSentenceCase(productName)}${color ? ` - ${toSentenceCase(color)}` : ''}`;

        products[productKey] = {
          reference: itemNumber,
          name: formattedName,
          originalName: productName,
          material: composition,
          color: color,
          ecommerceDescription: description, // Use Product description for ecommerce description
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };

        console.log(`✅ Created product: ${formattedName} (${itemNumber})`);
      }
      
      products[productKey].variants.push({
        size: dutchSize, // Use converted Dutch size format
        quantity: quantity,
        ean: ean,
        sku: sku,
        price: unitPrice, // Line unit price is wholesale/cost price
        rrp: retailPrice, // Rec retail price is retail price
      });
    }

    const productList = Object.values(products);
    console.log(`👕 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Determine size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
    
    if (productList.length > 0) {
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit Jenest CSV${brandMessage}`);
    } else {
      alert('⚠️ Geen producten gevonden in CSV');
    }
  };

  const parseOnemoreCSV = (text: string) => {
    // One More in the Family format parser
    // Semicolon-separated format with headers
    // Format: Order id;Date;Status;Season;Brand name;Brand sales person;Collection;Category;Product name;Product reference;Color name;Description;Composition;Fabric / print;Size family name;Size name;EAN13;SKU;Quantity;Unit price;Net amount;Pre-discount amount;Discount rate;Currency
    
    console.log(`👶 Parsing One More in the Family CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (first line)
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`👶 Headers: ${JSON.stringify(headers.slice(0, 15))}`);
    
    // Find column indices
    const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name'); // e.g., "26s063" (used in image filenames)
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
    const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
    const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
    const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
    const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');
    
    // Validate required columns
    if (productReferenceIdx === -1 || descriptionIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || eanIdx === -1) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Product reference, Description, Color name, Size name, EAN13');
      return;
    }

    // Auto-detect One More in the Family brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('one more') ||
      b.name.toLowerCase().includes('1+ in the family') ||
      b.name.toLowerCase().includes('onemore')
    );

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    // Convert size to Dutch format
    const convertSizeToDutch = (sizeStr: string): string => {
      if (!sizeStr) return sizeStr;
      const normalized = sizeStr.trim().toUpperCase();
      
      // Handle T sizes (T0, T1, T2, T3, T4) - these are baby sizes
      if (normalized.match(/^T\d+$/)) {
        return sizeStr; // Keep as-is for baby sizes
      }
      
      // Handle month sizes (1m, 3m, 6m, etc.)
      if (normalized.match(/^\d+M$/)) {
        return normalized.replace(/M$/, ' maand');
      }
      
      // Handle age sizes (18m, 24m, 36m, 48m) - convert to years if >= 12
      if (normalized.match(/^(\d+)M$/)) {
        const months = parseInt(normalized.replace(/M$/, ''));
        if (months >= 12) {
          const years = Math.floor(months / 12);
          return `${years} jaar`;
        }
        return `${months} maand`;
      }
      
      return sizeStr;
    };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      
      if (values.length < headers.length) {
        console.log(`⚠️ Skipping row ${i}: insufficient columns`);
        continue;
      }

      const productReference = values[productReferenceIdx] || '';
      const productName = productNameIdx >= 0 ? (values[productNameIdx] || '') : ''; // e.g., "26s063" (used in image filenames)
      const description = values[descriptionIdx] || '';
      const colorName = values[colorNameIdx] || '';
      const sizeName = values[sizeNameIdx] || '';
      const ean = values[eanIdx] || '';
      const sku = values[skuIdx] || '';
      const quantity = parseInt(values[quantityIdx] || '0');
      const unitPrice = parsePrice(values[unitPriceIdx] || '0');
      const composition = values[compositionIdx] || '';
      void (values[categoryIdx] || ''); // category parsed but not used
      
      // Skip rows without required data
      if (!productReference || !description || !colorName || !sizeName || !ean) {
        if (productReference || description) {
          console.log(`⚠️ Skipping row ${i}: incomplete data`);
        }
        continue;
      }
      
      // Create product key based on Product reference + Color name
      const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      if (!products[productKey]) {
        // Format product name: "1+ in the family - Description - Color"
        const toSentenceCase = (str: string) => {
          if (!str) return str;
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        const formattedName = `1+ in the family - ${toSentenceCase(description)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

        // Normalize reference to ensure uniqueness (same normalization as productKey)
        const normalizedReference = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

        products[productKey] = {
          reference: normalizedReference, // Make reference unique by including color, normalized for consistency
          name: formattedName,
          originalName: description,
          material: composition,
          color: colorName,
          ecommerceDescription: formattedName,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          // Store productName (e.g., "26s063") for use in image matching and internal notes
          productName: productName, // This will be stored in description field in Odoo
        };

        console.log(`✅ Created product: ${formattedName} (${productReference})`);
      }
      
      const dutchSize = convertSizeToDutch(sizeName);
      
      products[productKey].variants.push({
        size: dutchSize,
        quantity: quantity,
        ean: ean,
        sku: sku,
        price: unitPrice,
        rrp: unitPrice * 2.5, // Default RRP is 2.5x unit price (can be adjusted later)
      });
    }

    const productList = Object.values(products);
    console.log(`👶 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Determine size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
    
    if (productList.length > 0) {
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit One More in the Family CSV${brandMessage}`);
    } else {
      alert('⚠️ Geen producten gevonden in CSV');
    }
  };

  const parseWeekendHouseKidsCSV = (text: string) => {
    // Weekend House Kids format parser
    // Semicolon-separated format with headers
    // Format: Order id;Date;Status;Season;Brand name;Brand sales person;Collection;Category;Product name;Product reference;Color name;Description;Composition;Fabric / print;Size family name;Size name;EAN13;SKU;Quantity;Unit price;Net amount;Pre-discount amount;Discount rate;Currency
    
    console.log(`🏠 Parsing Weekend House Kids CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (first line)
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`🏠 Headers: ${JSON.stringify(headers.slice(0, 15))}`);
    
    // Find column indices
    const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
    const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
    const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
    const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
    const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    
    // Validate required columns
    if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || eanIdx === -1) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('⚠️ Verkeerd CSV-bestand gedetecteerd!\n\nGebruik het "order-*.csv" bestand (met headers zoals: Order id;Date;Status;Product reference;Product name;Color name;Size name;EAN13;...)\n\nNIET het "export-Order-*.csv" bestand gebruiken!');
      return;
    }

    // Auto-detect Weekend House Kids brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('weekend house kids') ||
      b.name.toLowerCase().includes('weekendhousekids') ||
      b.name.toLowerCase().includes('whk')
    );

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    // Convert size to Dutch format
    // Handles Weekend House Kids formats: 3/6m -> 6 maand, 6/12m -> 12 maand, etc.
    const convertSizeToDutch = (sizeStr: string): string => {
      if (!sizeStr) return sizeStr;
      const normalized = sizeStr.trim();
      
      // Handle month ranges: 3/6m -> 6 maand, 6/12m -> 12 maand, 12/18m -> 18 maand, 18/24m -> 24 maand
      // Take the second number (end of range) and convert to "X maand"
      if (normalized.match(/^\d+\/\d+\s*m$/i)) {
        const match = normalized.match(/^(\d+)\/(\d+)\s*m$/i);
        if (match) {
          const second = parseInt(match[2]);
          return `${second} maand`;
        }
      }
      
      // Handle single month format: 6m -> 6 maand (if not already converted)
      if (normalized.match(/^\d+\s*m$/i)) {
        const match = normalized.match(/^(\d+)\s*m$/i);
        if (match) {
          return `${match[1]} maand`;
        }
      }
      
      // Handle year ranges: 3/4 -> 4 jaar, 5/6 -> 6 jaar, 7/8 -> 8 jaar, 9/10 -> 10 jaar, 11/12 -> 12 jaar, 13/14 -> 14 jaar
      // Take the second number (end of range) and convert to "X jaar"
      if (normalized.match(/^\d+\/\d+$/)) {
        const match = normalized.match(/^(\d+)\/(\d+)$/);
        if (match) {
          const second = parseInt(match[2]);
          return `${second} jaar`;
        }
      }
      
      // Handle single year: 2 -> 2 jaar
      if (normalized.match(/^\d+$/)) {
        const num = parseInt(normalized);
        // If it's a small number (likely a year), convert to "X jaar"
        if (num >= 2 && num <= 14) {
          return `${num} jaar`;
        }
      }
      
      return sizeStr; // Return as-is if no match
    };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      
      if (values.length < headers.length) {
        console.log(`⚠️ Skipping row ${i}: insufficient columns`);
        continue;
      }

      const productReference = values[productReferenceIdx] || '';
      const productName = values[productNameIdx] || '';
      const colorName = values[colorNameIdx] || '';
      const sizeName = values[sizeNameIdx] || '';
      const ean = values[eanIdx] || '';
      const quantity = parseInt(values[quantityIdx] || '0');
      const unitPrice = parsePrice(values[unitPriceIdx] || '0');
      const composition = values[compositionIdx] || '';
      void (values[categoryIdx] || ''); // category parsed but not used
      const description = values[descriptionIdx] || '';
      
      // Skip rows without required data
      if (!productReference || !productName || !colorName || !sizeName || !ean) {
        if (productReference || productName) {
          console.log(`⚠️ Skipping row ${i}: incomplete data`);
        }
        continue;
      }
      
      // Create product key based on Product reference + Color name
      const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      if (!products[productKey]) {
        // Format product name: "Weekend House Kids - Product name - Color"
        const toSentenceCase = (str: string) => {
          if (!str) return str;
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        const formattedName = `Weekend House Kids - ${toSentenceCase(productName)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

        products[productKey] = {
          reference: productReference,
          name: formattedName,
          originalName: productName,
          material: composition,
          color: colorName,
          ecommerceDescription: description || formattedName,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };

        console.log(`✅ Created product: ${formattedName} (${productReference})`);
      }
      
      // Convert size to Dutch format (3/6m -> 6 maand, etc.)
      const dutchSize = convertSizeToDutch(sizeName);
      
      products[productKey].variants.push({
        size: dutchSize,
        quantity: quantity,
        ean: ean,
        price: unitPrice,
        rrp: unitPrice * 2.5, // Default RRP is 2.5x unit price (can be adjusted later)
      });
    }

    const productList = Object.values(products);
    console.log(`🏠 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Determine size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);
    
    if (productList.length > 0) {
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit Weekend House Kids CSV${brandMessage}`);
    } else {
      alert('⚠️ Geen producten gevonden in CSV');
    }
  };

  const parseTheNewSocietyOrderConfirmationCSV = (text: string) => {
    // The New Society format parser
    // Supports two formats:
    // 1. Standard format: Order id;Date;Status;Season;Brand name;...;Product reference;Color name;Size name;EAN13;Quantity;Unit price;...
    // 2. Order confirmation format: ESTILO;REFERENCIA;VARIANTE;SRP;TALLAS;...;CANT.;UNIDAD;TOTAL (SRP = Suggested Retail Price, UNIDAD = Unit price)
    
    console.log(`🌿 Parsing The New Society CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Find the header row (can start with ; for Order Confirmation format)
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i].trim();
      if (line && line.includes(';')) {
        const lineUpper = line.toUpperCase();
        // Look for Order Confirmation format: SRP + REFERENCIA + VARIANTE
        if (lineUpper.includes('SRP') && lineUpper.includes('REFERENCIA') && lineUpper.includes('VARIANTE')) {
          headerLineIdx = i;
          console.log(`🌿 Found Order Confirmation header at line ${i + 1}`);
          break;
        }
        // Look for Order CSV format: Product reference + EAN13
        if (lineUpper.includes('PRODUCT REFERENCE') && (lineUpper.includes('EAN13') || lineUpper.includes('EAN'))) {
          headerLineIdx = i;
          console.log(`🌿 Found Order CSV header at line ${i + 1}`);
          break;
        }
      }
    }
    
    if (headerLineIdx === -1) {
      console.error('❌ Could not find header row');
      alert('Kan de header regel niet vinden in het CSV bestand. Controleer of het bestand de juiste kolommen bevat.');
      return;
    }

    // Parse header
    const headers = lines[headerLineIdx].split(';').map(h => h.trim());
    console.log(`🌿 Headers: ${JSON.stringify(headers.slice(0, 15))}`);
    
    // Detect format: check for SRP column (order confirmation format) vs Product reference (standard format)
    const srpIdx = headers.findIndex(h => h.toUpperCase() === 'SRP');
    const referenciaIdx = headers.findIndex(h => h.toUpperCase() === 'REFERENCIA');
    const varianteIdx = headers.findIndex(h => h.toUpperCase() === 'VARIANTE');
    const unidadIdx = headers.findIndex(h => h.toUpperCase() === 'UNIDAD');
    const cantIdx = headers.findIndex(h => h.toUpperCase() === 'CANT.' || h.toUpperCase() === 'CANT');
    
    const isOrderConfirmationFormat = srpIdx !== -1 && referenciaIdx !== -1 && varianteIdx !== -1 && unidadIdx !== -1;
    
    // Find column indices for standard format
    const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
    const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
    const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
    const standardEanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
    const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
    const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    
    // Validate required columns based on format
    if (isOrderConfirmationFormat) {
      if (referenciaIdx === -1 || varianteIdx === -1 || srpIdx === -1 || unidadIdx === -1) {
        console.error('❌ Missing required headers for order confirmation format. Found:', headers);
        alert('Ongeldig CSV-formaat. Verwachte headers: REFERENCIA, VARIANTE, SRP, UNIDAD');
        return;
      }
      console.log(`✅ Detected order confirmation format (SRP/UNIDAD)`);
    } else {
      if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || standardEanIdx === -1) {
        console.error('❌ Missing required headers for standard format. Found:', headers);
        alert('Ongeldig CSV-formaat. Verwachte headers: Product reference, Product name, Color name, Size name, EAN13');
        return;
      }
      console.log(`✅ Detected standard format (Product reference/Unit price)`);
    }

    // Auto-detect The New Society brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('the new society') ||
      b.name.toLowerCase().includes('thenewsociety') ||
      b.name.toLowerCase().includes('tns')
    );

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    // Convert size to Dutch format
    // Handles The New Society formats: 2y -> 2 jaar, 3y -> 3 jaar, 8y -> 8 jaar, 10y -> 10 jaar, etc.
    // Also handles: 3/6m -> 6 maand, 6/12m -> 12 maand, etc.
    const convertSizeToDutch = (sizeStr: string): string => {
      if (!sizeStr) return sizeStr;
      const normalized = sizeStr.trim();
      
      // Handle year format with 'y' suffix: 2y -> 2 jaar, 3y -> 3 jaar, 8y -> 8 jaar, 10y -> 10 jaar, etc.
      if (normalized.match(/^\d+\s*y$/i)) {
        const match = normalized.match(/^(\d+)\s*y$/i);
        if (match) {
          return `${match[1]} jaar`;
        }
      }
      
      // Handle month ranges: 3/6m -> 6 maand, 6/12m -> 12 maand, 12/18m -> 18 maand, 18/24m -> 24 maand
      // Take the second number (end of range) and convert to "X maand"
      if (normalized.match(/^\d+\/\d+\s*m$/i)) {
        const match = normalized.match(/^(\d+)\/(\d+)\s*m$/i);
        if (match) {
          const second = parseInt(match[2]);
          return `${second} maand`;
        }
      }
      
      // Handle single month format: 3m -> 3 maand, 6m -> 6 maand, 12m -> 12 maand, 18m -> 18 maand, 24m -> 24 maand
      if (normalized.match(/^\d+\s*m$/i)) {
        const match = normalized.match(/^(\d+)\s*m$/i);
        if (match) {
          return `${match[1]} maand`;
        }
      }
      
      // Handle year ranges: 3/4 -> 4 jaar, 5/6 -> 6 jaar, 7/8 -> 8 jaar, 9/10 -> 10 jaar, 11/12 -> 12 jaar, 13/14 -> 14 jaar
      // Take the second number (end of range) and convert to "X jaar"
      if (normalized.match(/^\d+\/\d+$/)) {
        const match = normalized.match(/^(\d+)\/(\d+)$/);
        if (match) {
          const second = parseInt(match[2]);
          return `${second} jaar`;
        }
      }
      
      // Handle single year: 2 -> 2 jaar (for numbers without suffix)
      if (normalized.match(/^\d+$/)) {
        const num = parseInt(normalized);
        // If it's a small number (likely a year), convert to "X jaar"
        if (num >= 2 && num <= 18) {
          return `${num} jaar`;
        }
      }
      
      return sizeStr; // Return as-is if no match (e.g., S, M, L for accessories)
    };

    if (isOrderConfirmationFormat) {
      // Parse order confirmation format: ESTILO;REFERENCIA;VARIANTE;SRP;TALLAS (sizes);...;CANT.;UNIDAD;TOTAL
      // The header has "TALLAS" but actual sizes are in product name rows (rows with ESTILO but no REFERENCIA)
      // Example: line 40: ;Tilo Cap  Deep Sea Blue;;;;S;M;L;;;;;;;;;;;
      // Different products can have different sizes, so we need to extract sizes from each product name row
      
      // Find ESTILO column for product name
      const estiloIdx = headers.findIndex(h => h.toUpperCase() === 'ESTILO');
      
      // Parse data rows (skip header and empty rows)
      let currentProductName = '';
      let currentSizeColumns: { idx: number; size: string }[] = [];
      
      for (let i = headerLineIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || (line.startsWith(';') && line.split(';').filter(c => c.trim()).length <= 1)) {
          continue; // Skip empty or comment rows
        }
        
        const values = line.split(';').map(v => v.trim());
        
        // Check if this is a product name row (has ESTILO but no REFERENCIA)
        const estiloValue = estiloIdx >= 0 ? values[estiloIdx] || '' : '';
        const referenciaValue = referenciaIdx >= 0 ? values[referenciaIdx] || '' : '';
        
        if (estiloValue && !referenciaValue) {
          // This is a product name row - extract sizes from this row
          currentProductName = estiloValue;
          currentSizeColumns = [];
          
          // Find size columns by checking values between SRP and CANT positions
          for (let j = srpIdx + 1; j < cantIdx; j++) {
            const value = values[j] || '';
            // Skip empty values and header words
            if (!value || value.length === 0) continue;
            
            const valueUpper = value.toUpperCase();
            // Skip "TALLAS" and other header words
            if (valueUpper === 'TALLAS' || valueUpper === 'TALLA' || valueUpper === 'SIZE' || valueUpper === 'SIZES') {
              continue;
            }
            
            // Check if this looks like a size (S, M, L, or number with m/y suffix, or number ranges)
            if (value.match(/^[A-Z]$/i) || // Single letter: S, M, L
                value.match(/^\d+[my]$/i) || // Number with suffix: 3m, 6m, 2y, 3y
                value.match(/^\d+\/\d+[my]?$/i) || // Range: 3/6m, 2/3y
                value.match(/^\d+$/)) { // Just number: 2, 3, 4 (for years)
              currentSizeColumns.push({ idx: j, size: value });
            }
          }
          
          console.log(`📏 Product "${currentProductName}": Found ${currentSizeColumns.length} size columns: ${currentSizeColumns.map(s => `${s.size} (col ${s.idx})`).join(', ')}`);
          continue;
        }
        
        // Check if this is a data row (has REFERENCIA)
        if (!referenciaValue) {
          continue; // Skip rows without product reference
        }
        
        // Make sure we have size columns for this product
        if (currentSizeColumns.length === 0) {
          console.warn(`⚠️ No size columns found for product "${currentProductName}" - skipping data row`);
          continue;
        }
        
        const productReference = referenciaValue;
        const colorName = varianteIdx >= 0 ? values[varianteIdx] || '' : '';
        const srp = parsePrice(values[srpIdx] || '0');
        const unitPrice = parsePrice(values[unidadIdx] || '0');
        void parseInt(values[cantIdx] || '0'); // totalQuantity parsed but not used
        
        if (!productReference || !colorName || srp === 0) {
          continue; // Skip incomplete rows
        }
        
        // Create product key
        const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        if (!products[productKey]) {
          const toSentenceCase = (str: string) => {
            if (!str) return str;
            const lower = str.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
          };
          
          const formattedName = `The New Society - ${toSentenceCase(currentProductName || productReference)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;
          
          products[productKey] = {
            reference: productReference,
            name: formattedName,
            originalName: currentProductName || productReference,
            material: '',
            color: colorName,
            ecommerceDescription: formattedName,
            variants: [],
            suggestedBrand: suggestedBrand?.name,
            selectedBrand: suggestedBrand,
            publicCategories: [],
            productTags: [],
            isFavorite: false,
            isPublished: true,
          };
          
          console.log(`✅ Created product: ${formattedName} (${productReference}), SRP: €${srp.toFixed(2)}, Unit: €${unitPrice.toFixed(2)}`);
        }
        
        // Create variants for each size with quantity > 0 (use currentSizeColumns for this product)
        for (const sizeCol of currentSizeColumns) {
          const quantity = parseInt(values[sizeCol.idx] || '0');
          if (quantity > 0) {
            const dutchSize = convertSizeToDutch(sizeCol.size);
            products[productKey].variants.push({
              size: dutchSize,
              quantity: quantity,
              ean: '', // EAN not available in this format
              sku: '',
              price: unitPrice, // UNIDAD = wholesale/unit price
              rrp: srp, // SRP = Suggested Retail Price (verkoopprijs)
            });
          }
        }
      }
    } else {
      // Parse standard format: Product reference;Product name;Color name;Size name;EAN13;Quantity;Unit price;...
      for (let i = headerLineIdx + 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(v => v.trim());
        
        if (values.length < headers.length) {
          console.log(`⚠️ Skipping row ${i}: insufficient columns`);
          continue;
        }

        const productReference = values[productReferenceIdx] || '';
        const productName = values[productNameIdx] || '';
        const colorName = values[colorNameIdx] || '';
        const sizeName = values[sizeNameIdx] || '';
        const ean = values[standardEanIdx] || '';
        const sku = values[skuIdx] || '';
        const quantity = parseInt(values[quantityIdx] || '0');
        const unitPrice = parsePrice(values[unitPriceIdx] || '0');
        const composition = values[compositionIdx] || '';
        void (values[categoryIdx] || ''); // category parsed but not used
        const description = values[descriptionIdx] || '';
        
        // Skip rows without required data
        if (!productReference || !productName || !colorName || !sizeName || !ean) {
          if (productReference || productName) {
            console.log(`⚠️ Skipping row ${i}: incomplete data`);
          }
          continue;
        }
        
        // Create product key based on Product reference + Color name
        const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

        if (!products[productKey]) {
          // Format product name: "The New Society - Product name - Color"
          const toSentenceCase = (str: string) => {
            if (!str) return str;
            const lower = str.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
          };
          
          const formattedName = `The New Society - ${toSentenceCase(productName)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

          products[productKey] = {
            reference: productReference,
            name: formattedName,
            originalName: productName,
            material: composition,
            color: colorName,
            ecommerceDescription: description || formattedName,
            variants: [],
            suggestedBrand: suggestedBrand?.name,
            selectedBrand: suggestedBrand,
            publicCategories: [],
            productTags: [],
            isFavorite: false,
            isPublished: true,
          };

          console.log(`✅ Created product: ${formattedName} (${productReference})`);
        }
        
        // Convert size to Dutch format (3/6m -> 6 maand, etc.)
        const dutchSize = convertSizeToDutch(sizeName);
        
        products[productKey].variants.push({
          size: dutchSize,
          quantity: quantity,
          ean: ean,
          sku: sku,
          price: unitPrice,
          rrp: unitPrice * 2.5, // Default RRP is 2.5x unit price (can be adjusted later)
        });
      }
    }

    const productList = Object.values(products);
    console.log(`🌿 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants`);
    
    // Determine size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    // If Order CSV products already exist, enrich them with SRP prices from Order Confirmation
    if (parsedProducts.length > 0) {
      console.log(`🔄 Enriching ${parsedProducts.length} Order CSV products with SRP prices from Order Confirmation...`);
      enrichTheNewSocietyProductsWithSRP(parsedProducts, productList);
      setThenewsocietyOrderConfirmationLoaded(true);
      // NOW go to step 2 after combining both files
      setCurrentStep(2);
      alert(`✅ Order Confirmation CSV geparsed en SRP prijzen toegevoegd aan Order CSV producten!\n\n${parsedProducts.length} producten verrijkt met verkoopprijzen (SRP).\n\nJe kunt nu doorgaan naar stap 2.`);
    } else {
      // Order Confirmation uploaded but no Order CSV - this shouldn't happen due to validation
      alert('⚠️ Geen Order CSV data gevonden! Upload eerst het Order CSV bestand (met EAN13, SKU\'s, etc.).');
    }
  };

  const parseTheNewSocietyOrderCSV = (text: string) => {
    // The New Society Order CSV format parser (standard format with EAN13, SKU, etc.)
    // Format: Order id;Date;Status;Season;Brand name;...;Product reference;Color name;Size name;EAN13;SKU;Quantity;Unit price;...
    
    console.log(`🌿 Parsing The New Society Order CSV...`);
    
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      console.error('❌ Not enough rows in CSV');
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (first line)
    const headers = lines[0].split(';').map(h => h.trim());
    console.log(`🌿 Headers: ${JSON.stringify(headers.slice(0, 15))}`);
    
    // Find column indices
    const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
    const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
    const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
    const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
    const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
    const quantityIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');
    const compositionIdx = headers.findIndex(h => h.toLowerCase() === 'composition');
    const categoryIdx = headers.findIndex(h => h.toLowerCase() === 'category');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    
    // Validate required columns
    if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || sizeNameIdx === -1 || eanIdx === -1) {
      console.error('❌ Missing required headers. Found:', headers);
      alert('Ongeldig CSV-formaat. Verwachte headers: Product reference, Product name, Color name, Size name, EAN13');
      return;
    }

    const products: { [key: string]: ParsedProduct } = {};

    // Parse prices with comma as decimal separator (European format)
    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    // Convert size to Dutch format
    const convertSizeToDutch = (sizeStr: string): string => {
      if (!sizeStr) return sizeStr;
      const normalized = sizeStr.trim();
      
      if (normalized.match(/^\d+\s*y$/i)) {
        const match = normalized.match(/^(\d+)\s*y$/i);
        if (match) {
          return `${match[1]} jaar`;
        }
      }
      
      if (normalized.match(/^\d+\/\d+\s*m$/i)) {
        const match = normalized.match(/^(\d+)\/(\d+)\s*m$/i);
        if (match) {
          const second = parseInt(match[2]);
          return `${second} maand`;
        }
      }
      
      if (normalized.match(/^\d+\s*m$/i)) {
        const match = normalized.match(/^(\d+)\s*m$/i);
        if (match) {
          return `${match[1]} maand`;
        }
      }
      
      if (normalized.match(/^\d+\/\d+$/)) {
        const match = normalized.match(/^(\d+)\/(\d+)$/);
        if (match) {
          const second = parseInt(match[2]);
          return `${second} jaar`;
        }
      }
      
      if (normalized.match(/^\d+$/)) {
        const num = parseInt(normalized);
        if (num >= 2 && num <= 18) {
          return `${num} jaar`;
        }
      }
      
      return sizeStr;
    };

    // Parse standard format
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      
      if (values.length < headers.length) {
        console.log(`⚠️ Skipping row ${i}: insufficient columns`);
        continue;
      }

      const productReference = values[productReferenceIdx] || '';
      const productName = values[productNameIdx] || '';
      const colorName = values[colorNameIdx] || '';
      const sizeName = values[sizeNameIdx] || '';
      const ean = values[eanIdx] || '';
      const sku = values[skuIdx] || '';
      const quantity = parseInt(values[quantityIdx] || '0');
      const unitPrice = parsePrice(values[unitPriceIdx] || '0');
      const composition = values[compositionIdx] || '';
      void (values[categoryIdx] || ''); // category parsed but not used
      const description = values[descriptionIdx] || '';
      
      // Skip rows without required data
      if (!productReference || !productName || !colorName || !sizeName || !ean) {
        if (productReference || productName) {
          console.log(`⚠️ Skipping row ${i}: incomplete data`);
        }
        continue;
      }
      
      // Create product key based on Product reference + Color name
      const productKey = `${productReference}-${colorName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      if (!products[productKey]) {
        const toSentenceCase = (str: string) => {
          if (!str) return str;
          const lower = str.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        };
        
        const formattedName = `The New Society - ${toSentenceCase(productName)}${colorName ? ` - ${toSentenceCase(colorName)}` : ''}`;

        products[productKey] = {
          reference: productReference,
          name: formattedName,
          originalName: productName,
          material: composition,
          color: colorName,
          ecommerceDescription: description || formattedName,
          variants: [],
          suggestedBrand: undefined,
          selectedBrand: undefined,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };

        console.log(`✅ Created product: ${formattedName} (${productReference})`);
      }
      
      // Convert size to Dutch format
      const dutchSize = convertSizeToDutch(sizeName);
      
      products[productKey].variants.push({
        size: dutchSize,
        quantity: quantity,
        ean: ean,
        sku: sku,
        price: unitPrice,
        rrp: unitPrice * 2.5, // This will be overwritten by order confirmation data if available
      });
    }

    const productList = Object.values(products);
    console.log(`🌿 Parsed ${productList.length} unique products with ${productList.reduce((sum, p) => sum + p.variants.length, 0)} variants from Order CSV`);
    
    // Determine size attributes for all products
    productList.forEach(product => {
      product.sizeAttribute = determineSizeAttribute(product.variants);
    });
    
    // Auto-detect The New Society brand
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('the new society') ||
      b.name.toLowerCase().includes('thenewsociety') ||
      b.name.toLowerCase().includes('tns')
    );
    
    // Set brand for all products
    productList.forEach(product => {
      product.suggestedBrand = suggestedBrand?.name;
      product.selectedBrand = suggestedBrand;
    });
    
    // Store Order CSV products as the base (don't go to step 2 yet - wait for Order Confirmation CSV for SRP prices)
    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setThenewsocietyOrderLoaded(true);
    // DON'T setCurrentStep(2) here - wait for Order Confirmation CSV
    
    if (productList.length > 0) {
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten geparsed uit Order CSV (met EAN13, SKU's, sizes, quantities)${brandMessage}\n\n📄 Upload nu het Order Confirmation CSV bestand (alleen voor SRP/verkoopprijs) om de prijzen toe te voegen en door te gaan.`);
    } else {
      alert('⚠️ Geen producten gevonden in CSV');
    }
  };

  const enrichTheNewSocietyProductsWithSRP = (orderProducts: ParsedProduct[], confirmationProducts: ParsedProduct[]) => {
    // Enrich Order CSV products (base with all data) with SRP prices from Order Confirmation CSV
    // Order CSV is the source of truth for everything except prices
    
    // Helper function to normalize sizes for matching
    const normalizeSizeForMatching = (size: string): string => {
      if (!size) return '';
      const normalized = size.trim().toLowerCase();
      // Convert "2 jaar" back to "2y" for matching, or keep as is
      const jaarMatch = normalized.match(/^(\d+)\s*jaar$/);
      if (jaarMatch) {
        return `${jaarMatch[1]}y`;
      }
      const maandMatch = normalized.match(/^(\d+)\s*maand$/);
      if (maandMatch) {
        return `${maandMatch[1]}m`;
      }
      // For S-36, M-38, L-40 format, extract just the letter
      const sizeMatch = normalized.match(/^([a-z])\s*-\s*\d+$/);
      if (sizeMatch) {
        return sizeMatch[1];
      }
      return normalized.replace(/\s+/g, '');
    };
    
    let enrichedCount = 0;
    
    orderProducts.forEach(orderProduct => {
      const confirmationProduct = confirmationProducts.find(p => {
        // Match by reference and color (case-insensitive)
        const refMatch = p.reference.toLowerCase() === orderProduct.reference.toLowerCase();
        const colorMatch = p.color.toLowerCase() === orderProduct.color.toLowerCase();
        return refMatch && colorMatch;
      });
      
      if (confirmationProduct) {
        console.log(`✨ Adding SRP prices to ${orderProduct.reference} (${orderProduct.color}) from Order Confirmation`);
        enrichedCount++;
        
        // Create a map of confirmation variants by normalized size for faster lookup
        const confirmationVariantsBySize = new Map<string, typeof confirmationProduct.variants[0]>();
        confirmationProduct.variants.forEach(cv => {
          const normalizedSize = normalizeSizeForMatching(cv.size);
          if (!confirmationVariantsBySize.has(normalizedSize)) {
            confirmationVariantsBySize.set(normalizedSize, cv);
          }
        });
        
        // Update Order CSV variants: match by size and add SRP price from confirmation
        orderProduct.variants.forEach(orderVariant => {
          const normalizedOrderSize = normalizeSizeForMatching(orderVariant.size);
          const confirmationVariant = confirmationVariantsBySize.get(normalizedOrderSize);
          
          if (confirmationVariant) {
            // Add SRP price from Order Confirmation, keep all other data from Order CSV
            orderVariant.rrp = confirmationVariant.rrp || orderVariant.rrp;
            console.log(`  ✅ Added SRP €${confirmationVariant.rrp.toFixed(2)} to ${orderProduct.reference} size ${orderVariant.size} (normalized: ${normalizedOrderSize})`);
          } else {
            // No matching size in confirmation - use average SRP from other variants of this product
            const avgRrp = confirmationProduct.variants.length > 0 
              ? confirmationProduct.variants.reduce((sum, v) => sum + v.rrp, 0) / confirmationProduct.variants.length
              : orderVariant.rrp;
            orderVariant.rrp = avgRrp;
            console.log(`  ⚠️ No SRP match for ${orderProduct.reference} size ${orderVariant.size}, using average SRP €${avgRrp.toFixed(2)}`);
          }
        });
      } else {
        console.log(`⚠️ No Order Confirmation match found for ${orderProduct.reference} (${orderProduct.color}) - keeping calculated RRP`);
      }
    });
    
    console.log(`✅ Successfully added SRP prices to ${enrichedCount} Order CSV products from Order Confirmation`);
    
    // Keep Order CSV products as-is (they're already in parsedProducts)
    // No need to update state here as we're modifying the existing products in place
  };

  // Wyncken handlers
  const handleWynckenPdfUpload = async (file: File) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/parse-wyncken-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.products) {
        setWynckenPdfProducts(data.products);
        const hasDescriptions = wynckenDescriptions.size > 0;
        const hasBarcodes = wynckenBarcodes.size > 0;
        
        if (hasDescriptions && hasBarcodes) {
          alert(`✅ ${data.products.length} producten geparsed uit Wynken PDF\n\nAlle bestanden geladen! Je kunt nu doorgaan met verwerken.`);
        } else {
          alert(`✅ ${data.products.length} producten geparsed uit Wynken PDF\n\n${!hasDescriptions ? '💡 Tip: Upload PRODUCT DESCRIPTIONS.csv voor extra informatie (optioneel)\n' : ''}${!hasBarcodes ? '💡 Tip: Upload SS26 BARCODES.csv voor barcodes (optioneel)\n' : ''}\nJe kunt nu doorgaan met alleen de PDF data, of eerst de CSV bestanden uploaden.`);
        }
      } else {
        alert(`❌ Fout bij parsen PDF: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`❌ Fout bij uploaden PDF: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWynckenDescriptionsCsv = (text: string) => {
    console.log('🌻 Parsing Wynken PRODUCT DESCRIPTIONS CSV...');
    
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (semicolon-separated)
    const headers = lines[0].split(';').map(h => h.trim());
    
    const productIdIdx = headers.findIndex(h => h.toLowerCase() === 'product id');
    const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
    const fabricIdx = headers.findIndex(h => h.toLowerCase() === 'fabric');
    const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour');
    const descriptionIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    const sizesIdx = headers.findIndex(h => h.toLowerCase() === 'sizes');
    const textileContentIdx = headers.findIndex(h => h.toLowerCase() === 'textile content');
    const productCategory1Idx = headers.findIndex(h => h.toLowerCase() === 'product category 1');
    const wspEurIdx = headers.findIndex(h => h.toLowerCase().includes('wsp') && h.toLowerCase().includes('eur'));
    const rrpEurIdx = headers.findIndex(h => h.toLowerCase().includes('rrp') && h.toLowerCase().includes('eur'));
    const imagePathIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower === 'full size image path' || 
             lower === 'image path' || 
             (lower.includes('image') && lower.includes('path'));
    });
    
    console.log(`📸 Image Path column index: ${imagePathIdx}, header: ${imagePathIdx >= 0 ? headers[imagePathIdx] : 'NOT FOUND'}`);
    console.log(`💰 WSP (EUR) column index: ${wspEurIdx}, header: ${wspEurIdx >= 0 ? headers[wspEurIdx] : 'NOT FOUND'}`);
    console.log(`💰 RRP (EUR) column index: ${rrpEurIdx}, header: ${rrpEurIdx >= 0 ? headers[rrpEurIdx] : 'NOT FOUND'}`);

    if (productIdIdx === -1 || styleIdx === -1) {
      alert('Ongeldig CSV-formaat. Verwachte kolommen: Product ID, Style');
      return;
    }

    const descriptions = new Map<string, {
      productId: string;
      style: string;
      fabric: string;
      colour: string;
      description: string;
      sizes: string;
      textileContent: string;
      productCategory1: string;
      wspEur: number;
      rrpEur: number;
      imagePath: string;
    }>();

    const parsePrice = (str: string) => {
      if (!str) return 0;
      // Handle formats like "26,50 €", "26.50 €", "€26.50", "26,50", etc.
      // Remove currency symbols and spaces, then handle comma as decimal separator
      let cleaned = str.toString().trim();
      // Remove currency symbols
      cleaned = cleaned.replace(/[€£$]/g, '');
      // Remove spaces
      cleaned = cleaned.replace(/\s/g, '');
      // If comma is present, assume it's decimal separator (European format)
      if (cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, ''); // Remove thousand separators (dots)
        cleaned = cleaned.replace(',', '.'); // Convert comma to dot for parseFloat
      }
      return parseFloat(cleaned) || 0;
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(';').map(v => v.trim());
      const productId = values[productIdIdx] || '';
      const style = values[styleIdx] || '';
      
      if (!productId || !style) continue;

      descriptions.set(productId, {
        productId,
        style: values[styleIdx] || '',
        fabric: values[fabricIdx] || '',
        colour: values[colourIdx] || '',
        description: values[descriptionIdx] || '',
        sizes: values[sizesIdx] || '',
        textileContent: values[textileContentIdx] || '',
        productCategory1: values[productCategory1Idx] || '',
        wspEur: parsePrice(values[wspEurIdx] || '0'),
        rrpEur: parsePrice(values[rrpEurIdx] || '0'),
        imagePath: values[imagePathIdx] || '',
      });
    }

    setWynckenDescriptions(descriptions);
    console.log(`✅ Loaded ${descriptions.size} product descriptions`);
    
    // Try to combine if PDF is loaded (CSV files are optional)
    if (wynckenPdfProducts.length > 0) {
      alert(`✅ ${descriptions.size} product beschrijvingen geladen\n\nJe kunt nu doorgaan met verwerken. De beschrijvingen worden gebruikt om extra informatie toe te voegen aan de producten uit de PDF.`);
    } else {
      alert(`✅ ${descriptions.size} product beschrijvingen geladen\n\n📄 Upload nu eerst de PDF invoice (verplicht) om door te gaan.`);
    }
  };

  const handleWynckenBarcodesCsv = (text: string) => {
    console.log('🌻 Parsing Wynken BARCODES CSV...');
    
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      alert('CSV bestand is leeg of ongeldig');
      return;
    }

    // Parse header (comma-separated)
    const headers = lines[0].split(',').map(h => h.trim());
    
    const productIdIdx = headers.findIndex(h => h.toLowerCase() === 'product id');
    const styleIdx = headers.findIndex(h => h.toLowerCase() === 'style');
    const fabricIdx = headers.findIndex(h => h.toLowerCase() === 'fabric');
    const colourIdx = headers.findIndex(h => h.toLowerCase() === 'colour');
    const sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
    const barcodeIdx = headers.findIndex(h => h.toLowerCase() === 'barcode');

    if (productIdIdx === -1 || styleIdx === -1 || sizeIdx === -1 || barcodeIdx === -1) {
      alert('Ongeldig CSV-formaat. Verwachte kolommen: Product ID, Style, Size, Barcode');
      return;
    }

    const barcodes = new Map<string, {
      productId: string;
      style: string;
      fabric: string;
      colour: string;
      size: string;
      barcode: string;
    }>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim());
      const productId = values[productIdIdx] || '';
      const style = values[styleIdx] || '';
      const size = values[sizeIdx] || '';
      const barcode = values[barcodeIdx] || '';
      
      if (!productId || !style || !size || !barcode) continue;

      // Create key: productId-size
      const key = `${productId}-${size}`;
      barcodes.set(key, {
        productId,
        style: values[styleIdx] || '',
        fabric: values[fabricIdx] || '',
        colour: values[colourIdx] || '',
        size,
        barcode,
      });
    }

    setWynckenBarcodes(barcodes);
    console.log(`✅ Loaded ${barcodes.size} barcodes`);
    
    // Try to combine if PDF is loaded (CSV files are optional)
    if (wynckenPdfProducts.length > 0) {
      alert(`✅ ${barcodes.size} barcodes geladen\n\nJe kunt nu doorgaan met verwerken. De barcodes worden gebruikt om EAN codes toe te voegen aan de producten uit de PDF.`);
    } else {
      alert(`✅ ${barcodes.size} barcodes geladen\n\n📄 Upload nu eerst de PDF invoice (verplicht) om door te gaan.`);
    }
  };

  // Format Wynken product name: remove style code and convert to lowercase (except brand name)
  const formatWynkenProductName = (style: string, colour: string): string => {
    // Remove style code (e.g., WK20W170, WK20J14 - codes starting with letters and numbers)
    const removeStyleCode = (text: string): string => {
      if (!text) return '';
      // Match style codes like WK20W170, WK20J14 (2+ letters followed by numbers and more letters/numbers)
      // Pattern: starts with 2+ letters, then digits, then letters/numbers, followed by space
      const styleCodePattern = /^[A-Z]{2,}\d+[A-Z0-9]*\s+/i;
      let cleaned = text.replace(styleCodePattern, '').trim();
      
      // If pattern didn't match, try to find and remove first word if it looks like a code
      // (starts with letters, contains numbers)
      if (cleaned === text) {
        const words = text.split(' ');
        if (words.length > 0 && /^[A-Z]{2,}.*\d+.*/i.test(words[0])) {
          cleaned = words.slice(1).join(' ').trim();
        }
      }
      
      return cleaned || text; // Return original if nothing was removed
    };
    
    // Convert to lowercase (all lowercase)
    const toLowerCase = (text: string): string => {
      if (!text) return '';
      return text.toLowerCase().trim();
    };
    
    const cleanedStyle = removeStyleCode(style);
    const formattedStyle = toLowerCase(cleanedStyle);
    const formattedColour = colour ? toLowerCase(colour) : '';
    
    return `Wynken - ${formattedStyle}${formattedColour ? ` - ${formattedColour}` : ''}`;
  };

  const combineWynckenData = () => {
    console.log('🌻 Combining Wynken data...');
    
    if (wynckenPdfProducts.length === 0) {
      alert('⚠️ Upload eerst de PDF (proforma invoice)');
      return;
    }
    
    // CSV bestanden zijn nu optioneel - alleen gebruikt om extra informatie te vinden
    const hasDescriptions = wynckenDescriptions.size > 0;
    const hasBarcodes = wynckenBarcodes.size > 0;
    
    if (!hasDescriptions && !hasBarcodes) {
      const proceed = confirm('⚠️ Geen CSV bestanden geüpload.\n\nJe kunt doorgaan met alleen de PDF data, maar je mist dan:\n- Product beschrijvingen\n- Barcodes\n- Exacte maten\n\nWil je doorgaan met alleen PDF data?');
      if (!proceed) {
        return;
      }
    }

    const products: { [key: string]: ParsedProduct } = {};
    const suggestedBrand = brands.find(b => 
      b.name.toLowerCase().includes('wyncken') || b.name.toLowerCase().includes('wynken')
    );

    // Process each product from PDF (these are the products we bought)
    console.log(`🔍 Processing ${wynckenPdfProducts.length} PDF products${hasDescriptions ? ` with ${wynckenDescriptions.size} descriptions` : ' (no descriptions CSV)'}...`);
    
    for (const pdfProduct of wynckenPdfProducts) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3125',message:'PDF product before normalization',data:{style:pdfProduct.style,colour:pdfProduct.colour,rawStyle:pdfProduct.style,rawColour:pdfProduct.colour},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Normalize style and colour for matching
      const normalizeStyle = (s: string) => s.toUpperCase().trim().replace(/\s+/g, ' ');
      const normalizeColour = (c: string) => c.toUpperCase().trim().replace(/\s+/g, ' ');
      
      const pdfStyle = normalizeStyle(pdfProduct.style);
      const pdfColour = normalizeColour(pdfProduct.colour);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3131',message:'PDF product after normalization',data:{pdfStyle,pdfColour,normalizedStyle:pdfStyle,normalizedColour:pdfColour},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Find matching description by Style + Colour (only if CSV is loaded)
      let matchedDescription: {
        productId: string;
        style: string;
        fabric: string;
        colour: string;
        description: string;
        sizes: string;
        textileContent: string;
        wspEur: number;
        rrpEur: number;
      } | null = null;

      // Try exact match first (only if descriptions CSV is loaded)
      if (hasDescriptions) {
        let exactMatchAttempts = 0;
        for (const [productId, desc] of wynckenDescriptions.entries()) {
          exactMatchAttempts++;
          const descStyle = normalizeStyle(desc.style);
          const descColour = normalizeColour(desc.colour);
          
          // #region agent log
          if (exactMatchAttempts <= 3 || descStyle === pdfStyle) {
            fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3153',message:'Exact match attempt',data:{pdfStyle,pdfColour,descStyle,descColour,styleMatch:descStyle===pdfStyle,colourMatch:descColour===pdfColour,productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          }
          // #endregion
          
          if (descStyle === pdfStyle && descColour === pdfColour) {
            matchedDescription = desc;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3155',message:'Exact match found',data:{pdfStyle,pdfColour,descStyle,descColour,productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            console.log(`✅ Matched: "${pdfProduct.style}" + "${pdfProduct.colour}"`);
            break;
          }
        }
        
        // If no exact match, try partial match (style starts with PDF style or vice versa)
        if (!matchedDescription) {
          // First, find all descriptions with matching styles
          type DescriptionType = {
            productId: string;
            style: string;
            fabric: string;
            colour: string;
            description: string;
            sizes: string;
            textileContent: string;
            wspEur: number;
            rrpEur: number;
          };
          const matchingStyles: DescriptionType[] = [];
          for (const [, desc] of wynckenDescriptions.entries()) {
            const descStyle = normalizeStyle(desc.style);
            const stylesMatch = descStyle.includes(pdfStyle) || pdfStyle.includes(descStyle) || 
                               descStyle.split(' ')[0] === pdfStyle.split(' ')[0]; // Match first word (style code)
            if (stylesMatch) {
              matchingStyles.push(desc);
            }
          }
          
          // If we have matching styles, try to match by colour
          if (matchingStyles.length > 0) {
          // If PDF has no colour, only match if there's exactly one variant
          if (!pdfColour || pdfColour.trim() === '') {
            if (matchingStyles.length === 1) {
              matchedDescription = matchingStyles[0];
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3185',message:'Partial match found (no colour, single variant)',data:{pdfStyle,pdfColour,descStyle:matchingStyles[0].style,descColour:matchingStyles[0].colour,productId:matchingStyles[0].productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              console.log(`✅ Matched (no colour, single variant): "${pdfProduct.style}" -> "${matchingStyles[0].style}" + "${matchingStyles[0].colour}"`);
            } else {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3187',message:'Multiple variants found, no colour to match',data:{pdfStyle,pdfColour,matchingVariants:matchingStyles.map(d=>({style:d.style,colour:d.colour,productId:d.productId})),variantCount:matchingStyles.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              // Multiple variants but no colour - can't determine which one
              console.log(`⚠️ Multiple variants found for "${pdfProduct.style}" but no colour in PDF. Available colours: ${matchingStyles.map(d => d.colour).join(', ')}`);
            }
          } else {
            // PDF has colour, try to match by colour
            let partialMatchAttempts = 0;
            for (const desc of matchingStyles) {
              partialMatchAttempts++;
              const descStyle = normalizeStyle(desc.style);
              const descColour = normalizeColour(desc.colour);
              
              const coloursMatch = descColour === pdfColour || 
                                  descColour.includes(pdfColour) || 
                                  pdfColour.includes(descColour);
              
              // #region agent log
              if (partialMatchAttempts <= 5) {
                fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3195',message:'Partial match attempt (with colour)',data:{pdfStyle,pdfColour,descStyle,descColour,coloursMatch,colourExact:descColour===pdfColour,colourContains:descColour.includes(pdfColour)||pdfColour.includes(descColour),productId:desc.productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              }
              // #endregion
              
              if (coloursMatch) {
                matchedDescription = desc;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3200',message:'Partial match found (with colour)',data:{pdfStyle,pdfColour,descStyle,descColour,coloursMatch,productId:desc.productId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                console.log(`✅ Matched (partial): "${pdfProduct.style}" + "${pdfProduct.colour}" -> "${desc.style}" + "${desc.colour}"`);
                break;
              }
            }
          }
          }
        }
      }

      // If no match found in CSV, create product from PDF data only
      if (!matchedDescription) {
        if (hasDescriptions) {
          // #region agent log
          const availableColours = Array.from(wynckenDescriptions.values())
            .filter(d => normalizeStyle(d.style) === pdfStyle)
            .map(d => ({raw: d.colour, normalized: normalizeColour(d.colour)}))
            .slice(0, 10);
          fetch('http://127.0.0.1:7242/ingest/221d77e6-f045-4c4e-bd83-7ca2ba49545a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'product-import.tsx:3181',message:'No match found - logging available colours for same style',data:{pdfStyle,pdfColour,availableColours,availableColoursCount:availableColours.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          console.log(`⚠️ No description found in CSV for: "${pdfProduct.style}" (${pdfStyle}) + "${pdfProduct.colour}" (${pdfColour}) - using PDF data only`);
        } else {
          console.log(`ℹ️ No CSV descriptions loaded - using PDF data only for: "${pdfProduct.style}" + "${pdfProduct.colour}"`);
        }
        
        // Create product from PDF data only
        const productKey = `${pdfProduct.style}-${pdfProduct.colour}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const formattedName = formatWynkenProductName(pdfProduct.style, pdfProduct.colour);
        
        if (!products[productKey]) {
          products[productKey] = {
            reference: pdfProduct.style,
            name: formattedName,
            originalName: pdfProduct.style,
            color: pdfProduct.colour || '',
            material: pdfProduct.materialContent || '',
            ecommerceDescription: `${pdfProduct.style}${pdfProduct.colour ? ` - ${pdfProduct.colour}` : ''}`,
            variants: [],
            suggestedBrand: suggestedBrand?.name,
            selectedBrand: suggestedBrand,
            publicCategories: [],
            productTags: [],
            isFavorite: false,
            isPublished: true,
            sizeAttribute: 'MAAT Kinderen', // Default, will be determined later
            images: [],
            imagesFetched: false,
          };
        }
        
        // Add variant with quantity from PDF (no size info, so create single variant)
        // If barcodes CSV is loaded, try to find matching barcodes
        let sizes: string[] = [];
        if (hasDescriptions) {
          // Try to find sizes from any matching style (even if colour doesn't match)
          const styleMatches = Array.from(wynckenDescriptions.values())
            .filter(d => normalizeStyle(d.style) === pdfStyle);
          if (styleMatches.length > 0) {
            // Use sizes from first match
            sizes = styleMatches[0].sizes.split(',').map(s => s.trim()).filter(s => s);
          }
        }
        
        // If no sizes found, create a single variant with the total quantity
        if (sizes.length === 0) {
          sizes = ['ONE SIZE']; // Placeholder
        }
        
        for (const size of sizes) {
          let barcodeData = null;
          if (hasBarcodes && matchedDescription) {
            const matched = matchedDescription as { productId: string };
            const barcodeKey = `${matched.productId}-${size}`;
            barcodeData = wynckenBarcodes.get(barcodeKey);
          }
          
          // Simple size conversion (basic handling)
          let dutchSize = size;
          if (size.match(/^\d+M$/i)) {
            const match = size.match(/^(\d+)M$/i);
            if (match) dutchSize = `${match[1]} maand`;
          } else if (/^\d+$/.test(size)) {
            dutchSize = `${size} jaar`;
          } else if (size === 'ONE SIZE') {
            dutchSize = 'One size';
          }
          
          const variantExists = products[productKey].variants.some(v => v.size === dutchSize);
          if (!variantExists) {
            products[productKey].variants.push({
              size: dutchSize,
              quantity: pdfProduct.quantity,
              ean: barcodeData?.barcode || '',
              sku: `${pdfProduct.style}-${size}`,
              price: pdfProduct.unitPrice,
              rrp: pdfProduct.unitPrice * 2.5,
            });
          }
        }
        
        continue; // Skip to next PDF product
      }

      // Parse sizes from description (e.g., "6M,9M,12M,18M,24M")
      const sizes = matchedDescription.sizes.split(',').map(s => s.trim()).filter(s => s);
      
      // Create product key: style-colour
      const productKey = `${matchedDescription.style}-${matchedDescription.colour}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      if (!products[productKey]) {
        const formattedName = formatWynkenProductName(matchedDescription.style, matchedDescription.colour);
        
        // Determine size attribute based on Product Category 1 (no longer available in CSV)
        // Default to 'MAAT Kinderen' - can be adjusted manually if needed
        const sizeAttribute = 'MAAT Kinderen';

        // Don't use imagePath - images will be uploaded via image import system
        // Images array remains empty - use wyncken-images-import page instead
        const images: string[] = [];

        products[productKey] = {
          reference: matchedDescription.style,
          name: formattedName,
          originalName: matchedDescription.style,
          color: matchedDescription.colour,
          material: matchedDescription.textileContent,
          ecommerceDescription: matchedDescription.description,
          variants: [],
          suggestedBrand: suggestedBrand?.name,
          selectedBrand: suggestedBrand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
          sizeAttribute: sizeAttribute,
          images: images,
          imagesFetched: images.length > 0,
        };
      }

      // Determine size category (productCategory1 no longer available in CSV)
      // Default to non-baby sizes
      const isBaby = false;
      const isKids = true;
      
      // Add variants for each size
      // The PDF quantity is the total quantity, we need to distribute it across sizes
      // For now, we'll create variants with the sizes from the description
      // The actual quantity per size would need to come from the PDF if available
      for (const size of sizes) {
        // Find barcode for this product + size
        const barcodeKey = `${matchedDescription.productId}-${size}`;
        const barcodeData = wynckenBarcodes.get(barcodeKey);

        // Convert size to Dutch format
        const convertSize = (sizeStr: string, _category1: string): string => {
          void _category1; // category1 parameter kept for compatibility
          
          // Handle months: 6M -> 6 maand, 12M -> 12 maand, etc. (for BABY)
          if (sizeStr.match(/^\d+M$/i)) {
            const match = sizeStr.match(/^(\d+)M$/i);
            if (match) {
              return `${match[1]} maand`;
            }
          }
          
          // Handle single numbers: 2 -> 2 jaar, 3 -> 3 jaar, etc.
          if (/^\d+$/.test(sizeStr)) {
            const num = parseInt(sizeStr);
            if (isBaby) {
              return `${num} maand`; // For babies, assume months if just a number
            } else if (isKids) {
              return `${num} jaar`; // For kids, convert to years
            }
            return `${num} jaar`; // Default to years
          }
          
          // Handle age ranges: 2Y-6Y -> 2 jaar, etc.
          if (sizeStr.match(/^\d+Y-\d+Y$/i)) {
            const match = sizeStr.match(/^(\d+)Y-\d+Y$/i);
            return match ? `${match[1]} jaar` : sizeStr;
          }
          
          // Handle Y suffix: 2Y -> 2 jaar, 3Y -> 3 jaar, etc.
          if (sizeStr.match(/^\d+Y$/i)) {
            const match = sizeStr.match(/^(\d+)Y$/i);
            return match ? `${match[1]} jaar` : sizeStr;
          }
          
          return sizeStr;
        };

        const dutchSize = convertSize(size, ''); // productCategory1 no longer available

        // Check if variant already exists
        const variantExists = products[productKey].variants.some(v => v.size === dutchSize);
        if (!variantExists) {
          // Use WSP (EUR) for cost price (kostprijs) and RRP (EUR) for retail price (verkoopprijs)
          const costPrice = matchedDescription.wspEur > 0 ? matchedDescription.wspEur : pdfProduct.unitPrice;
          const retailPrice = matchedDescription.rrpEur > 0 ? matchedDescription.rrpEur : (costPrice * 2.5);
          
          products[productKey].variants.push({
            size: dutchSize,
            quantity: pdfProduct.quantity, // Total quantity from PDF (will need to be adjusted per size if PDF has size breakdown)
            ean: barcodeData?.barcode || '',
            sku: `${matchedDescription.style}-${size}`,
            price: costPrice, // Kostprijs = WSP (EUR)
            rrp: retailPrice, // Verkoopprijs = RRP (EUR)
          });
        }
      }
    }

    const productList = Object.values(products);
    productList.forEach(product => {
      // SizeAttribute is already set based on Product Category 1, but use determineSizeAttribute as fallback
      if (!product.sizeAttribute || product.sizeAttribute === '') {
        product.sizeAttribute = determineSizeAttribute(product.variants);
      }
    });

    setParsedProducts(productList);
    setSelectedProducts(new Set(productList.map(p => p.reference)));
    setCurrentStep(2);

    if (productList.length > 0) {
      const brandMessage = suggestedBrand 
        ? `\n✅ Merk "${suggestedBrand.name}" automatisch gedetecteerd`
        : '\n⚠️ Merk niet gevonden in Odoo - selecteer handmatig in stap 4';
      
      alert(`✅ ${productList.length} producten gecombineerd uit Wynken bestanden${brandMessage}`);
    } else {
      alert('⚠️ Geen producten gevonden na combineren');
    }
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
          isPublished: true,
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
          isPublished: true,
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

  const fetchTheNewSocietyImages = async (imageFolder: File[]) => {
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

      // Create mapping from product key (reference-color) to Template ID
      // We need to match based on the original parsed products to get reference and color
      const productKeyToTemplateId: Record<string, number> = {};
      
      for (const result of successfulProducts) {
        if (result.templateId) {
          // Find the original product to get reference and color
          const originalProduct = parsedProducts.find(p => p.reference === result.reference);
          if (originalProduct) {
            // Create product key: "S26AHB1P362-Pink Lavander Bow"
            const productKey = `${originalProduct.reference}-${originalProduct.color}`;
            productKeyToTemplateId[productKey] = result.templateId;
          }
        }
      }

      console.log(`🌿 Processing ${imageFolder.length} images...`);

      // Read and convert images
      const imagesToUpload: Array<{ base64: string; filename: string; productReference: string; colorName: string }> = [];
      
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

          // Extract product reference and color from filename
          // Format: "s26ahb1p362-pink_lavander_bow-1-3dc260.jpg"
          // Pattern: {reference_lowercase}-{color_lowercase_with_underscores}-{number}-{hash}.jpg
          const filenameWithoutExt = file.name.replace(/\.[^.]+$/, '').toLowerCase();
          
          // Match pattern: {reference}-{color}-{number}-{hash}
          const match = filenameWithoutExt.match(/^([a-z0-9]+)-(.+?)-(\d+)-[a-f0-9]+$/);
          
          if (!match) {
            console.log(`⚠️ Could not parse filename: ${file.name}`);
            continue;
          }

          const referenceLower = match[1]; // e.g., "s26ahb1p362"
          const colorLower = match[2]; // e.g., "pink_lavander_bow"
          
          // Convert reference to uppercase: "S26AHB1P362"
          const productReference = referenceLower.toUpperCase();
          
          // Convert color to title case: "Pink Lavander Bow"
          const colorName = colorLower
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          // Create product key to match with template IDs
          const productKey = `${productReference}-${colorName}`;

          if (!productKeyToTemplateId[productKey]) {
            console.log(`⚠️ No template ID found for product ${productKey}`);
            continue;
          }

          imagesToUpload.push({
            base64,
            filename: file.name,
            productReference,
            colorName,
          });

          console.log(`✅ Loaded image: ${file.name} (Reference: ${productReference}, Color: ${colorName})`);
        } catch (error) {
          console.error(`❌ Error reading file ${file.name}:`, error);
        }
      }

      if (imagesToUpload.length === 0) {
        alert('Geen geldige afbeeldingen gevonden. Zorg ervoor dat bestandsnamen het formaat hebben: s26ahb1p362-pink_lavander_bow-1-3dc260.jpg');
        setIsLoading(false);
        return;
      }

      console.log(`🌿 Uploading ${imagesToUpload.length} images...`);

      // Upload images in batches to avoid exceeding request size limits
      const BATCH_SIZE = 2; // Process 2 images per request
      const batches = [];
      
      for (let i = 0; i < imagesToUpload.length; i += BATCH_SIZE) {
        batches.push(imagesToUpload.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`📦 Split into ${batches.length} batch(es) of max ${BATCH_SIZE} images`);
      
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
        console.log(`🌿 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images (~${(batchSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        // Upload batch
        const response = await fetch('/api/thenewsociety-upload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batch,
            productKeyToTemplateId,
            odooUid: uid,
            odooPassword: password,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Batch ${batchIndex + 1} failed with status ${response.status}:`, errorText.substring(0, 200));
          // Add failed results for this batch
          for (const img of batch) {
            const existingResult = results.find(r => r.reference === img.productReference);
            if (existingResult) {
              existingResult.success = false;
              existingResult.error = `Batch ${batchIndex + 1} upload failed with status ${response.status}`;
            } else {
              results.push({
                reference: img.productReference,
                success: false,
                imagesUploaded: 0,
                error: `Batch ${batchIndex + 1} upload failed`,
              });
            }
          }
          continue;
        }

        const imageResult = await response.json();
        
        if (!imageResult.success) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, imageResult.error);
          for (const img of batch) {
            const existingResult = results.find(r => r.reference === img.productReference);
            if (existingResult) {
              existingResult.success = false;
              existingResult.error = imageResult.error || 'Unknown error';
            } else {
              results.push({
                reference: img.productReference,
                success: false,
                imagesUploaded: 0,
                error: imageResult.error || 'Unknown error',
              });
            }
          }
        } else {
          console.log(`✅ Batch ${batchIndex + 1} complete: ${imageResult.imagesUploaded || imageResult.results?.filter((r: any) => r.success).length || 0}/${batch.length} uploaded`);
          totalUploaded += imageResult.imagesUploaded || imageResult.results?.filter((r: any) => r.success).length || 0;
          
          if (imageResult.results) {
            // Group results by product reference
            const resultsByProduct: Record<string, number> = {};
            for (const result of imageResult.results) {
              if (result.success) {
                if (!resultsByProduct[result.productReference]) {
                  resultsByProduct[result.productReference] = 0;
                }
                resultsByProduct[result.productReference]++;
              }
            }
            
            // Add to results
            for (const [productReference, count] of Object.entries(resultsByProduct)) {
              const existingResult = results.find(r => r.reference === productReference);
              if (existingResult) {
                existingResult.imagesUploaded += count;
              } else {
                results.push({
                  reference: productReference,
                  success: true,
                  imagesUploaded: count,
                });
              }
            }
            
            // Add failed results
            for (const result of imageResult.results) {
              if (!result.success) {
                const existingResult = results.find(r => r.reference === result.productReference);
                if (existingResult) {
                  existingResult.success = false;
                  existingResult.error = result.error || 'Unknown error';
                } else {
                  results.push({
                    reference: result.productReference,
                    success: false,
                    imagesUploaded: 0,
                    error: result.error || 'Unknown error',
                  });
                }
              }
            }
          }
        }
      }
      
      console.log(`🎉 Total uploaded: ${totalUploaded}/${imagesToUpload.length} images`);
      
      setImageImportResults(results);
      setIsLoading(false);
      setCurrentStep(7);
      
      const successCount = results.filter(r => r.success).length;
      alert(`✅ Upload voltooid!\n${totalUploaded}/${imagesToUpload.length} images geüpload\n${successCount}/${results.length} producten succesvol`);

    } catch (error) {
      console.error('❌ Error uploading images:', error);
      alert(`❌ Error: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchJenestImages = async (imageFolder: File[]) => {
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

      // Create mapping from product key (itemNumber-color) to Template ID
      // We need to match based on the original parsed products to get itemNumber and color
      const productKeyToTemplateId: Record<string, number> = {};
      const referenceToProductKey: Record<string, string> = {};
      
      // Build mapping from parsed products
      for (const product of parsedProducts) {
        // Product key format: itemNumber-color (same as in parseJenestCSV)
        const productKey = `${product.reference}-${product.color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        referenceToProductKey[product.reference] = productKey;
      }

      // Map import results to product keys
      for (const result of successfulProducts) {
        if (result.templateId && result.reference) {
          const productKey = referenceToProductKey[result.reference];
          if (productKey) {
            productKeyToTemplateId[productKey] = result.templateId;
          }
        }
      }

      console.log(`👕 Processing ${imageFolder.length} images...`);

      // Read and convert images
      const imagesToUpload: Array<{ base64: string; filename: string; productKey: string }> = [];
      
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

          // Extract product name and color from filename
          // Format: "LIVIA TSHIRT LT FUCHSIA PINK.jpg" or "BALLOON DENIM PANTS MEDIUM WASH primary.jpg"
          // Remove extension, "primary", and trailing numbers for matching
          let filenameWithoutExt = file.name.replace(/\.[^.]+$/, '').trim();
          // Remove "primary" and trailing numbers (e.g., " 2", " 3", " 10")
          filenameWithoutExt = filenameWithoutExt.replace(/\s+primary$/i, '').replace(/\s+\d+$/, '').trim();
          
          // Normalize: uppercase and normalize spaces
          const normalizedFilename = filenameWithoutExt.toUpperCase().replace(/\s+/g, ' ').trim();
          
          // Try to match with parsed products
          let matchedProductKey: string | null = null;
          let bestMatch: { product: ParsedProduct; score: number } | null = null;
          
          for (const product of parsedProducts) {
            // Normalize product name and color for matching
            const normalizedProductName = (product.originalName || product.name).toUpperCase().trim().replace(/\s+/g, ' ');
            const normalizedColor = product.color.toUpperCase().trim().replace(/\s+/g, ' ');
            
            // Build expected pattern: "PRODUCT NAME COLOR"
            const expectedPattern = `${normalizedProductName} ${normalizedColor}`;
            
            // Calculate match score
            let score = 0;
            
            // Exact match gets highest score
            if (normalizedFilename === expectedPattern) {
              score = 100;
            } else if (normalizedFilename.startsWith(expectedPattern)) {
              score = 90; // Starts with expected pattern
            } else {
              // Check if all words from product name and color are present
              const productNameWords = normalizedProductName.split(/\s+/).filter(w => w.length > 0);
              const colorWords = normalizedColor.split(/\s+/).filter(w => w.length > 0);
              const allWords = [...productNameWords, ...colorWords];
              
              const matchingWords = allWords.filter(word => normalizedFilename.includes(word));
              score = (matchingWords.length / allWords.length) * 80; // Max 80 for partial match
            }
            
            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
              bestMatch = { product, score };
            }
          }
          
          // Use best match if score is high enough (at least 70%)
          if (bestMatch && bestMatch.score >= 70) {
            matchedProductKey = `${bestMatch.product.reference}-${bestMatch.product.color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
            console.log(`✅ Matched "${file.name}" to product "${bestMatch.product.originalName} - ${bestMatch.product.color}" (score: ${bestMatch.score.toFixed(1)})`);
          }

          if (!matchedProductKey) {
            console.log(`⚠️ Could not match image: ${file.name}`);
            continue;
          }

          if (!productKeyToTemplateId[matchedProductKey]) {
            console.log(`⚠️ No template ID found for product key ${matchedProductKey}`);
            continue;
          }

          imagesToUpload.push({
            base64,
            filename: file.name,
            productKey: matchedProductKey,
          });

          console.log(`✅ Loaded image: ${file.name} (Product key: ${matchedProductKey})`);
        } catch (error) {
          console.error(`❌ Error reading file ${file.name}:`, error);
        }
      }

      if (imagesToUpload.length === 0) {
        alert('Geen geldige afbeeldingen gevonden. Zorg ervoor dat bestandsnamen overeenkomen met Product name + Color uit de CSV.');
        setIsLoading(false);
        return;
      }

      console.log(`👕 Uploading ${imagesToUpload.length} images...`);

      // Upload images in batches to avoid exceeding request size limits
      const BATCH_SIZE = 2; // Process 2 images per request
      const batches = [];
      
      for (let i = 0; i < imagesToUpload.length; i += BATCH_SIZE) {
        batches.push(imagesToUpload.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`📦 Split into ${batches.length} batch(es) of max ${BATCH_SIZE} images`);
      
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
        console.log(`👕 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} images (~${(batchSize / 1024 / 1024).toFixed(2)}MB)...`);
        
        // Upload batch
        const response = await fetch('/api/jenest-upload-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: batch,
            productKeyToTemplateId,
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
              reference: result.productKey,
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
                reference: result.productKey,
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
          // If changing rrp (Verkoopprijs) or price (Kostprijs), apply to ALL variants of this product
          if (field === 'rrp') {
            return {
              ...p,
              variants: p.variants.map(v => ({ ...v, rrp: value as number })),
            };
          }
          if (field === 'price') {
            return {
              ...p,
              variants: p.variants.map(v => ({ ...v, price: value as number })),
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

  // Update ecommerce description for a product
  const updateProductDescription = (productRef: string, newDescription: string) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef ? { ...p, ecommerceDescription: newDescription } : p
      )
    );
  };

  // Generate AI description for a product
  const generateAIDescription = async (product: ParsedProduct) => {
    const productKey = product.reference;
    
    // Determine which prompt to use based on product's sizeAttribute
    const isVolwassenen = product.sizeAttribute === 'MAAT Volwassenen';
    const customPrompt = isVolwassenen ? customPromptVolwassenen : customPromptKinderen;
    const defaultPrompt = isVolwassenen 
      ? defaultPrompts?.volwassenen?.systemPrompt 
      : defaultPrompts?.kinderen?.systemPrompt;
    
    // Only send custom prompt if it differs from default
    const sendCustomPrompt = customPrompt !== defaultPrompt ? customPrompt : undefined;
    
    // Mark as generating
    setGeneratingDescription(prev => new Set(prev).add(productKey));
    
    try {
      const response = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            name: product.originalName || product.name,
            brand: product.selectedBrand?.name || product.suggestedBrand,
            color: product.color,
            material: product.material,
            fabricPrint: product.fabricPrint,
            description: product.ecommerceDescription,
          },
          sizeAttribute: product.sizeAttribute,
          customSystemPrompt: sendCustomPrompt,
        }),
      });

      const data = await response.json();

      if (response.ok && data.description) {
        // Update the product with the generated description
        setParsedProducts(products =>
          products.map(p =>
            p.reference === productKey 
              ? { ...p, ecommerceDescription: data.description } 
              : p
          )
        );
        console.log(`✅ AI description generated for ${product.name} (${data.promptCategory})`);
      } else {
        alert(`Fout bij genereren beschrijving: ${data.error || 'Onbekende fout'}\n${data.message || ''}`);
      }
    } catch (error) {
      console.error('Error generating description:', error);
      alert('Fout bij genereren beschrijving. Controleer de console voor details.');
    } finally {
      // Remove from generating set
      setGeneratingDescription(prev => {
        const next = new Set(prev);
        next.delete(productKey);
        return next;
      });
    }
  };

  // Generate AI descriptions for all selected products
  const generateAllDescriptions = async () => {
    const selectedProductsList = parsedProducts.filter(p => selectedProducts.has(p.reference));
    
    if (selectedProductsList.length === 0) {
      alert('Selecteer eerst producten om beschrijvingen te genereren.');
      return;
    }

    if (!confirm(`Wil je AI-beschrijvingen genereren voor ${selectedProductsList.length} producten? Dit kan even duren.`)) {
      return;
    }

    // Process products sequentially to avoid rate limiting
    for (const product of selectedProductsList) {
      await generateAIDescription(product);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    alert(`✅ Beschrijvingen gegenereerd voor ${selectedProductsList.length} producten!`);
  };

  const toggleProductFavorite = (productRef: string) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef ? { ...p, isFavorite: !p.isFavorite } : p
      )
    );
  };

  const toggleProductPublished = (productRef: string) => {
    setParsedProducts(products =>
      products.map(p =>
        p.reference === productRef ? { ...p, isPublished: !p.isPublished } : p
      )
    );
  };

  const setAllFavorites = (value: boolean) => {
    setParsedProducts(products =>
      products.map(p => ({ ...p, isFavorite: value }))
    );
  };

  const setAllPublished = (value: boolean) => {
    setParsedProducts(products =>
      products.map(p => ({ ...p, isPublished: value }))
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
              vendor: selectedVendor || 'unknown', // Include vendor for audit logging
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
      
      // Calculate summary statistics
      const summary = {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalVariantsCreated: results.reduce((sum, r) => sum + (r.variantsCreated || 0), 0),
        totalVariantsUpdated: results.reduce((sum, r) => sum + (r.variantsUpdated || 0), 0),
        vendor: selectedVendor || 'unknown',
        timestamp: new Date().toISOString(),
      };
      
      setImportResults({ success: true, results, summary });
      
      // Log to console for debugging
      console.log('📊 Import Summary:', summary);
      
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

                    <button
                      onClick={() => setSelectedVendor('tinycottons')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'tinycottons'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🎀</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Tiny Big sister</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Order export met Product name, Category, EAN13, Unit price, RRP
                      </p>
                      {selectedVendor === 'tinycottons' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('thinkingmu')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'thinkingmu'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🌿</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Thinking Mu</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        PDF factuur met EAN, product name, style code, maat, prijs
                      </p>
                      {selectedVendor === 'thinkingmu' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('indee')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'indee'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">👗</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Indee</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        CSV met style, colour, description, maat, barcode, prijs
                      </p>
                      {selectedVendor === 'indee' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('sundaycollective')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'sundaycollective'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">☀️</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">The Sunday Collective</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        PDF factuur met SKU, product name, maat, prijs (kinderkleding)
                      </p>
                      {selectedVendor === 'sundaycollective' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('goldieandace')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'goldieandace'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🌻</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Goldie and Ace</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        PDF factuur + CSV Line Sheet (product info met FIT COMMENTS & PRODUCT FEATURES)
                      </p>
                      {selectedVendor === 'goldieandace' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('jenest')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'jenest'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">👕</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Jenest</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        CSV bestand (Product description wordt gebruikt voor E-Commerce beschrijving)
                      </p>
                      {selectedVendor === 'jenest' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('wyncken')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'wyncken'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🌻</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Wynken</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        PDF Proforma + PRODUCT DESCRIPTIONS.csv + SS26 BARCODES.csv
                      </p>
                      {selectedVendor === 'wyncken' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-4">
                    {/* One More in the Family */}
                    <button
                      onClick={() => setSelectedVendor('onemore')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'onemore'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">👶</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">1+ in the family</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Order export met Product reference, Description, Color name, Size name, EAN13, Unit price
                      </p>
                      {selectedVendor === 'onemore' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => setSelectedVendor('weekendhousekids')}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'weekendhousekids'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🏠</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Weekend House Kids</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Gebruik het <strong>order-*.csv</strong> bestand (NIET export-Order-*.csv)
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Met headers: Product reference, Product name, Color name, Size name, EAN13, Unit price
                      </p>
                      {selectedVendor === 'weekendhousekids' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setSelectedVendor('thenewsociety');
                        // Reset The New Society upload states when selecting vendor
                        setThenewsocietyOrderConfirmationLoaded(false);
                        setThenewsocietyOrderLoaded(false);
                      }}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'thenewsociety'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🌿</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">The New Society</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Twee bestanden nodig: Order Confirmation (SRP) + Order CSV (EAN13, SKU's)
                      </p>
                      {selectedVendor === 'thenewsociety' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setSelectedVendor('emileetida');
                        // Reset Emile et Ida upload states when selecting vendor
                        setEmileetidaOrderLoaded(false);
                        setEmileetidaTarifLoaded(false);
                        setEmileetidaPriceMap(new Map());
                      }}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'emileetida'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🌸</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Emile et Ida</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Twee bestanden: Order CSV + TARIF CSV (voor RRP prijzen)
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Maten: 02A → 2 jaar, 03M → 3 maand
                      </p>
                      {selectedVendor === 'emileetida' && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setSelectedVendor('bobochoses');
                        // Reset Bobo Choses upload states when selecting vendor
                        setBobochosesPackingLoaded(false);
                        setBobochosesPriceLoaded(false);
                        setBobochosesPriceMap(new Map());
                        setBobochosesManualWholesale('');
                        setBobochosesManualRrp('');
                      }}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === 'bobochoses'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="text-4xl mb-3">🎪</div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Bobo Choses</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        Twee bestanden: Packing list CSV + Price PDF
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Maten: XS, S, M, L, XL (Volwassenen)
                      </p>
                      {selectedVendor === 'bobochoses' && (
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

                      {/* The New Society requires two files */}
                      {selectedVendor === 'thenewsociety' ? (
                        <div className="space-y-4">
                          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg">
                            <p className="text-sm font-semibold mb-2 text-green-900 dark:text-green-300">📊 Upload Status:</p>
                            <div className="space-y-2 text-sm">
                              <p>
                                <span className={thenewsocietyOrderLoaded ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                  Order CSV: {thenewsocietyOrderLoaded ? `✅ ${parsedProducts.length} producten geladen` : '❌ Verplicht - Upload eerst!'}
                                </span>
                              </p>
                              <p>
                                <span className={thenewsocietyOrderConfirmationLoaded ? 'text-green-600 font-semibold' : thenewsocietyOrderLoaded ? 'text-blue-600 font-semibold' : 'text-gray-600'}>
                                  Order Confirmation CSV: {thenewsocietyOrderConfirmationLoaded ? '✅ Geladen en gecombineerd' : thenewsocietyOrderLoaded ? '⏳ Klaar om te uploaden (voor SRP prijzen)' : '⏳ Wacht op Order CSV'}
                                </span>
                              </p>
                            </div>
                            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-800">
                              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">💡 Belangrijk:</p>
                              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                                <li><strong>Eerst:</strong> Upload Order CSV (met EAN13, SKU's, Product reference, sizes, quantities - ALLE import data)</li>
                                <li><strong>Dan:</strong> Upload Order Confirmation CSV (alleen voor SRP/verkoopprijs kolommen)</li>
                                <li>Het systeem combineert beide bestanden automatisch - Order CSV is de basis, Order Confirmation voegt alleen prijzen toe</li>
                              </ol>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {/* Order CSV - Required First */}
                            <div className={`border-2 ${thenewsocietyOrderLoaded ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'} rounded-lg p-6 text-center`}>
                              <div className="text-4xl mb-3">📄</div>
                              <h4 className="font-bold text-lg mb-2">
                                1️⃣ Order CSV <span className="text-red-500">*</span>
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Met EAN13, SKU, Product reference, sizes, quantities - ALLE import data
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                                Voorbeeld: "order-3116895-20260204.csv"
                              </p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="thenewsociety-order-upload"
                              />
                              <label
                                htmlFor="thenewsociety-order-upload"
                                className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                                  thenewsocietyOrderLoaded 
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-orange-600 text-white hover:bg-orange-700'
                                }`}
                              >
                                {thenewsocietyOrderLoaded ? `✅ Geladen (${parsedProducts.length} producten)` : '📄 Upload Order CSV'}
                              </label>
                            </div>
                            
                            {/* Order Confirmation CSV - Required Second */}
                            <div className={`border-2 ${thenewsocietyOrderConfirmationLoaded ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : thenewsocietyOrderLoaded ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 bg-gray-50 dark:bg-gray-800'} rounded-lg p-6 text-center`}>
                              <div className="text-4xl mb-3">📋</div>
                              <h4 className="font-bold text-lg mb-2">
                                2️⃣ Order Confirmation CSV <span className="text-red-500">*</span>
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Alleen voor SRP (verkoopprijs) kolommen
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                                Voorbeeld: "Babette - Jove BV..csv"
                              </p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                disabled={!thenewsocietyOrderLoaded}
                                className="hidden"
                                id="thenewsociety-confirmation-upload"
                              />
                              <label
                                htmlFor="thenewsociety-confirmation-upload"
                                className={`inline-block px-4 py-2 rounded font-medium ${
                                  !thenewsocietyOrderLoaded
                                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                    : thenewsocietyOrderConfirmationLoaded
                                    ? 'bg-green-600 text-white hover:bg-green-700 cursor-pointer'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                                }`}
                              >
                                {!thenewsocietyOrderLoaded 
                                  ? '⏳ Wacht op Order CSV' 
                                  : thenewsocietyOrderConfirmationLoaded
                                  ? '✅ Geladen en gecombineerd'
                                  : '📋 Upload Order Confirmation'}
                              </label>
                              {!thenewsocietyOrderLoaded && (
                                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                                  ⚠️ Upload eerst Order CSV!
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : selectedVendor === 'emileetida' ? (
                        <div className="space-y-4">
                          <div className="mb-4 p-4 bg-pink-50 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-700 rounded-lg">
                            <p className="text-sm font-semibold mb-2 text-pink-900 dark:text-pink-300">🌸 Upload Status:</p>
                            <div className="space-y-2 text-sm">
                              <p>
                                <span className={emileetidaOrderLoaded ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                  Order CSV: {emileetidaOrderLoaded ? `✅ ${parsedProducts.length} producten geladen` : '❌ Verplicht - Upload eerst!'}
                                </span>
                              </p>
                              <p>
                                <span className={emileetidaTarifLoaded ? 'text-green-600 font-semibold' : emileetidaOrderLoaded ? 'text-blue-600 font-semibold' : 'text-gray-600'}>
                                  TARIF CSV: {emileetidaTarifLoaded ? `✅ ${emileetidaPriceMap.size} prijzen geladen` : emileetidaOrderLoaded ? '⏳ Optioneel - Voor verkoopprijzen' : '⏳ Optioneel'}
                                </span>
                              </p>
                            </div>
                            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-pink-200 dark:border-pink-800">
                              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">💡 Hoe het werkt:</p>
                              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                                <li><strong>Eerst:</strong> Upload Order CSV (met Product name, EAN13, Product reference, sizes, quantities)</li>
                                <li><strong>Dan:</strong> Upload TARIF CSV om verkoopprijzen (RRP) toe te voegen via EAN/Gencod lookup</li>
                                <li>Zonder TARIF: verkoopprijs = 2.5x inkoopprijs (aanpasbaar)</li>
                              </ol>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {/* Order CSV - Required First */}
                            <div className={`border-2 ${emileetidaOrderLoaded ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'} rounded-lg p-6 text-center`}>
                              <div className="text-4xl mb-3">📄</div>
                              <h4 className="font-bold text-lg mb-2">
                                1️⃣ Order CSV <span className="text-red-500">*</span>
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Met Product name, Product reference, Color name, EAN13, Unit price
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                                Voorbeeld: "order-3087203-20260206.csv"
                              </p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="emileetida-order-upload"
                              />
                              <label
                                htmlFor="emileetida-order-upload"
                                className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                                  emileetidaOrderLoaded 
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-orange-600 text-white hover:bg-orange-700'
                                }`}
                              >
                                {emileetidaOrderLoaded ? `✅ Geladen (${parsedProducts.length} producten)` : '📄 Upload Order CSV'}
                              </label>
                            </div>
                            
                            {/* TARIF CSV - Optional */}
                            <div className={`border-2 ${emileetidaTarifLoaded ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-blue-300 bg-blue-50 dark:bg-blue-900/30'} rounded-lg p-6 text-center`}>
                              <div className="text-4xl mb-3">💰</div>
                              <h4 className="font-bold text-lg mb-2">
                                2️⃣ TARIF CSV <span className="text-gray-400">(optioneel)</span>
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Met Gencod (EAN), RRP EUR voor verkoopprijzen
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                                Voorbeeld: "TARIF WHLS RRP SS26..."
                              </p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="emileetida-tarif-upload"
                              />
                              <label
                                htmlFor="emileetida-tarif-upload"
                                className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                                  emileetidaTarifLoaded
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {emileetidaTarifLoaded 
                                  ? `✅ ${emileetidaPriceMap.size} prijzen geladen`
                                  : '💰 Upload TARIF CSV'}
                              </label>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                📝 RRP prijzen worden gekoppeld via EAN code
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : selectedVendor === 'bobochoses' ? (
                        <div className="space-y-4">
                          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700 rounded-lg">
                            <p className="text-sm font-semibold mb-2 text-purple-900 dark:text-purple-300">🎪 Upload Status:</p>
                            <div className="space-y-2 text-sm">
                              <p>
                                <span className={bobochosesPackingLoaded ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                  Packing List CSV: {bobochosesPackingLoaded ? `✅ ${parsedProducts.length} producten geladen` : '❌ Verplicht - Upload eerst!'}
                                </span>
                              </p>
                              <p>
                                <span className={bobochosesPriceLoaded ? 'text-green-600 font-semibold' : bobochosesPackingLoaded ? 'text-blue-600 font-semibold' : 'text-gray-600'}>
                                  Price PDF: {bobochosesPriceLoaded ? `✅ ${bobochosesPriceMap.size} prijzen geladen` : bobochosesPackingLoaded ? '⏳ Optioneel - Voor wholesale/RRP prijzen' : '⏳ Optioneel'}
                                </span>
                              </p>
                            </div>
                            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-purple-200 dark:border-purple-800">
                              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">💡 Hoe het werkt:</p>
                              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                                <li><strong>Eerst:</strong> Upload Packing List CSV (met REFERENCE, DESCRIPTION, COLOR, SIZE, EAN, QUANTITY)</li>
                                <li><strong>Dan:</strong> Upload Price PDF om wholesale en RRP prijzen toe te voegen via referentie lookup</li>
                                <li>Zonder Price PDF: prijzen moeten handmatig worden ingevuld</li>
                              </ol>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            {/* Packing List CSV - Required First */}
                            <div className={`border-2 ${bobochosesPackingLoaded ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'} rounded-lg p-6 text-center`}>
                              <div className="text-4xl mb-3">📄</div>
                              <h4 className="font-bold text-lg mb-2">
                                1️⃣ Packing List CSV <span className="text-red-500">*</span>
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Met BOX, REFERENCE, DESCRIPTION, COLOR, SIZE, EAN, QUANTITY
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                                Voorbeeld: &quot;Packing-list_SO25-01066-OUT0009819.csv&quot;
                              </p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="bobochoses-packing-upload"
                              />
                              <label
                                htmlFor="bobochoses-packing-upload"
                                className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                                  bobochosesPackingLoaded 
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-orange-600 text-white hover:bg-orange-700'
                                }`}
                              >
                                {bobochosesPackingLoaded ? `✅ Geladen (${parsedProducts.length} producten)` : '📄 Upload Packing List CSV'}
                              </label>
                            </div>
                            
                            {/* Price PDF - Optional */}
                            <div className={`border-2 ${bobochosesPriceLoaded ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-blue-300 bg-blue-50 dark:bg-blue-900/30'} rounded-lg p-6 text-center`}>
                              <div className="text-4xl mb-3">💰</div>
                              <h4 className="font-bold text-lg mb-2">
                                2️⃣ Price PDF <span className="text-gray-400">(optioneel)</span>
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Met REF, Wholesale price, European RRP
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                                Voorbeeld: &quot;Bobo Choses Client Portal.pdf&quot;
                              </p>
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={handleBobochosesPdfUpload}
                                className="hidden"
                                id="bobochoses-price-upload"
                              />
                              <label
                                htmlFor="bobochoses-price-upload"
                                className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                                  bobochosesPriceLoaded
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {bobochosesPriceLoaded 
                                  ? `✅ ${bobochosesPriceMap.size} prijzen geladen`
                                  : '💰 Upload Price PDF'}
                              </label>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                📝 Prijzen worden gekoppeld via REF code
                              </p>
                            </div>

                            {/* Manual Price Entry */}
                            <div className={`border-2 ${bobochosesPackingLoaded && (bobochosesManualWholesale || bobochosesManualRrp) ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'} rounded-lg p-6`}>
                              <div className="text-4xl mb-3 text-center">✏️</div>
                              <h4 className="font-bold text-lg mb-2 text-center">
                                3️⃣ Manuele Prijzen
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 text-center">
                                Vul prijzen in en pas toe op alle producten
                              </p>
                              
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Aankoopprijs (€)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={bobochosesManualWholesale}
                                    onChange={(e) => setBobochosesManualWholesale(e.target.value)}
                                    placeholder="bijv. 30.00"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Verkoopprijs / RRP (€)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={bobochosesManualRrp}
                                    onChange={(e) => setBobochosesManualRrp(e.target.value)}
                                    placeholder="bijv. 75.00"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    if (!bobochosesPackingLoaded) {
                                      alert('Upload eerst de Packing List CSV');
                                      return;
                                    }
                                    const wholesale = parseFloat(bobochosesManualWholesale) || 0;
                                    const rrp = parseFloat(bobochosesManualRrp) || 0;
                                    if (wholesale === 0 && rrp === 0) {
                                      alert('Vul minimaal een prijs in');
                                      return;
                                    }
                                    const updatedProducts = parsedProducts.map(product => ({
                                      ...product,
                                      variants: product.variants.map(variant => ({
                                        ...variant,
                                        price: wholesale || variant.price,
                                        rrp: rrp || variant.rrp,
                                      }))
                                    }));
                                    setParsedProducts(updatedProducts);
                                    alert(`✅ Prijzen toegepast op ${updatedProducts.length} producten!\n\nAankoopprijs: €${wholesale.toFixed(2)}\nVerkoopprijs: €${rrp.toFixed(2)}`);
                                  }}
                                  disabled={!bobochosesPackingLoaded}
                                  className={`w-full px-4 py-2 rounded font-medium text-sm ${
                                    bobochosesPackingLoaded
                                      ? 'bg-purple-600 text-white hover:bg-purple-700 cursor-pointer'
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  💰 Toepassen op alle producten
                                </button>
                              </div>
                            </div>
                          </div>
                          
                          {/* Per-product price editing hint */}
                          {bobochosesPackingLoaded && (
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                              <p className="text-xs text-blue-800 dark:text-blue-300">
                                💡 <strong>Tip:</strong> Je kunt ook per product prijzen aanpassen in stap 2 (Mapping) en stap 3 (Voorraad). Daar zie je alle producten en kun je individuele prijzen bewerken.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : selectedVendor === 'wyncken' ? (
                        <div className="space-y-4">
                          <div className="mb-4 p-3 bg-gray-100 rounded">
                            <p className="text-sm font-semibold mb-2">📊 Upload Status:</p>
                            <p className="text-sm">
                              <span className={wynckenPdfProducts.length > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                PDF Invoice: {wynckenPdfProducts.length > 0 ? `✅ ${wynckenPdfProducts.length} producten` : '❌ Verplicht'}
                              </span>
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              Descriptions CSV: {wynckenDescriptions.size > 0 ? `✅ ${wynckenDescriptions.size} producten (optioneel)` : '⭕ Optioneel'} | 
                              Barcodes CSV: {wynckenBarcodes.size > 0 ? `✅ ${wynckenBarcodes.size} barcodes (optioneel)` : '⭕ Optioneel'}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              💡 Tip: Upload eerst de PDF invoice. CSV bestanden zijn optioneel en worden alleen gebruikt om extra informatie (beschrijvingen, barcodes, maten) toe te voegen.
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            {/* PDF Upload - Required */}
                            <div className={`border-2 ${wynckenPdfProducts.length > 0 ? 'border-green-500 bg-green-50' : 'border-purple-500'} rounded-lg p-4 text-center`}>
                              <div className="text-3xl mb-2">📄</div>
                              <h4 className="font-bold text-sm mb-1">
                                PDF Invoice <span className="text-red-500">*</span>
                              </h4>
                              <p className="text-xs text-gray-600 mb-2">Verplicht</p>
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={handleWynckenPdfUploadHandler}
                                className="hidden"
                                id="wyncken-pdf-upload"
                              />
                              <label
                                htmlFor="wyncken-pdf-upload"
                                className={`inline-block px-3 py-1 text-xs rounded ${
                                  wynckenPdfProducts.length > 0 
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                                } cursor-pointer`}
                              >
                                {wynckenPdfProducts.length > 0 ? '✅ PDF Geladen' : 'Upload PDF'}
                              </label>
                            </div>
                            
                            {/* Descriptions CSV - Optional */}
                            <div className={`border-2 ${wynckenDescriptions.size > 0 ? 'border-green-500 bg-green-50' : 'border-blue-500'} rounded-lg p-4 text-center`}>
                              <div className="text-3xl mb-2">📋</div>
                              <h4 className="font-bold text-sm mb-1">Descriptions CSV</h4>
                              <p className="text-xs text-gray-600 mb-2">Optioneel</p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="wyncken-desc-csv-upload"
                              />
                              <label
                                htmlFor="wyncken-desc-csv-upload"
                                className={`inline-block px-3 py-1 text-xs rounded ${
                                  wynckenDescriptions.size > 0 
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                } cursor-pointer`}
                              >
                                {wynckenDescriptions.size > 0 ? '✅ CSV Geladen' : 'Upload CSV'}
                              </label>
                            </div>
                            
                            {/* Barcodes CSV - Optional */}
                            <div className={`border-2 ${wynckenBarcodes.size > 0 ? 'border-green-500 bg-green-50' : 'border-green-500'} rounded-lg p-4 text-center`}>
                              <div className="text-3xl mb-2">🏷️</div>
                              <h4 className="font-bold text-sm mb-1">Barcodes CSV</h4>
                              <p className="text-xs text-gray-600 mb-2">Optioneel</p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="wyncken-barcode-csv-upload"
                              />
                              <label
                                htmlFor="wyncken-barcode-csv-upload"
                                className={`inline-block px-3 py-1 text-xs rounded ${
                                  wynckenBarcodes.size > 0 
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-green-600 text-white hover:bg-green-700'
                                } cursor-pointer`}
                              >
                                {wynckenBarcodes.size > 0 ? '✅ CSV Geladen' : 'Upload CSV'}
                              </label>
                            </div>
                          </div>
                          
                          {/* Manual combine button - Only requires PDF */}
                          {wynckenPdfProducts.length > 0 && (
                            <div className="mt-4 text-center">
                              <button
                                onClick={() => {
                                  combineWynckenData();
                                }}
                                className="px-6 py-3 rounded font-medium transition-colors bg-green-600 text-white hover:bg-green-700"
                              >
                                ✅ Verwerk Producten & Ga Verder
                              </button>
                              {wynckenDescriptions.size === 0 && wynckenBarcodes.size === 0 && (
                                <p className="text-xs text-orange-600 mt-2">
                                  ⚠️ Geen CSV bestanden geüpload - alleen PDF data wordt gebruikt
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {/* CSV Upload - NOT for Thinking Mu */}
                        {selectedVendor !== 'thinkingmu' && (
                        <div className="border-2 border-blue-500 rounded-lg p-6 text-center">
                          <div className="text-4xl mb-3">📄</div>
                          <h3 className="font-bold text-gray-900 mb-2 text-gray-900">CSV File</h3>
                          <p className="text-sm text-gray-800 mb-4 font-medium">
                            {selectedVendor === 'armedangels' 
                              ? 'Invoice CSV with your order' 
                              : selectedVendor === 'weekendhousekids'
                              ? 'Order CSV (order-*.csv, NIET export-Order-*.csv)'
                              : 'Product data (required)'}
                          </p>
                          {selectedVendor === 'weekendhousekids' && (
                            <p className="text-xs text-orange-600 mb-2 font-medium">
                              ⚠️ Gebruik het order-*.csv bestand, niet het export-Order-*.csv bestand!
                            </p>
                          )}
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
                        )}

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

                        {/* Prijzen CSV - NOT for Armed Angels, Thinking Mu, or Wyncken */}
                        {(
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

                        {/* PDF Upload for Thinking Mu */}
                        {selectedVendor === 'thinkingmu' && (
                          <div className="border-2 border-emerald-400 dark:border-emerald-600 rounded-lg p-6 text-center">
                            <div className="text-4xl mb-3">📄</div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">PDF Factuur</h3>
                            <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Upload de Thinking Mu PDF factuur</p>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleThinkingMuPdfUpload}
                              className="hidden"
                              id="thinkingmu-pdf-upload"
                            />
                            <label
                              htmlFor="thinkingmu-pdf-upload"
                              className={`px-4 py-2 rounded cursor-pointer inline-block ${
                                parsedProducts.length > 0
                                  ? 'bg-green-600 text-white hover:bg-green-700' 
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              {isLoading ? '⏳ PDF verwerken...' : parsedProducts.length > 0 ? `✓ ${parsedProducts.length} producten` : 'Kies PDF Factuur'}
                            </label>
                            {parsedProducts.length > 0 && (
                              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                                ✅ PDF geparsed! Ga door naar de volgende stap.
                              </p>
                            )}
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                              💡 De PDF wordt automatisch geparsed voor EAN, product naam, maat en prijs
                            </p>
                          </div>
                        )}

                        {/* PDF Upload for Sunday Collective */}
                        {selectedVendor === 'sundaycollective' && (
                          <div className="border-2 border-orange-400 dark:border-orange-600 rounded-lg p-6 text-center">
                            <div className="text-4xl mb-3">☀️</div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">PDF Factuur</h3>
                            <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Upload de Sunday Collective PDF factuur</p>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={handleSundayCollectivePdfUpload}
                              className="hidden"
                              id="sundaycollective-pdf-upload"
                            />
                            <label
                              htmlFor="sundaycollective-pdf-upload"
                              className={`px-4 py-2 rounded cursor-pointer inline-block ${
                                parsedProducts.length > 0
                                  ? 'bg-green-600 text-white hover:bg-green-700' 
                                  : 'bg-orange-600 text-white hover:bg-orange-700'
                              }`}
                            >
                              {isLoading ? '⏳ PDF verwerken...' : parsedProducts.length > 0 ? `✓ ${parsedProducts.length} producten` : 'Kies PDF Factuur'}
                            </label>
                            {parsedProducts.length > 0 && (
                              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                                ✅ PDF geparsed! Ga door naar de volgende stap.
                              </p>
                            )}
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-3">
                              ⚠️ Barcodes zijn niet beschikbaar in de PDF - vul deze handmatig aan in stap 3 (Voorraad)
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              💡 De PDF wordt geparsed voor SKU, product naam, maat en prijs (kinderkleding maten)
                            </p>
                          </div>
                        )}

                        {/* CSV + PDF Upload for Goldie and Ace */}
                        {selectedVendor === 'goldieandace' && (
                          <div className="space-y-4">
                            {/* CSV Upload */}
                            <div className="border-2 border-yellow-400 dark:border-yellow-600 rounded-lg p-6 text-center">
                              <div className="text-4xl mb-3">📋</div>
                              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">1. CSV Line Sheet</h3>
                              <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Upload eerst de CSV Line Sheet met product informatie</p>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleGoldieAndAceCsvUpload}
                                className="hidden"
                                id="goldieandace-csv-upload"
                              />
                              <label
                                htmlFor="goldieandace-csv-upload"
                                className={`px-4 py-2 rounded cursor-pointer inline-block ${
                                  goldieAndAceCsvData.size > 0
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-yellow-600 text-white hover:bg-yellow-700'
                                }`}
                              >
                                {goldieAndAceCsvData.size > 0 ? `✓ ${goldieAndAceCsvData.size} producten geladen` : 'Kies CSV Line Sheet'}
                              </label>
                              {goldieAndAceCsvData.size > 0 && (
                                <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                                  ✅ CSV geladen! Upload nu de PDF factuur.
                                </p>
                              )}
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                                💡 De CSV bevat product details, barcodes, FIT COMMENTS en PRODUCT FEATURES
                              </p>
                            </div>

                            {/* PDF Upload */}
                            <div className={`border-2 rounded-lg p-6 text-center ${
                              goldieAndAceCsvData.size > 0 
                                ? 'border-yellow-400 dark:border-yellow-600' 
                                : 'border-gray-300 dark:border-gray-600 opacity-50'
                            }`}>
                              <div className="text-4xl mb-3">📄</div>
                              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">2. PDF Factuur</h3>
                              <p className="text-sm text-gray-800 dark:text-gray-300 mb-4 font-medium">Upload de PDF factuur met bestelde producten</p>
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={handleGoldieAndAcePdfUpload}
                                disabled={goldieAndAceCsvData.size === 0}
                                className="hidden"
                                id="goldieandace-pdf-upload"
                              />
                              <label
                                htmlFor="goldieandace-pdf-upload"
                                className={`px-4 py-2 rounded cursor-pointer inline-block ${
                                  goldieAndAceCsvData.size === 0
                                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                    : parsedProducts.length > 0
                                    ? 'bg-green-600 text-white hover:bg-green-700' 
                                    : 'bg-yellow-600 text-white hover:bg-yellow-700'
                                }`}
                              >
                                {isLoading ? '⏳ PDF verwerken...' : parsedProducts.length > 0 ? `✓ ${parsedProducts.length} producten` : goldieAndAceCsvData.size === 0 ? 'Wacht op CSV ⏳' : 'Kies PDF Factuur'}
                              </label>
                              {goldieAndAceCsvData.size === 0 && (
                                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                                  ⚠️ Upload eerst de CSV Line Sheet!
                                </p>
                              )}
                              {parsedProducts.length > 0 && (
                                <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                                  ✅ Producten geïmporteerd! FIT COMMENTS + PRODUCT FEATURES zijn toegevoegd aan Ecommerce Description.
                                </p>
                              )}
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                                💡 De PDF wordt gematcht met de CSV data om volledige product informatie te krijgen
                              </p>
                            </div>
                          </div>
                        )}

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
                        ⚠️ Verwacht {selectedVendor === 'thinkingmu' || selectedVendor === 'sundaycollective' || selectedVendor === 'goldieandace' ? 'PDF' : 'CSV'} Formaat voor {selectedVendor === 'ao76' ? 'Ao76' : selectedVendor === 'lenewblack' ? 'Le New Black' : selectedVendor === 'playup' ? 'Play UP' : selectedVendor === 'tinycottons' ? 'Tiny Big sister' : selectedVendor === 'armedangels' ? 'Armed Angels' : selectedVendor === 'thinkingmu' ? 'Thinking Mu' : selectedVendor === 'sundaycollective' ? 'The Sunday Collective' : selectedVendor === 'indee' ? 'Indee' : selectedVendor === 'goldieandace' ? 'Goldie and Ace' : selectedVendor === 'jenest' ? 'Jenest' : selectedVendor === 'onemore' ? '1+ in the family' : selectedVendor === 'wyncken' ? 'Wyncken' : selectedVendor === 'emileetida' ? 'Emile et Ida' : selectedVendor === 'bobochoses' ? 'Bobo Choses' : 'Flöss'}:
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
                      ) : selectedVendor === 'tinycottons' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Order id;Season;Brand name;Category;Product name;Composition;Size name;EAN13;Quantity;Unit price;RRP
3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;34;8434525598872;1;47,6;119
3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;36;8434525598889;1;47,6;119

→ Wordt: "Tiny Big sister - Alma fruits short"
→ Variant: Maat 34 (MAAT Volwassenen), EAN: 8434525598872, Prijs: €47,60, RRP: €119,00`}
                        </pre>
                      ) : selectedVendor === 'armedangels' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Table 1
Item Number;Description;Color;Size;SKU;Quantity;Price (EUR)
10012345;Denim Jacket;Blue;S;10012345-BLU-S;1;89,95

→ Wordt: "Armed Angels - Denim jacket - Blue"`}
                        </pre>
                      ) : selectedVendor === 'thinkingmu' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`PDF Factuur met tabel structuur:
CODE          | CONCEPT                              | PRICE  | UNITS | TOTAL
8435512930002 | NAVY NOCTIS KNITTED TOP WKN00266,L   | 36,00€ | 1     | 36,00€
8435512930934 | POPPY GREY JODIE SWEATSHIRT WSS00188,XS | 50,00€ | 1  | 50,00€

→ Wordt: "Thinking Mu - Navy noctis knitted top"
→ Variant: Maat L - 40, EAN: 8435512930002, Prijs: €36,00`}
                        </pre>
                      ) : selectedVendor === 'indee' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Season;Product Category 1;Product Category 2;Style;Colour;Description;Size;Barcode;Textile Content;WSP EUR;Ccy Symbol;RRP;Sales Order Quantity
SS26;SS26;DRESS;VILLAGGIO;TOMATO RED;LONG SLEEVES OVERSIZED DRESS;L;5404045609481;50% COTTON;60.00;€;€ 155.00;1
SS26;SS26;KNIT SWEATER;VIETNAM;GREEN;POLO PULLOVER WITH CONTRAST;M;5404045608842;52% VISCOSE;34.50;€;€ 89.00;1

→ Wordt: "Indee - Villaggio long sleeves oversized dress tomato red"
→ Variant: Maat L - 40, EAN: 5404045609481, Kostprijs: €60,00, RRP: €155,00`}
                        </pre>
                      ) : selectedVendor === 'sundaycollective' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`PDF Factuur met tabel structuur:
ITEM                              | SKU           | QTY | MSRP   | PRICE  | TOTAL
Avenue Shorts In Cucumber Stripe  |               |     |        |        |
Size: 2Y-3Y                       | S26W2161-GR-2 | 1   | €64,00 | €28,00 | €28,00
Size: 4Y-5Y                       | S26W2161-GR-4 | 1   | €64,00 | €28,00 | €28,00

→ Wordt: "The Sunday Collective - Avenue shorts in cucumber stripe"
→ Variant: Maat 2Y-3Y (MAAT Kinderen), SKU: S26W2161-GR-2, Prijs: €28,00
⚠️ Barcodes niet beschikbaar - handmatig aanvullen!`}
                        </pre>
                      ) : selectedVendor === 'goldieandace' ? (
                        <div className="space-y-4">
                          <div>
                            <h5 className="font-bold mb-2">CSV Line Sheet:</h5>
                            <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`CATEGORY;STYLE CODE;DESCRIPTION;COLOUR NAME;SIZE;BARCODES;RETAIL EUR;W/S EUR;FIT COMMENTS;PRODUCT FEATURES
TEES;20001GA006;OUTBACK ROO T-SHIRT;CLASSIC BLUE;2Y;9361499023965;€29,00;€11,60;TRUE TO SIZE, RELAXED FIT;"Mid weight classic tee
Iconic Australian drawn feature print
Designed in Australia"`}
                            </pre>
                          </div>
                          <div>
                            <h5 className="font-bold mb-2">PDF Factuur:</h5>
                            <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Description | Quantity | Unit Price | GST | Amount EUR
OUTBACK ROO T-SHIRT 2Y | 1.00 | 11.60 | GST Free | 11.60`}
                            </pre>
                          </div>
                          <p className="text-xs text-gray-700 mt-2">
                            → Wordt: "Goldie and Ace - Outback roo t-shirt"<br/>
                            → Variant: Maat 2 jaar (MAAT Kinderen), EAN: 9361499023965, Prijs: €11,60<br/>
                            → Ecommerce Description: FIT COMMENTS + PRODUCT FEATURES gecombineerd
                          </p>
                        </div>
                      ) : selectedVendor === 'onemore' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Order id;Date;Status;Season;Brand name;Brand sales person;Collection;Category;Product name;Product reference;Color name;Description;Composition;Fabric / print;Size family name;Size name;EAN13;SKU;Quantity;Unit price;Net amount;Pre-discount amount;Discount rate;Currency
3116535;2025-08-05 09:46:54;Confirmed;Pre-SS26;1+ in the family;Chaparal ;26s newborn & baby;Newborn;26s063;EGAS;blossom;hat;60% co 40% pes;GINGHAM SEERSUCKER;T1, T2, T3;T1;8448261015630;26s063blosT1;2;16;32,00;32,00;0;EUR
3116535;2025-08-05 09:46:54;Confirmed;Pre-SS26;1+ in the family;Chaparal ;26s newborn & baby;Newborn;26s063;EGAS;blossom;hat;60% co 40% pes;GINGHAM SEERSUCKER;T1, T2, T3;T2;8448261015647;26s063blosT2;2;16;32,00;32,00;0;EUR

→ Wordt: "1+ in the family - Hat - Blossom"
→ Variant: Maat T1 (MAAT Baby's), EAN: 8448261015630, Prijs: €16,00, RRP: €40,00 (2.5x)
→ Producten gegroepeerd op Product reference + Color name`}
                        </pre>
                      ) : selectedVendor === 'jenest' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`Order no.;Date;Currency;Drop;Total Quantity;Total price;VAT;Shipping;Handling fee;VAT Amount;Total price after VAT;Comments;Order reference;Product name;Item number;Color;Size;Collection;SKU;EAN Number;Rec retail price;Line quantity;Line unit price;Total line price;Product description;Top categories;Sub categories;HS Tariff Code;Country of origin;Composition;Wash and care
SO-1239;2025-08-07 19:49:27;EUR;SS26;333;7148,25;0;0;0;0;7148,25;;;LIVIA TSHIRT;1222;LT FUCHSIA PINK;2-3Y;SS26;1222.2-3Y.LF;8721458809046;39,95;1;16,65;16,65;This shortsleeve T-shirt is made of our softest 100% organic cotton jersey and it carries a print at back panel - Rounded collar  Wide fit Print at back panel 100% Organic cotton jersey ;;;;PT;100% ORGANIC  COTTON JERSEY;Machine wash 30 °C, no tumble dry, iron low, wash with similar colours, wash inside out

→ Wordt: "Jenest - Livia tshirt - Lt fuchsia pink"
→ Variant: Maat 2-3Y, EAN: 8721458809046, Prijs: €16,65, RRP: €39,95
→ Ecommerce Description: "Product description" veld wordt gebruikt`}
                        </pre>
                      ) : selectedVendor === 'emileetida' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`📄 ORDER CSV:
Order id;Date;Status;Season;Brand name;...;Product name;Product reference;Color name;...;Size name;EAN13;SKU;Quantity;Unit price
3087203;2025-06-28;Closed;SS26;Emile Et Ida;...;SAC A DOS IMPRIME;ADSACADOS;TULIPE;...;TU;3664547680803;ADSACADOS|TULIPE|TU;3;34,1

💰 TARIF CSV (optioneel voor RRP):
Saison;Famille;Marque;Référence;Couleur;Taille;Gencod;Désignation;WHLS EUR;RRP EUR
SS26-KID;ACCESSORIES;EMILE ET IDA;ADSACADOS;TULIPE;TU;3664547680803;SAC A DOS IMPRIME;34,1;85

→ Wordt: "Emile & Ida - Sac a dos imprime - Tulipe (adsacados)"
→ Ecommerce: "SAC A DOS IMPRIME" (Product name + Fabric/print)
→ Variant: Maat U (TU → U), Prijs: €34,10, RRP: €85,00 (via TARIF lookup)
→ Maten: 02A → 2 jaar, 06-18M → 6 - 18 maand, 02A-04A → 2 - 4 jaar, TU → U`}
                        </pre>
                      ) : selectedVendor === 'bobochoses' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`📄 PACKING LIST CSV:
BOBO CHOSES;;Nº Delivery Note;OUT0009819;;...
...header rows...
BOX;REFERENCE;DESCRIPTION;COLOR;SIZE;EAN;CUSTOMS CODE;ORIGIN COUNTRY;QUANTITY
1;B126AK001;Red patent-leather cross sandal;611;39;8445782377735;6405100000;ES;1
2;B126AD091;Summer trip jacquard cotton jumper;199;XS;8445782373034;6110209900;ES;1

💰 PRICE PDF (optioneel):
Hidden Monster Relaxed T-Shirt
REF: B226AD018
Wholesale price 30 eur
European RRP 75 eur

→ Wordt: "Bobo Choses - Red Patent-Leather Cross Sandal - Red"
→ Color code 611 → Red, 199 → Off White, 991 → Multi
→ Variant: Maat 39 (schoenen), XS/S/M/L/XL (kleding)
→ Prijzen: Via PDF lookup met REF code`}
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
                    onClick={() => setAllFavorites(true)}
                    className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    ⭐ Favoriet aan
                  </button>
                  <button
                    onClick={() => setAllFavorites(false)}
                    className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                  >
                    ☆ Favoriet uit
                  </button>
                  <button
                    onClick={() => setAllPublished(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    🌐 Gepubliceerd aan
                  </button>
                  <button
                    onClick={() => setAllPublished(false)}
                    className="px-4 py-2 bg-purple-100 text-purple-800 rounded hover:bg-purple-200"
                  >
                    🚫 Gepubliceerd uit
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
                  <button
                    onClick={generateAllDescriptions}
                    disabled={generatingDescription.size > 0}
                    className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingDescription.size > 0 ? '⏳ Bezig...' : '✨ AI Beschrijvingen'}
                  </button>
                  <button
                    onClick={() => setShowPromptModal(true)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600"
                    title="AI Prompts bekijken en bewerken"
                  >
                    📝 Prompts
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
                                    {isUnitOnlyProduct(product) ? (
                                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-medium border-purple-300 border">
                                        Geen maat (UNIT)
                                      </span>
                                    ) : (
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
                                    )}
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
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={product.isPublished}
                                    onChange={() => toggleProductPublished(product.reference)}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-xs font-medium">🌐 Gepubliceerd</span>
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
                                        value={product.sizeAttribute === 'MAAT Volwassenen' ? mapSizeToOdooFormat(variant.size) : variant.size}
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
                                      <div className="flex items-center relative group">
                                        <span className="mr-1">€</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={variant.price}
                                          onChange={(e) => updateVariantField(product.reference, idx, 'price', parseFloat(e.target.value) || 0)}
                                          className={`w-20 border dark:border-gray-600 rounded px-2 py-1 text-right text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-green-300 dark:border-green-600 ${
                                            variant.sku && pdfPrices.has(variant.sku) ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30' : ''
                                          }`}
                                          title="Wijzigen past alle varianten van dit product aan"
                                        />
                                        <span className="ml-1 text-xs text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-help" title="Update alle varianten">
                                          🔄
                                        </span>
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
                                          title="Wijzigen past alle varianten van dit product aan"
                                        />
                                        <span className="ml-1 text-xs text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-help" title="Update alle varianten">
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

                          {/* E-commerce Description Section */}
                          <div className="mt-4 border-t pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-800 dark:text-gray-300 font-medium">📝 E-commerce Beschrijving</label>
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  product.sizeAttribute === 'MAAT Volwassenen'
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                    : 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                                }`}>
                                  {product.sizeAttribute === 'MAAT Volwassenen' ? '👩 Volwassenen' : '👶 Kinderen'}
                                </span>
                              </div>
                              <button
                                onClick={() => generateAIDescription(product)}
                                disabled={generatingDescription.has(product.reference)}
                                className="px-3 py-1 text-xs bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                              >
                                {generatingDescription.has(product.reference) ? (
                                  <>⏳ Genereren...</>
                                ) : (
                                  <>✨ AI Genereren</>
                                )}
                              </button>
                            </div>
                            <textarea
                              value={product.ecommerceDescription || ''}
                              onChange={(e) => updateProductDescription(product.reference, e.target.value)}
                              placeholder="Productbeschrijving voor webshop..."
                              rows={4}
                              className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 focus:border-purple-500 focus:outline-none resize-y"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              💡 Klik op &quot;AI Genereren&quot; voor een webshoptekst. Pas de stijl aan via &quot;📝 Prompts&quot; hierboven.
                            </p>
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
                            {/* Show size attribute (Baby's/Kinderen/Tieners) and CSV category as badges */}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {product.sizeAttribute && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  product.sizeAttribute === "MAAT Baby's" 
                                    ? 'bg-pink-100 text-pink-800' 
                                    : product.sizeAttribute === 'MAAT Tieners'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {product.sizeAttribute === "MAAT Baby's" ? '👶 Baby' : 
                                   product.sizeAttribute === 'MAAT Tieners' ? '🧒 Tieners' : '👧 Kinderen'}
                                </span>
                              )}
                              {product.csvCategory && (
                                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-medium">
                                  📁 {product.csvCategory}
                                </span>
                              )}
                            </div>
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

                {/* Import Summary */}
                {importResults.summary && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <h3 className="font-bold text-gray-900 mb-3">📊 Import Samenvatting</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Leverancier</div>
                        <div className="font-bold text-gray-900">{importResults.summary.vendor}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Tijdstip</div>
                        <div className="font-bold text-gray-900">{new Date(importResults.summary.timestamp).toLocaleString('nl-NL')}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Varianten Aangemaakt</div>
                        <div className="font-bold text-gray-900">{importResults.summary.totalVariantsCreated}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Varianten Bijgewerkt</div>
                        <div className="font-bold text-gray-900">{importResults.summary.totalVariantsUpdated}</div>
                      </div>
                    </div>
                  </div>
                )}

                <h3 className="font-bold text-gray-900 mb-3">Import Details</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Product Naam</th>
                        <th className="p-2 text-left">Product ID</th>
                        <th className="p-2 text-left">Varianten</th>
                        <th className="p-2 text-left">Afbeeldingen</th>
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
                          <td className="p-2">
                            {result.success ? (
                              <>
                                {result.variantsCreated || 0} aangemaakt
                                {result.variantsUpdated ? `, ${result.variantsUpdated} bijgewerkt` : ''}
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="p-2">{result.imagesUploaded || 0}</td>
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

                {/* Image Import for 1+ in the family */}
                {selectedVendor === 'onemore' && imageImportResults.length === 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg">📸 Next Step: Upload Images</h3>
                    <p className="text-sm text-gray-700 mb-4">
                      Import successful! Now upload product images using the dedicated image upload page.
                    </p>
                    <div className="bg-white rounded-lg p-4 mb-4 border border-blue-200">
                      <p className="text-sm font-medium mb-2">📋 What you&apos;ll need:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>The same CSV you just imported</li>
                        <li>Local images from your order folder (e.g., <code className="bg-gray-100 px-1 rounded">order-3116535-images-1-66dae6</code>)</li>
                        <li>The app will automatically match them based on Product name and Color!</li>
                      </ul>
                    </div>
                    
                    <Link
                      href="/onemore-images-import"
                      className="block w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center px-6 py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 font-bold shadow-lg transition-all"
                    >
                      👶 Upload 1+ in the family Afbeeldingen →
                    </Link>
                  </div>
                )}

                {/* Image Import for Wyncken */}
                {selectedVendor === 'wyncken' && imageImportResults.length === 0 && (
                  <div className="bg-gradient-to-r from-purple-50 to-yellow-50 border-2 border-purple-300 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg">📸 Next Step: Upload Images</h3>
                    <p className="text-sm text-gray-700 mb-4">
                      Import successful! Now upload product images using the dedicated image upload page.
                    </p>
                    <div className="bg-white rounded-lg p-4 mb-4 border border-purple-200">
                      <p className="text-sm font-medium mb-2">📋 What you&apos;ll need:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>The same PRODUCT DESCRIPTIONS.csv you just imported</li>
                        <li>Local images from SS26 FLAT SHOTS folder (e.g., <code className="bg-gray-100 px-1 rounded">MW20J01-ARTISTS BLUE-2.jpg</code>)</li>
                        <li>The app will automatically match them based on Style and Colour!</li>
                      </ul>
                    </div>
                    
                    <Link
                      href="/wyncken-images-import"
                      className="block w-full bg-gradient-to-r from-purple-600 to-yellow-600 text-white text-center px-6 py-3 rounded-lg hover:from-purple-700 hover:to-yellow-700 font-bold shadow-lg transition-all"
                    >
                      🌻 Upload Wynken Afbeeldingen →
                    </Link>
                  </div>
                )}

                {/* Image Import for Weekend House Kids */}
                {selectedVendor === 'weekendhousekids' && imageImportResults.length === 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg">📸 Next Step: Upload Images</h3>
                    <p className="text-sm text-gray-700 mb-4">
                      Import successful! Now upload product images using the dedicated image upload page.
                    </p>
                    <div className="bg-white rounded-lg p-4 mb-4 border border-blue-200">
                      <p className="text-sm font-medium mb-2">📋 What you&apos;ll need:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>The same CSV you just imported</li>
                        <li>Stills (product photos) from <code className="bg-gray-100 px-1 rounded">Stills WHK SS26</code> folder (e.g., <code className="bg-gray-100 px-1 rounded">26015_1.jpg</code>)</li>
                        <li>Looks (model photos) from <code className="bg-gray-100 px-1 rounded">Looks WHK SS26</code> folder</li>
                        <li>The app will automatically match them based on Product reference!</li>
                      </ul>
                    </div>
                    
                    <Link
                      href="/weekendhousekids-images-import"
                      className="block w-full bg-gradient-to-r from-blue-600 to-green-600 text-white text-center px-6 py-3 rounded-lg hover:from-blue-700 hover:to-green-700 font-bold shadow-lg transition-all"
                    >
                      🏠 Upload Weekend House Kids Afbeeldingen →
                    </Link>
                  </div>
                )}

                {/* Image Import for Emile et Ida */}
                {selectedVendor === 'emileetida' && imageImportResults.length === 0 && (
                  <div className="bg-gradient-to-r from-pink-50 to-yellow-50 border-2 border-pink-300 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg">🌸 Next Step: Upload Images</h3>
                    <p className="text-sm text-gray-700 mb-4">
                      Import successful! Now upload product images using the dedicated image upload page.
                    </p>
                    <div className="bg-white rounded-lg p-4 mb-4 border border-pink-200">
                      <p className="text-sm font-medium mb-2">📋 What you&apos;ll need:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>Images from <code className="bg-gray-100 px-1 rounded">E26 - PHOTOS KID</code> folder</li>
                        <li>Filenames like <code className="bg-gray-100 px-1 rounded">EMILE IDA E26 AD019 AD009.jpg</code></li>
                        <li>The app will automatically match them based on AD-references!</li>
                      </ul>
                    </div>
                    
                    <Link
                      href="/emileetida-images-import"
                      className="block w-full bg-gradient-to-r from-pink-500 to-yellow-500 text-white text-center px-6 py-3 rounded-lg hover:from-pink-600 hover:to-yellow-600 font-bold shadow-lg transition-all"
                    >
                      🌸 Upload Emile et Ida Afbeeldingen →
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

                {/* Image Import for Bobo Choses */}
                {selectedVendor === 'bobochoses' && imageImportResults.length === 0 && (
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-3 text-lg">🎪 Next Step: Upload Images</h3>
                    <p className="text-sm text-gray-700 mb-4">
                      Import successful! Now upload product images using the dedicated image upload page.
                    </p>
                    <div className="bg-white rounded-lg p-4 mb-4 border border-yellow-200">
                      <p className="text-sm font-medium mb-2">📋 What you&apos;ll need:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>Images from <code className="bg-gray-100 px-1 rounded">PRODUCT PICTURES WOMAN SS26</code> folder</li>
                        <li>Filenames like <code className="bg-gray-100 px-1 rounded">B126AD001_1.jpg</code></li>
                        <li>The app will automatically match them based on product references!</li>
                      </ul>
                    </div>
                    
                    <Link
                      href="/bobochoses-images-import"
                      className="block w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-center px-6 py-3 rounded-lg hover:from-yellow-600 hover:to-orange-600 font-bold shadow-lg transition-all"
                    >
                      🎪 Upload Bobo Choses Afbeeldingen →
                    </Link>
                  </div>
                )}

                {/* Image Import for The New Society */}
                {selectedVendor === 'thenewsociety' && imageImportResults.length === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded p-6 mb-6">
                    <h3 className="font-bold text-green-900 text-gray-900 mb-3">🌿 Afbeeldingen Importeren (Optioneel)</h3>
                    <p className="text-sm text-green-800 mb-4">
                      Upload afbeeldingen van je The New Society order folder voor de succesvol geïmporteerde producten.
                    </p>
                    <div className="bg-white rounded p-4 mb-4">
                      <p className="text-sm font-medium mb-2">📝 Vereisten:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>Bestandsnamen moeten het formaat hebben: s26ahb1p362-pink_lavander_bow-1-3dc260.jpg</li>
                        <li>Format: {`{reference_lowercase}-{color_lowercase_with_underscores}-{image_number}-{hash}.jpg`}</li>
                        <li>Producten met Template IDs (automatisch van bovenstaande import)</li>
                        <li>Ondersteunde formaten: JPG, JPEG, PNG</li>
                      </ul>
                    </div>

                    <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center mb-4">
                      <div className="text-4xl mb-3">📁</div>
                      <h4 className="font-bold text-green-900 text-gray-900 mb-2">Selecteer Afbeeldingen</h4>
                      <p className="text-sm text-green-700 mb-4">Klik om meerdere afbeeldingen uit je The New Society order folder te selecteren</p>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const files = Array.from(e.target.files);
                            console.log(`📁 Selected ${files.length} images`);
                            
                            // Group and show summary
                            const productRefs = new Set(
                              files.map(f => {
                                const match = f.name.toLowerCase().match(/^([a-z0-9]+)-/);
                                return match ? match[1].toUpperCase() : null;
                              }).filter(Boolean)
                            );
                            
                            if (productRefs.size === 0) {
                              alert('⚠️ Geen geldige afbeeldingen gevonden. Zorg ervoor dat bestandsnamen het formaat hebben: s26ahb1p362-pink_lavander_bow-1-3dc260.jpg');
                              return;
                            }

                            alert(`✅ ${files.length} afbeeldingen geselecteerd voor ${productRefs.size} producten\n\nKlik op "Upload Images" om te beginnen`);
                            
                            // Start upload
                            fetchTheNewSocietyImages(files);
                          }
                        }}
                        className="hidden"
                        id="thenewsociety-images-upload"
                      />
                      <label
                        htmlFor="thenewsociety-images-upload"
                        className="bg-green-600 text-white px-6 py-3 rounded cursor-pointer hover:bg-green-700 font-bold inline-block"
                      >
                        📁 Selecteer Afbeeldingen
                      </label>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-800">
                      <p><strong>💡 Tip:</strong> Je kunt alle afbeeldingen van je The New Society order in een keer selecteren. Het systeem matcher ze automatisch op Product reference en Color name.</p>
                      <p className="mt-2"><strong>ℹ️ Bestandsnaam formaat:</strong> s26ahb1p362-pink_lavander_bow-1-3dc260.jpg</p>
                      <p className="mt-1"><strong>Voorbeeld:</strong> s26ahb1p362-pink_lavander_bow-1-3dc260.jpg → Reference: S26AHB1P362, Color: Pink Lavander Bow, Image: 1</p>
                    </div>
                  </div>
                )}

                {/* Image Import for Jenest */}
                {selectedVendor === 'jenest' && imageImportResults.length === 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-6 mb-6">
                    <h3 className="font-bold text-blue-900 text-gray-900 mb-3">👕 Afbeeldingen Importeren (Optioneel)</h3>
                    <p className="text-sm text-blue-800 mb-4">
                      Upload afbeeldingen van je Jenest order folder voor de succesvol geïmporteerde producten.
                    </p>
                    <div className="bg-white rounded p-4 mb-4">
                      <p className="text-sm font-medium mb-2">📝 Vereisten:</p>
                      <ul className="text-sm text-gray-700 list-disc ml-5 space-y-1">
                        <li>Bestandsnamen moeten Product name + Color bevatten (bijv. LIVIA TSHIRT LT FUCHSIA PINK.jpg)</li>
                        <li>Producten met Template IDs (automatisch van bovenstaande import)</li>
                        <li>Ondersteunde formaten: JPG, JPEG, PNG</li>
                        <li>Primary image: eindigt op "primary.jpg" of heeft geen nummer</li>
                        <li>Extra images: eindigt op " 2.jpg", " 3.jpg", etc.</li>
                      </ul>
                    </div>

                    <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center mb-4">
                      <div className="text-4xl mb-3">📁</div>
                      <h4 className="font-bold text-blue-900 text-gray-900 mb-2">Selecteer Afbeeldingen</h4>
                      <p className="text-sm text-blue-700 mb-4">Klik om meerdere afbeeldingen uit je Jenest order folder te selecteren</p>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const files = Array.from(e.target.files);
                            console.log(`📁 Selected ${files.length} images`);
                            
                            // Show summary
                            alert(`✅ ${files.length} afbeeldingen geselecteerd\n\nHet systeem zal automatisch proberen te matchen met geïmporteerde producten op basis van Product name + Color.`);
                            
                            // Start upload
                            fetchJenestImages(files);
                          }
                        }}
                        className="hidden"
                        id="jenest-images-upload"
                      />
                      <label
                        htmlFor="jenest-images-upload"
                        className="bg-blue-600 text-white px-6 py-3 rounded cursor-pointer hover:bg-blue-700 font-bold inline-block"
                      >
                        📁 Selecteer Afbeeldingen
                      </label>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-800">
                      <p><strong>💡 Tip:</strong> Je kunt alle afbeeldingen van je Jenest order in een keer selecteren. Het systeem matcher ze automatisch op Product name + Color.</p>
                      <p className="mt-2"><strong>ℹ️ Bestandsnaam voorbeelden:</strong></p>
                      <ul className="list-disc ml-5 mt-1 space-y-1">
                        <li>LIVIA TSHIRT LT FUCHSIA PINK.jpg (primary)</li>
                        <li>LIVIA TSHIRT LT FUCHSIA PINK 2.jpg (extra)</li>
                        <li>BALLOON DENIM PANTS MEDIUM WASH primary.jpg (primary)</li>
                        <li>BALLOON DENIM PANTS MEDIUM WASH 2.jpg (extra)</li>
                      </ul>
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
                      // Reset The New Society upload states
                      setThenewsocietyOrderConfirmationLoaded(false);
                      setThenewsocietyOrderLoaded(false);
                      // Reset Emile et Ida upload states
                      setEmileetidaOrderLoaded(false);
                      setEmileetidaTarifLoaded(false);
                      setEmileetidaPriceMap(new Map());
                      // Reset Bobo Choses upload states
                      setBobochosesPackingLoaded(false);
                      setBobochosesPriceLoaded(false);
                      setBobochosesPriceMap(new Map());
                      setBobochosesManualWholesale('');
                      setBobochosesManualRrp('');
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
                  ) : selectedVendor === 'onemore' ? (
                    <Link
                      href="/onemore-images-import"
                      className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                    >
                      👶 Upload 1+ in the family Afbeeldingen
                    </Link>
                  ) : selectedVendor === 'wyncken' ? (
                    <Link
                      href="/wyncken-images-import"
                      className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                    >
                      🌻 Upload Wynken Afbeeldingen
                    </Link>
                  ) : selectedVendor === 'weekendhousekids' ? (
                    <>
                      <Link
                        href="/weekendhousekids-images-import"
                        className="ml-3 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-block"
                      >
                        🏠 Upload Weekend House Kids Afbeeldingen
                      </Link>
                      <Link
                        href="/weekendhousekids-price-update"
                        className="ml-3 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 inline-block"
                      >
                        💰 Weekend House Kids Prijs Update
                      </Link>
                    </>
                  ) : selectedVendor === 'thenewsociety' ? (
                    <>
                      <Link
                        href="/product-images-import"
                        className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                      >
                        📸 Upload Afbeeldingen
                      </Link>
                      <Link
                        href="/thenewsociety-price-update"
                        className="ml-3 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 inline-block"
                      >
                        💰 The New Society Prijs Update
                      </Link>
                    </>
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
                        website_published: apiPreviewData.product.isPublished,
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

      {/* AI Prompt Editor Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">📝 AI Prompt Editor</h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="text-white hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Category Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setPromptCategory('kinderen')}
                  className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                    promptCategory === 'kinderen'
                      ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-b-2 border-pink-500'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  👶 Baby&apos;s, Kinderen &amp; Tieners
                </button>
                <button
                  onClick={() => setPromptCategory('volwassenen')}
                  className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                    promptCategory === 'volwassenen'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-b-2 border-purple-500'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  👩 Volwassenen
                </button>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>ℹ️ Info:</strong> Deze prompt wordt gebruikt als systeem-instructie voor de AI.
                  De prompt bepaalt de stijl, toon en structuur van de gegenereerde productbeschrijvingen.
                  <br /><br />
                  <strong>Gebruikt voor:</strong>{' '}
                  {promptCategory === 'kinderen' 
                    ? 'MAAT Baby\'s, MAAT Kinderen, MAAT Tieners'
                    : 'MAAT Volwassenen'
                  }
                </p>
              </div>

              {/* Prompt Editor */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  System Prompt {promptCategory === 'kinderen' ? '(Kinderen)' : '(Volwassenen)'}:
                </label>
                <textarea
                  value={promptCategory === 'kinderen' ? customPromptKinderen : customPromptVolwassenen}
                  onChange={(e) => {
                    if (promptCategory === 'kinderen') {
                      setCustomPromptKinderen(e.target.value);
                    } else {
                      setCustomPromptVolwassenen(e.target.value);
                    }
                  }}
                  rows={15}
                  className="w-full border dark:border-gray-600 rounded-lg px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                  placeholder="Voer hier de AI systeem prompt in..."
                />
              </div>

              {/* Reset Button */}
              <div className="flex justify-between items-center">
                <button
                  onClick={() => {
                    if (defaultPrompts) {
                      if (promptCategory === 'kinderen') {
                        setCustomPromptKinderen(defaultPrompts.kinderen.systemPrompt);
                      } else {
                        setCustomPromptVolwassenen(defaultPrompts.volwassenen.systemPrompt);
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline"
                >
                  🔄 Reset naar standaard
                </button>
                
                {/* Status indicator */}
                <div className="text-sm">
                  {promptCategory === 'kinderen' ? (
                    customPromptKinderen !== defaultPrompts?.kinderen?.systemPrompt ? (
                      <span className="text-orange-600 dark:text-orange-400">⚠️ Aangepaste prompt</span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">✓ Standaard prompt</span>
                    )
                  ) : (
                    customPromptVolwassenen !== defaultPrompts?.volwassenen?.systemPrompt ? (
                      <span className="text-orange-600 dark:text-orange-400">⚠️ Aangepaste prompt</span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">✓ Standaard prompt</span>
                    )
                  )}
                </div>
              </div>

              {/* Example Output Preview */}
              <div className="mt-6 border-t dark:border-gray-700 pt-4">
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">💡 Voorbeeld output structuur:</h4>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
                  {promptCategory === 'kinderen' ? (
                    <>
                      <p className="mb-2">Dit schattige jurkje is perfect voor je kleine meid.</p>
                      <p className="mb-2">• Zachte katoenmix voor optimaal comfort</p>
                      <p className="mb-2">• Speelse bloemenprint</p>
                      <p className="mb-2">• Gemakkelijk aan- en uit te trekken</p>
                      <p className="text-gray-500 dark:text-gray-400 italic">Materiaal: 100% biologisch katoen</p>
                    </>
                  ) : (
                    <>
                      <p className="mb-2">Deze elegante blouse combineert stijl met duurzaamheid.</p>
                      <p className="mb-2 font-medium">Pasvorm: Regular fit</p>
                      <p className="mb-2">• Tijdloos ontwerp</p>
                      <p className="mb-2">• Veelzijdig te combineren</p>
                      <p className="mb-2">• Duurzaam geproduceerd</p>
                      <p className="text-gray-500 dark:text-gray-400 italic">Materiaal: TENCEL™ lyocell</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
              <button
                onClick={() => setShowPromptModal(false)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

