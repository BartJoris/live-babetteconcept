import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { getSupplier, getAllSuppliers, createParseContext } from '@/lib/suppliers';
import type { SupplierFiles } from '@/lib/suppliers/types';

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

type VendorType = string | null;

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

// Convert size format to Dutch format (matching Odoo attribute values)
// Odoo valid values: MAAT Baby's: 0,1,3,6,9,12,18,24,36,48 maand
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
  // Flöss Type values
  'DRESS': ['Jurken'],
  'SKIRT': ['Rokken'],
  'BLOUSE': ['Blouses', 'Tops', 'Hemden'],
  'SHIRT': ['Hemden', 'Tops', 'Blouses'],
  'SWEATER': ['Sweaters', 'Truien'],
  'JACKET': ['Jassen', 'Vesten'],
  'PANTS': ['Broeken'],
  'LEGGINGS': ['Leggings', 'Broeken'],
  'ONESIE': ['Pakjes', 'Bodysuits'],
  'SET': ['Sets', 'Pakjes'],
  'SOCKS': ['Sokken', 'Accessoires'],
  'BUCKET HAT': ['Hoeden', 'Accessoires'],
  'SUN HAT': ['Hoeden', 'Accessoires'],
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
  
  // Generic image manager state
  const [imagePool, setImagePool] = useState<Array<{
    id: string;
    dataUrl: string;
    filename: string;
    file: File;
    assignedReference: string;
    order: number;
  }>>([]);
  const imageIdCounter = useRef(0);

  // Generic supplier file state for the plugin system
  const [supplierFiles, setSupplierFiles] = useState<Record<string, string>>({});
  const [supplierFileStatus, setSupplierFileStatus] = useState<Record<string, boolean>>({});

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
    
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const vendor = urlParams.get('vendor');
      const withImages = urlParams.get('withImages');
      const smartUpload = urlParams.get('smartUpload');
      
      // Check for matched images from image matcher
      if (vendor === 'playup' && withImages === 'true') {
        const matchedData = sessionStorage.getItem('playup_matched_images');
        if (matchedData) {
          try {
            const data = JSON.parse(matchedData);
            console.log('📸 Loading matched images from Image Matcher...');
            setSelectedVendor('playup');
            loadMatchedProducts(data);
            sessionStorage.removeItem('playup_matched_images');
          } catch (error) {
            console.error('Error loading matched images:', error);
          }
        }
      }

      // Check for smart upload data
      if (vendor && smartUpload === 'true') {
        const storedSupplier = sessionStorage.getItem('smart_upload_supplier');
        const storedFiles = sessionStorage.getItem('smart_upload_files');
        const storedProducts = sessionStorage.getItem('smart_upload_products');

        if (storedSupplier) {
          try {
            setSelectedVendor(storedSupplier);

            // Option 1: Pre-parsed products from smart upload (e.g. PDF was already parsed)
            if (storedProducts) {
              const products = JSON.parse(storedProducts) as ParsedProduct[];
              console.log(`🧠 Smart Upload: Loading ${products.length} pre-parsed products for ${storedSupplier}`);
              setParsedProducts(products);
              setSelectedProducts(new Set(products.map(p => p.reference)));
              setCurrentStep(2);

              // Mark all file inputs as loaded
              const plugin = getSupplier(storedSupplier);
              if (plugin) {
                const statusMap: Record<string, boolean> = {};
                plugin.fileInputs.forEach(fi => { statusMap[fi.id] = true; });
                setSupplierFileStatus(statusMap);
              }
            }

            // Option 2: CSV file contents that need parsing
            if (storedFiles) {
              const fileMap = JSON.parse(storedFiles) as Record<string, string>;
              const csvFiles: Record<string, string> = {};
              for (const [key, value] of Object.entries(fileMap)) {
                if (!key.startsWith('__pdf_')) {
                  csvFiles[key] = value;
                }
              }

              if (Object.keys(csvFiles).length > 0) {
                setSupplierFiles(csvFiles);

                // Only parse CSVs if we don't already have pre-parsed products
                if (!storedProducts) {
                  const plugin = getSupplier(storedSupplier);
                  if (plugin) {
                    console.log(`🧠 Smart Upload: Parsing ${Object.keys(csvFiles).length} CSV(s) for ${storedSupplier}`);
                    const ctx = createParseContext(brands.length > 0 ? brands : [], storedSupplier);
                    const products = plugin.parse(csvFiles, ctx);
                    if (products.length > 0) {
                      setParsedProducts(products);
                      setSelectedProducts(new Set(products.map(p => p.reference)));
                      setCurrentStep(2);

                      const statusMap: Record<string, boolean> = {};
                      for (const key of Object.keys(csvFiles)) { statusMap[key] = true; }
                      setSupplierFileStatus(statusMap);
                    }
                  }
                }
              }
            }

            sessionStorage.removeItem('smart_upload_supplier');
            sessionStorage.removeItem('smart_upload_files');
            sessionStorage.removeItem('smart_upload_products');
          } catch (error) {
            console.error('Error loading smart upload data:', error);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, fileInputId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so same file can be selected again
    if (e.target) {
      e.target.value = '';
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!selectedVendor) return;

      const plugin = getSupplier(selectedVendor);
      if (!plugin) {
        console.warn(`No plugin found for vendor: ${selectedVendor}`);
        return;
      }

      const context = createParseContext(brands, selectedVendor);

      let targetFileInputId = fileInputId || 'main_csv';

      if (!fileInputId && plugin.fileDetection) {
        for (const rule of plugin.fileDetection) {
          if (rule.detect(text, file.name)) {
            if (rule.requiresExistingProducts && parsedProducts.length === 0) {
              alert(rule.orderError || 'Upload the required files first.');
              return;
            }
            targetFileInputId = rule.fileInputId;
            break;
          }
        }
      }

      const updatedFiles = { ...supplierFiles, [targetFileInputId]: text };
      setSupplierFiles(updatedFiles);
      setSupplierFileStatus(prev => ({ ...prev, [targetFileInputId]: true }));

      try {
        const products = plugin.parse(updatedFiles as SupplierFiles, context);
        if (products.length > 0) {
          setParsedProducts(products);
          setSelectedProducts(new Set(products.map(p => p.reference)));
          setCurrentStep(2);
        } else if (targetFileInputId !== 'main_csv') {
          const reparse = plugin.parse(updatedFiles as SupplierFiles, context);
          if (reparse.length > 0) {
            setParsedProducts(reparse);
            setSelectedProducts(new Set(reparse.map(p => p.reference)));
          }
        }
      } catch (err) {
        console.error('Parse error:', err);
        alert(`Fout bij parsen: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileInputId: string) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVendor) return;

    const plugin = getSupplier(selectedVendor);
    if (!plugin?.pdfParseEndpoint) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch(plugin.pdfParseEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && plugin.processPdfResults) {
        const context = createParseContext(brands, selectedVendor);
        const result = plugin.processPdfResults(data, parsedProducts, context);

        if (result.products.length > 0) {
          setParsedProducts(result.products);
          setSelectedProducts(new Set(result.products.map(p => p.reference)));
        }

        setSupplierFileStatus(prev => ({ ...prev, [fileInputId]: true }));

        if (result.message) {
          alert(result.message);
        }
      } else {
        alert(`Fout bij parsen PDF: ${data.error || 'Onbekende fout'}`);
      }
    } catch (error) {
      alert(`Fout bij uploaden PDF: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
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
      const imageMap = new Map<string, string[]>();
      data.matchedProducts.forEach(mp => {
        const key = `${mp.article}_${mp.color}`;
        imageMap.set(key, mp.images);
      });

      const productMap = new Map<string, ParsedProduct>();

      data.csvProducts.forEach(csvProduct => {
        const key = `${csvProduct.article}_${csvProduct.color}`;
        
        if (!productMap.has(key)) {
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
      
      const withImages = products.filter(p => p.images && p.images.length > 0).length;
      const totalImages = products.reduce((sum, p) => sum + (p.images?.length || 0), 0);
      
      alert(`✅ Loaded ${products.length} products from Image Matcher\n📸 ${withImages} products with images\n🖼️ ${totalImages} total images`);
      
      setCurrentStep(1.5);
      
      console.log(`✅ Loaded ${products.length} products with ${totalImages} images`);
    } catch (error) {
      console.error('Error loading matched products:', error);
      alert('Error loading matched products. Please try again.');
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
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                📦 Product Import Wizard
              </h1>
              <p className="text-gray-800 dark:text-gray-300">
                Import producten van leveranciers in bulk met validatie en preview
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/smart-upload"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm whitespace-nowrap"
              >
                Smart Upload
              </Link>
              <Link
                href="/image-upload"
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 text-sm whitespace-nowrap"
              >
                Afbeeldingen
              </Link>
              <Link
                href="/supplier-onboarding"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 text-sm whitespace-nowrap"
              >
                + Nieuwe Leverancier
              </Link>
            </div>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {getAllSuppliers().map((plugin) => (
                    <button
                      key={plugin.id}
                      onClick={() => {
                        setSelectedVendor(plugin.id);
                        setSupplierFiles({});
                        setSupplierFileStatus({});
                      }}
                      className={`border-2 rounded-lg p-6 text-center transition-all ${
                        selectedVendor === plugin.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">{plugin.displayName}</h3>
                      <p className="text-sm text-gray-800 dark:text-gray-300">
                        {plugin.fileInputs.map(fi => fi.label).join(' + ')}
                      </p>
                      {selectedVendor === plugin.id && (
                        <div className="mt-3 text-green-600 font-bold">✓ Geselecteerd</div>
                      )}
                    </button>
                  ))}
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

                      {/* Generic file inputs from plugin */}
                      {(() => {
                        const plugin = selectedVendor ? getSupplier(selectedVendor) : null;
                        if (!plugin) return null;

                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {plugin.fileInputs.map((fi) => (
                                <div
                                  key={fi.id}
                                  className={`border-2 ${
                                    supplierFileStatus[fi.id]
                                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                                      : fi.required
                                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'
                                      : 'border-gray-300 dark:border-gray-600'
                                  } rounded-lg p-6 text-center`}
                                >
                                  <div className="text-4xl mb-3">
                                    {fi.type === 'pdf' ? '📑' : fi.type === 'xlsx' ? '📊' : '📄'}
                                  </div>
                                  <h4 className="font-bold text-lg mb-2 text-gray-900 dark:text-gray-100">
                                    {fi.label}
                                    {fi.required && <span className="text-red-500 ml-1">*</span>}
                                  </h4>
                                  <input
                                    type="file"
                                    accept={fi.accept}
                                    onChange={(e) => fi.type === 'pdf'
                                      ? handlePdfUpload(e, fi.id)
                                      : handleFileUpload(e, fi.id)
                                    }
                                    className="hidden"
                                    id={`file-upload-${fi.id}`}
                                  />
                                  <label
                                    htmlFor={`file-upload-${fi.id}`}
                                    className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                                      supplierFileStatus[fi.id]
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    {supplierFileStatus[fi.id] ? '✅ Geladen' : `Upload ${fi.type.toUpperCase()}`}
                                  </label>
                                </div>
                              ))}
                            </div>

                            {/* Go to next step button */}
                            {parsedProducts.length > 0 && (
                              <div className="flex justify-end mt-4">
                                <button
                                  onClick={() => setCurrentStep(2)}
                                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                                >
                                  Ga verder met {parsedProducts.length} producten →
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Format Preview */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <h4 className="font-bold text-yellow-900 text-gray-900 mb-2">
                        ⚠️ Verwacht {selectedVendor === 'thinkingmu' || selectedVendor === 'sundaycollective' || selectedVendor === 'goldieandace' ? 'PDF' : 'CSV'} Formaat voor {selectedVendor === 'ao76' ? 'Ao76' : selectedVendor === 'lenewblack' ? 'Le New Black' : selectedVendor === 'playup' ? 'Play UP' : selectedVendor === 'tinycottons' ? 'Tiny Big sister' : selectedVendor === 'armedangels' ? 'Armed Angels' : selectedVendor === 'thinkingmu' ? 'Thinking Mu' : selectedVendor === 'sundaycollective' ? 'The Sunday Collective' : selectedVendor === 'indee' ? 'Indee' : selectedVendor === 'goldieandace' ? 'Goldie and Ace' : selectedVendor === 'jenest' ? 'Jenest' : selectedVendor === 'onemore' ? '1+ in the family' : selectedVendor === 'wyncken' ? 'Wyncken' : selectedVendor === 'emileetida' ? 'Emile et Ida' : selectedVendor === 'bobochoses' ? 'Bobo Choses' : selectedVendor === 'minirodini' ? 'Mini Rodini' : selectedVendor === 'favoritepeople' ? 'Favorite People' : selectedVendor === 'mipounet' ? 'Mipounet' : 'Flöss'}:
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
                      ) : selectedVendor === 'minirodini' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`ID;Art. no.;Brand;Product Name;Display Name;Variant Name;Comment;Prepack;Variant no.;Size Chart;Size;Size no.;EAN;Quantity;Unit Price;Original Unit Price;Total;Weight;Category;...;Wholesale price - EUR;RRP - EUR
7641362;11000335;MINI RODINI;Panther sp sweatshirt;Panther sp sweatshirt - Chapter 1;Green;;;75;DOUBLE SIZE CLOTHES;92/98;92/98;7332754714678;1;22;22;22;0.195 kg;SWEATSHIRTS/CARDIGANS;...;22;55

→ Wordt: "Mini Rodini - Panther sp sweatshirt - Green (11000335)"
→ Variant: Maat 3 jaar (92/98 → 3 jaar, MAAT Kinderen), EAN: 7332754714678, Prijs: €22,00, RRP: €55,00
→ Maten: 92/98 → 3 jaar, 104/110 → 5 jaar, 128/134 → 9 jaar, 140/146 → 11 jaar
→ Producten gegroepeerd op Art. no. + Variant Name`}
                        </pre>
                      ) : selectedVendor === 'favoritepeople' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`SKU;QTY;WHL PRICE;RETAIL PRICE;EAN CODE
SS26NAPOLIGIRLSHORTS24MFP;1; 26,00 € ;65,00 €;05600850526269
SS26NAPOLIGIRLSHORTS3YFP;1; 26,00 € ;65,00 €;05600850523510
SS26PUGLIABABYTSHIRT24MFP;1; 14,00 € ;40,00 €;05600850526320
SS26POSITANOBAGTUFP;1; 23,20 € ;58,00 €;05600850524432

→ Wordt: "Favorite People - Napoli Girl Shorts"
→ SKU parsing: SS26 + NAPOLIGIRLSHORTS + 24M + FP
→ Maten: 24M → 24 maand, 3Y → 3 jaar, TU → U (geen maat)
→ Originele SKU opgeslagen in interne notitie`}
                        </pre>
                      ) : selectedVendor === 'mipounet' ? (
                        <pre className="text-xs bg-white p-3 rounded overflow-x-auto text-gray-900 border border-gray-200">
{`"Order id";"Date";"Status";"Season";"Brand name";...;"Category";"Product name";"Product reference";"Color name";"Composition";"Fabric / print";"Size name";"Quantity";"Unit price";...
"3088059";"2025-06-29";"Invoicing";"SS26";"MIPOUNET";...;"T-Shirt";"LES EFANTS T-SHIRT";"1131.04";"ORGANIC COTTON JERSEY (BLUE) - SS26";"95% COTTON / 5% ELASTANE";"ORGANIC COTTON JERSEY";"2Y";"1";"16";...

→ Wordt: "Mipounet - Les Efants T-Shirt" (ref: 1131.04, kleur: BLUE)
→ Maten: 2Y → 2 jaar, 10Y → 10 jaar, S (2Y-6Y) → S, 0 → U
→ Afbeeldingen: MV26.1131.JER002.04_FRONT.jpg → auto-match op 1131.04`}
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
                                          className="w-20 border dark:border-gray-600 rounded px-2 py-1 text-right text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-green-300 dark:border-green-600"
                                          title="Wijzigen past alle varianten van dit product aan"
                                        />
                                        <span className="ml-1 text-xs text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-help" title="Update alle varianten">
                                          🔄
                                        </span>
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

                {/* Generic Image Upload Section */}
                {imageImportResults.length === 0 && (() => {
                  const plugin = selectedVendor ? getSupplier(selectedVendor) : null;
                  const imgConfig = plugin?.imageUpload;
                  if (!imgConfig?.enabled) return null;

                  // Suppliers with dedicated pages get a link
                  if (imgConfig.dedicatedPageUrl) {
                    return (
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-6 mb-6">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-lg">📸 Afbeeldingen Uploaden</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{imgConfig.instructions}</p>
                        {imgConfig.exampleFilenames.length > 0 && (
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mb-4 border border-blue-200 dark:border-blue-700">
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Voorbeeld bestandsnamen:</p>
                            {imgConfig.exampleFilenames.map((fn, i) => (
                              <code key={i} className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded block mt-1">{fn}</code>
                            ))}
                          </div>
                        )}
                        <Link href={imgConfig.dedicatedPageUrl}
                          className="block w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white text-center px-6 py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 font-bold shadow-lg transition-all">
                          {imgConfig.dedicatedPageLabel || 'Upload Afbeeldingen'} →
                        </Link>
                      </div>
                    );
                  }

                  // Inline image upload with preview and management
                  const successfulRefs = importResults?.results?.filter(r => r.success && r.templateId) || [];
                  const refToTemplateId: Record<string, number> = {};
                  for (const r of successfulRefs) {
                    if (r.templateId) refToTemplateId[r.reference] = r.templateId;
                  }

                  // Group images by assigned product reference
                  const imagesByRef = new Map<string, typeof imagePool>();
                  const unassigned: typeof imagePool = [];
                  for (const img of imagePool) {
                    if (img.assignedReference) {
                      const existing = imagesByRef.get(img.assignedReference) || [];
                      existing.push(img);
                      imagesByRef.set(img.assignedReference, existing);
                    } else {
                      unassigned.push(img);
                    }
                  }

                  // Sort images within each group by order
                  for (const [, imgs] of imagesByRef) {
                    imgs.sort((a, b) => a.order - b.order);
                  }

                  const handleImageAdd = async (files: FileList | File[]) => {
                    const newImages: typeof imagePool = [];
                    for (const file of Array.from(files)) {
                      if (!/\.(jpg|jpeg|png|webp)$/i.test(file.name)) continue;
                      const dataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                      });

                      let assignedReference = '';
                      if (imgConfig.extractReference) {
                        const ref = imgConfig.extractReference(file.name);
                        if (ref) {
                          // Try exact match first, then case-insensitive partial
                          const exactMatch = successfulRefs.find(r => r.reference === ref);
                          if (exactMatch) {
                            assignedReference = exactMatch.reference;
                          } else {
                            const partialMatch = successfulRefs.find(r =>
                              r.reference.toLowerCase().includes(ref.toLowerCase()) ||
                              ref.toLowerCase().includes(r.reference.toLowerCase())
                            );
                            if (partialMatch) assignedReference = partialMatch.reference;
                          }
                        }
                      }

                      newImages.push({
                        id: `img-${++imageIdCounter.current}`,
                        dataUrl,
                        filename: file.name,
                        file,
                        assignedReference,
                        order: imagesByRef.get(assignedReference)?.length || 0,
                      });
                    }
                    setImagePool(prev => [...prev, ...newImages]);
                  };

                  const removeImage = (id: string) => {
                    setImagePool(prev => prev.filter(img => img.id !== id));
                  };

                  const assignImage = (imageId: string, reference: string) => {
                    setImagePool(prev => prev.map(img =>
                      img.id === imageId ? { ...img, assignedReference: reference, order: 999 } : img
                    ));
                  };

                  const moveImage = (imageId: string, direction: 'up' | 'down') => {
                    setImagePool(prev => {
                      const img = prev.find(i => i.id === imageId);
                      if (!img || !img.assignedReference) return prev;
                      const group = prev
                        .filter(i => i.assignedReference === img.assignedReference)
                        .sort((a, b) => a.order - b.order);
                      const idx = group.findIndex(i => i.id === imageId);
                      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
                      if (swapIdx < 0 || swapIdx >= group.length) return prev;

                      const swapId = group[swapIdx].id;
                      const imgOrder = img.order;
                      const swapOrder = group[swapIdx].order;
                      return prev.map(i => {
                        if (i.id === imageId) return { ...i, order: swapOrder };
                        if (i.id === swapId) return { ...i, order: imgOrder };
                        return i;
                      });
                    });
                  };

                  const uploadAllImages = async () => {
                    const assigned = imagePool.filter(img => img.assignedReference && refToTemplateId[img.assignedReference]);
                    if (assigned.length === 0) {
                      alert('Geen afbeeldingen toegewezen aan geïmporteerde producten.');
                      return;
                    }

                    setIsLoading(true);
                    const results: Array<{ reference: string; success: boolean; imagesUploaded: number; error?: string }> = [];

                    try {
                      const { uid, password } = await getCredentials();
                      if (!uid || !password) { alert('Geen Odoo credentials.'); setIsLoading(false); return; }

                      // Group by reference
                      const byRef = new Map<string, typeof imagePool>();
                      for (const img of assigned) {
                        const existing = byRef.get(img.assignedReference) || [];
                        existing.push(img);
                        byRef.set(img.assignedReference, existing);
                      }

                      for (const [reference, images] of byRef) {
                        const sorted = [...images].sort((a, b) => a.order - b.order);
                        const imagesToUpload = [];

                        for (const img of sorted) {
                          const base64 = img.dataUrl.split(',')[1];
                          const mappedName = imgConfig.mapFilename
                            ? imgConfig.mapFilename(img.filename, reference)
                            : img.filename;
                          imagesToUpload.push({ base64, filename: mappedName, styleNo: reference });
                        }

                        try {
                          const response = await fetch('/api/floss-upload-images', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              images: imagesToUpload,
                              styleNoToTemplateId: refToTemplateId,
                              odooUid: uid,
                              odooPassword: password,
                            }),
                          });
                          const result = await response.json();
                          results.push({
                            reference,
                            success: result.success !== false,
                            imagesUploaded: result.imagesUploaded || sorted.length,
                          });
                        } catch (err) {
                          results.push({ reference, success: false, imagesUploaded: 0, error: String(err) });
                        }
                      }

                      setImageImportResults(results);
                    } catch (err) {
                      alert(`Fout: ${err}`);
                    } finally {
                      setIsLoading(false);
                    }
                  };

                  return (
                    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 mb-6">
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-lg">📸 Afbeeldingen Uploaden</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{imgConfig.instructions}</p>
                      {imgConfig.exampleFilenames.length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                          Voorbeelden: {imgConfig.exampleFilenames.map((fn, i) => (
                            <code key={i} className="bg-gray-100 dark:bg-gray-700 px-1 rounded mx-1">{fn}</code>
                          ))}
                        </p>
                      )}

                      {/* Upload buttons */}
                      <div className="flex gap-3 mb-4">
                        <div>
                          <input type="file" multiple accept="image/*"
                            onChange={(e) => e.target.files && handleImageAdd(e.target.files)}
                            className="hidden" id="generic-images-upload" />
                          <label htmlFor="generic-images-upload"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 font-medium inline-block">
                            🖼️ Selecteer Bestanden
                          </label>
                        </div>
                        <div>
                          <input type="file"
                            {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                            onChange={(e) => e.target.files && handleImageAdd(e.target.files)}
                            className="hidden" id="generic-images-folder" />
                          <label htmlFor="generic-images-folder"
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 font-medium inline-block">
                            📁 Selecteer Map
                          </label>
                        </div>
                        {imagePool.length > 0 && (
                          <button onClick={() => setImagePool([])}
                            className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium ml-auto">
                            Wis alles
                          </button>
                        )}
                      </div>

                      {imagePool.length > 0 && (
                        <>
                          {/* Summary */}
                          <div className="flex gap-4 text-sm mb-4">
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">
                              {imagePool.length} afbeeldingen
                            </span>
                            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-full">
                              {imagePool.filter(i => i.assignedReference).length} toegewezen
                            </span>
                            {unassigned.length > 0 && (
                              <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full">
                                {unassigned.length} niet toegewezen
                              </span>
                            )}
                          </div>

                          {/* Assigned images grouped by product */}
                          {Array.from(imagesByRef.entries()).map(([ref, imgs]) => {
                            const product = importResults?.results?.find(r => r.reference === ref);
                            const sorted = [...imgs].sort((a, b) => a.order - b.order);
                            return (
                              <div key={ref} className="mb-4 border dark:border-gray-600 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 flex items-center justify-between">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {product?.name || ref}
                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({sorted.length} afbeeldingen)</span>
                                  </span>
                                </div>
                                <div className="p-3 flex gap-2 flex-wrap">
                                  {sorted.map((img, idx) => (
                                    <div key={img.id} className="relative group w-28 flex-shrink-0">
                                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                                      </div>
                                      {idx === 0 && (
                                        <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                          HOOFD
                                        </span>
                                      )}
                                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
                                      {/* Controls overlay */}
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                                        <button onClick={() => moveImage(img.id, 'up')} disabled={idx === 0}
                                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100" title="Naar links">&larr;</button>
                                        <button onClick={() => moveImage(img.id, 'down')} disabled={idx === sorted.length - 1}
                                          className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-sm disabled:opacity-30 hover:bg-gray-100" title="Naar rechts">&rarr;</button>
                                        <button onClick={() => removeImage(img.id)}
                                          className="w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600" title="Verwijderen">&times;</button>
                                      </div>
                                    </div>
                                  ))}
                                  {/* Add more button */}
                                  <label className="w-28 aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex-shrink-0">
                                    <input type="file" multiple accept="image/*" className="hidden"
                                      onChange={async (e) => {
                                        if (!e.target.files) return;
                                        const newImgs: typeof imagePool = [];
                                        for (const file of Array.from(e.target.files)) {
                                          const dataUrl = await new Promise<string>((resolve) => {
                                            const reader = new FileReader();
                                            reader.onload = () => resolve(reader.result as string);
                                            reader.readAsDataURL(file);
                                          });
                                          newImgs.push({
                                            id: `img-${++imageIdCounter.current}`,
                                            dataUrl, filename: file.name, file,
                                            assignedReference: ref,
                                            order: sorted.length + newImgs.length,
                                          });
                                        }
                                        setImagePool(prev => [...prev, ...newImgs]);
                                        e.target.value = '';
                                      }}
                                    />
                                    <span className="text-2xl text-gray-400">+</span>
                                  </label>
                                </div>
                              </div>
                            );
                          })}

                          {/* Unassigned images */}
                          {unassigned.length > 0 && (
                            <div className="mb-4 border border-orange-300 dark:border-orange-600 rounded-lg overflow-hidden">
                              <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-2">
                                <span className="font-medium text-sm text-orange-800 dark:text-orange-200">
                                  Niet toegewezen ({unassigned.length})
                                </span>
                              </div>
                              <div className="p-3 flex gap-2 flex-wrap">
                                {unassigned.map(img => (
                                  <div key={img.id} className="relative group w-28 flex-shrink-0">
                                    <div className="aspect-square rounded-lg overflow-hidden border-2 border-orange-200 dark:border-orange-600 bg-gray-100 dark:bg-gray-700">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-cover" />
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-1">{img.filename}</p>
                                    <div className="mt-1">
                                      <select
                                        value=""
                                        onChange={(e) => e.target.value && assignImage(img.id, e.target.value)}
                                        className="w-full text-[10px] border dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                      >
                                        <option value="">Toewijzen aan...</option>
                                        {successfulRefs.map(r => (
                                          <option key={r.reference} value={r.reference}>{r.name || r.reference}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <button onClick={() => removeImage(img.id)}
                                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Upload button */}
                          <button onClick={uploadAllImages} disabled={isLoading || imagePool.filter(i => i.assignedReference).length === 0}
                            className={`w-full py-3 rounded-lg font-bold text-lg ${
                              isLoading || imagePool.filter(i => i.assignedReference).length === 0
                                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}>
                            {isLoading ? 'Uploaden...' : `Upload ${imagePool.filter(i => i.assignedReference).length} afbeeldingen naar Odoo`}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}


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
                      setSupplierFiles({});
                      setSupplierFileStatus({});
                    }}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    🔄 Nieuwe Import
                  </button>
                  
                  <Link
                    href={`/image-upload${selectedVendor ? `?vendor=${selectedVendor}` : ''}`}
                    className="ml-3 px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block"
                  >
                    📸 Afbeeldingen Uploaden
                  </Link>
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

