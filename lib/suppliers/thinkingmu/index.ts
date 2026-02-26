import { determineSizeAttribute, mapSizeToOdooFormat, parseEuroPrice, toSentenceCase } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, EnrichmentResult, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

interface ThinkingMuPdfItem {
  barcode: string;
  name: string;
  styleCode: string;
  size: string;
  quantity: number;
  price: number;
  total: number;
}

interface CsvEnrichment {
  styleName: string;
  color: string;
  material: string;
  rrp: number;
  wholesale: number;
}

// Module-level caches so data is available regardless of upload order
let csvEnrichmentCache: Map<string, CsvEnrichment> | null = null;
let pdfItemsCache: ThinkingMuPdfItem[] | null = null;
let lastContext: ParseContext | null = null;

function isJoorOrderCSV(text: string): boolean {
  return text.includes('Sugg. Retail') || text.includes('Thinking MU');
}

function parseJoorCSV(text: string): Map<string, CsvEnrichment> {
  const map = new Map<string, CsvEnrichment>();
  const lines = text.split('\n');

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Style Name') && lines[i].includes('Style Number')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return map;

  const headers = lines[headerIdx].split(';');
  const colIdx = (name: string) => headers.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()));

  const iStyleName = colIdx('Style Name');
  const iStyleNumber = colIdx('Style Number');
  const iColor = colIdx('Color');
  const iMaterials = colIdx('Materials');
  const iRRP = colIdx('Sugg. Retail');
  const iWholesale = colIdx('WholeSale');

  if (iStyleNumber === -1) return map;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const styleNumber = cols[iStyleNumber]?.trim();
    if (!styleNumber || styleNumber.length < 3) continue;
    if (cols.join('').includes('Total:') || cols.join('').includes('Subtotal:')) break;

    map.set(styleNumber.toUpperCase(), {
      styleName: cols[iStyleName]?.trim() || '',
      color: cols[iColor]?.trim() || '',
      material: cols[iMaterials]?.trim() || '',
      rrp: iRRP !== -1 ? parseEuroPrice(cols[iRRP]) : 0,
      wholesale: iWholesale !== -1 ? parseEuroPrice(cols[iWholesale]) : 0,
    });
  }

  return map;
}

function buildProducts(
  pdfItems: ThinkingMuPdfItem[],
  enrichMap: Map<string, CsvEnrichment> | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('thinking', 'mu');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfItems) {
    const csvData = enrichMap?.get(item.styleCode.toUpperCase());
    const productKey = `${item.styleCode}-${item.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const formattedName = toSentenceCase(item.name);

    if (!products.has(productKey)) {
      const material = csvData?.material || '';
      products.set(productKey, {
        reference: item.styleCode,
        name: `Thinking Mu - ${formattedName}`,
        originalName: formattedName,
        color: csvData?.color || '',
        material,
        ecommerceDescription: material || undefined,
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        sizeAttribute: 'MAAT Kinderen',
      });
    }

    const product = products.get(productKey)!;
    const mappedSize = mapSizeToOdooFormat(item.size);
    const rrp = csvData?.rrp || item.price * 2.5;

    product.variants.push({
      size: mappedSize,
      ean: item.barcode,
      sku: `${item.styleCode}-${item.size}`,
      quantity: item.quantity,
      price: item.price,
      rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const csvText = files['order_csv'] as string;
  if (csvText) {
    csvEnrichmentCache = parseJoorCSV(csvText);
  }

  // If PDF was already processed, rebuild products with CSV enrichment
  if (pdfItemsCache && csvEnrichmentCache) {
    return buildProducts(pdfItemsCache, csvEnrichmentCache, lastContext || context);
  }

  return [];
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as ThinkingMuPdfItem[];
  if (pdfProducts.length === 0) {
    return { products: [], message: 'No products found in PDF' };
  }

  pdfItemsCache = pdfProducts;
  lastContext = context;

  const productList = buildProducts(pdfProducts, csvEnrichmentCache, context);

  const enrichedCount = csvEnrichmentCache ? productList.filter(p => p.material).length : 0;
  const message = csvEnrichmentCache
    ? `${productList.length} producten uit PDF, ${enrichedCount} verrijkt met CSV (materiaal + verkoopprijs).`
    : `${productList.length} producten uit PDF. Upload JOOR CSV voor verkoopprijzen en materialen.`;

  return { products: productList, message };
}

const thinkingMuPlugin: SupplierPlugin = {
  id: 'thinkingmu',
  displayName: 'Thinking Mu',
  brandName: 'Thinking Mu',
  fileInputs: [
    { id: 'pdf_invoice', label: 'Thinking Mu Factuur PDF', accept: '.pdf', required: true, type: 'pdf' },
    { id: 'order_csv', label: 'JOOR Order CSV (optioneel - verkoopprijs + materiaal)', accept: '.csv', required: false, type: 'csv' },
  ],
  fileDetection: [
    {
      fileInputId: 'order_csv',
      detect: (text) => isJoorOrderCSV(text),
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-thinkingmu-pdf',
  parse,
  processPdfResults,
  imageMatching: {
    strategy: 'reference',
    extractReference: (filename: string) => {
      const match = filename.match(/^([a-z]{3}\d{5})/i);
      return match ? match[1].toUpperCase() : null;
    },
  },
  imageUpload: {
    enabled: true,
    instructions: 'Upload afbeeldingen uit de TMU_product mappen. Bestandsnamen beginnen met de style code (bijv. wts00497).',
    exampleFilenames: ['wts00497-1-1.jpg', 'wts00497-2.jpg', 'wtp00256_0-9.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^([a-z]{3}\d{5})/i);
      return match ? match[1].toUpperCase() : null;
    },
    mapFilename: (filename: string, reference: string) => {
      if (/-1-1\./i.test(filename)) return `${reference} - Main.jpg`;
      const extraMatch = filename.match(/[-_](\d+)[-_.]/);
      const extraNum = extraMatch ? parseInt(extraMatch[1]) : 0;
      return `${reference} - Extra ${extraNum}.jpg`;
    },
  },
};

export default thinkingMuPlugin;
