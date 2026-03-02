import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute, mapSizeToOdooFormat } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

/**
 * Claude & Co CSV: flat ;-delimited, one row per variant.
 * Title;SIZE;SKU NUMBER;Product Code;RRP EU;BARCODE;COUNTRY OF ORGIN;HS CODES;COMPOSITION
 * Grouped by Product Code (CC552, CC529, etc.)
 *
 * PDF Invoice: provides wholesale prices and ordered quantities per SKU.
 */

interface CsvVariant {
  title: string;
  size: string;
  sku: string;
  productCode: string;
  rrp: number;
  barcode: string;
  composition: string;
}

interface InvoiceItem {
  skuCode: string;
  itemName: string;
  size: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

let invoiceCache: InvoiceItem[] | null = null;
let csvVariantsCache: CsvVariant[] | null = null;
let lastContext: ParseContext | null = null;

function convertCCSize(size: string): string {
  if (!size) return size;
  const s = size.trim();
  if (/^(XXS|XS|S|M|L|XL|XXL)$/i.test(s)) return mapSizeToOdooFormat(s);
  return convertSize(s);
}

function parseCatalogCSV(text: string): CsvVariant[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const variants: CsvVariant[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const title = cols[0]?.trim();
    if (!title) continue;

    variants.push({
      title,
      size: cols[1]?.trim() || '',
      sku: cols[2]?.trim() || '',
      productCode: cols[3]?.trim() || '',
      rrp: parseEuroPrice(cols[4]?.trim() || '0'),
      barcode: cols[5]?.trim() || '',
      composition: cols[8]?.trim() || '',
    });
  }

  return variants;
}

function buildProducts(
  csvVariants: CsvVariant[],
  invoiceItems: InvoiceItem[] | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('claude', 'co');
  const products = new Map<string, ParsedProduct>();

  const invoiceBySku = new Map<string, InvoiceItem>();
  const orderedSkus = new Set<string>();
  if (invoiceItems) {
    for (const item of invoiceItems) {
      invoiceBySku.set(item.skuCode, item);
      orderedSkus.add(item.skuCode);
    }
  }

  for (const v of csvVariants) {
    const productKey = v.productCode || v.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // If invoice is loaded, skip variants that weren't ordered
    if (invoiceItems && !orderedSkus.has(v.sku)) continue;

    const invoice = invoiceBySku.get(v.sku);
    const wholesalePrice = invoice?.unitPrice || Math.round(v.rrp / 2.5 * 100) / 100;
    const quantity = invoice?.quantity || (invoiceItems ? 0 : 1);

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: v.productCode || productKey,
        name: `Claude & Co - ${toSentenceCase(v.title)}`,
        originalName: v.title,
        material: v.composition,
        color: '',
        ecommerceDescription: v.composition
          ? `${toSentenceCase(v.title)}\n\n${v.composition}`
          : toSentenceCase(v.title),
        variants: [],
        suggestedBrand: suggestedBrand?.name,
        selectedBrand: suggestedBrand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(productKey)!;
    product.variants.push({
      size: convertCCSize(v.size),
      ean: v.barcode,
      sku: v.sku,
      quantity,
      price: wholesalePrice,
      rrp: v.rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

function isClaudeCoCSV(text: string): boolean {
  const first300 = text.substring(0, 300);
  return first300.includes('Product Code') && first300.includes('RRP EU') && first300.includes('BARCODE');
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const csvText = files['main_csv'] as string;
  if (csvText) {
    csvVariantsCache = parseCatalogCSV(csvText);
    lastContext = context;
  }

  if (csvVariantsCache && csvVariantsCache.length > 0) {
    return buildProducts(csvVariantsCache, invoiceCache, lastContext || context);
  }

  return [];
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const pdfItems = (pdfData.products || []) as InvoiceItem[];
  if (pdfItems.length === 0) {
    return { products: existingProducts, message: 'Geen items gevonden in de Claude & Co factuur.' };
  }

  invoiceCache = pdfItems;
  lastContext = context;

  if (csvVariantsCache && csvVariantsCache.length > 0) {
    const products = buildProducts(csvVariantsCache, pdfItems, context);
    const totalQty = pdfItems.reduce((sum, p) => sum + p.quantity, 0);
    return {
      products,
      message: `${products.length} bestelde producten met inkoopprijzen uit factuur (${totalQty} stuks). Niet-bestelde producten verwijderd.`,
    };
  }

  return {
    products: existingProducts,
    message: `${pdfItems.length} items uit factuur geladen. Upload de Product Information CSV voor EAN codes en verkoopprijzen.`,
  };
}

function extractProductCode(filename: string): string | null {
  const match = filename.match(/^(CC\d{3,4})\b/i);
  return match ? match[1].toUpperCase() : null;
}

const claudeAndCoPlugin: SupplierPlugin = {
  id: 'claudeandco',
  displayName: 'Claude & Co',
  brandName: 'Claude & Co',
  fileInputs: [
    { id: 'main_csv', label: 'Claude & Co Product Information CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'pdf_invoice', label: 'Factuur PDF (optioneel - inkoopprijzen + hoeveelheden)', accept: '.pdf', required: false, type: 'pdf' },
  ],
  fileDetection: [
    { fileInputId: 'main_csv', detect: (text) => isClaudeCoCSV(text) },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-claudeandco-pdf',
  parse,
  processPdfResults,
  imageMatching: {
    strategy: 'reference',
    extractReference: (filename: string) => extractProductCode(filename),
  },
  imageUpload: {
    enabled: true,
    instructions: 'Upload afbeeldingen uit de Flats of Studio mappen. Bestandsnamen beginnen met de productcode (bijv. CC530).',
    exampleFilenames: ['CC530 Lenni Butter Tee.jpeg', 'CC550 Drew Almond Pear Borg Jacket 2.jpg'],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => extractProductCode(filename),
    mapFilename: (filename: string, reference: string) => {
      if (/\d\.(jpg|jpeg|png)$/i.test(filename)) {
        const numMatch = filename.match(/(\d+)\.(jpg|jpeg|png)$/i);
        return `${reference} - Extra ${numMatch?.[1] || '0'}.jpg`;
      }
      return `${reference} - Main.jpg`;
    },
  },
};

export default claudeAndCoPlugin;
