import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { mapSizeToOdooFormat, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

const HEADER_SKIP = 5;

interface RawProduct {
  reference: string;
  name: string;
  description: string;
  color: string;
  composition: string;
  wholesale: number;
  pvp: number;
  variants: Array<{ size: string; ean: string }>;
}

interface InvoiceItem {
  reference: string;
  description: string;
  totalQty: number;
  unitPrice: number;
  netValue: number;
  sizeBreakdown: Array<{ size: string; qty: number }>;
}

let csvProductsCache: RawProduct[] | null = null;
let invoiceItemsCache: InvoiceItem[] | null = null;
let lastContext: ParseContext | null = null;

function isProductRow(cols: string[]): boolean {
  const ref = cols[1]?.trim();
  return !!ref && /^SS\d{2}\./i.test(ref);
}

function isSizeRow(cols: string[]): boolean {
  const size = cols[11]?.trim();
  const ean = cols[12]?.trim();
  return !cols[1]?.trim() && !!(size || ean);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCatalogCSV(text: string): RawProduct[] {
  const lines = text.split('\n');
  if (lines.length <= HEADER_SKIP) return [];

  const products: RawProduct[] = [];
  let current: RawProduct | null = null;

  for (let i = HEADER_SKIP; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    if (isProductRow(cols)) {
      if (current) products.push(current);

      const reference = cols[1].trim();
      const rawName = cols[3]?.trim() || '';
      const description = cols[4]?.trim() || '';
      const color = cols[5]?.trim() || '';
      const composition = cols[7]?.trim() || '';
      const wholesaleStr = cols[14]?.trim() || '';
      const pvpStr = cols[15]?.trim() || '';

      const size = cols[11]?.trim() || '';
      const ean = cols[12]?.trim() || '';

      current = {
        reference,
        name: rawName,
        description,
        color,
        composition,
        wholesale: parseEuroPrice(wholesaleStr),
        pvp: parseEuroPrice(pvpStr),
        variants: [],
      };

      if (size) {
        current.variants.push({ size, ean });
      }
    } else if (isSizeRow(cols) && current) {
      const size = cols[11]?.trim() || '';
      const ean = cols[12]?.trim() || '';
      if (size) {
        current.variants.push({ size, ean });
      }
    }
  }

  if (current) products.push(current);
  return products;
}

function buildProducts(
  rawProducts: RawProduct[],
  invoiceItems: InvoiceItem[] | null,
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('sisters', 'department', 'piupiuchick');
  const products: ParsedProduct[] = [];

  const invoiceMap = new Map<string, InvoiceItem>();
  if (invoiceItems) {
    for (const item of invoiceItems) {
      invoiceMap.set(item.reference.toUpperCase(), item);
    }
  }

  // If invoice is uploaded, only include products that are in the invoice
  const filteredProducts = invoiceItems
    ? rawProducts.filter(p => invoiceMap.has(p.reference.toUpperCase()))
    : rawProducts;

  for (const raw of filteredProducts) {
    const nameParts = raw.name.split('|').map(p => p.trim().replace(/^"|"$/g, ''));
    const productType = nameParts[0] || raw.reference;
    const colorVariant = nameParts[1] || raw.color;

    const productTypeFormatted = toSentenceCase(productType);
    const colorFormatted = toSentenceCase(colorVariant || raw.color);

    const fullName = colorFormatted
      ? `Sisters Department - ${productTypeFormatted} - ${colorFormatted}`
      : `Sisters Department - ${productTypeFormatted}`;

    const invoice = invoiceMap.get(raw.reference.toUpperCase());

    // Build size→qty map from invoice
    const invoiceSizeQty = new Map<string, number>();
    if (invoice) {
      for (const s of invoice.sizeBreakdown) {
        invoiceSizeQty.set(s.size.toUpperCase(), s.qty);
      }
    }

    const variants = raw.variants.map(v => {
      const sizeUpper = v.size.toUpperCase();
      const qty = invoiceSizeQty.get(sizeUpper) ?? (invoice ? 0 : 1);

      return {
        size: mapSizeToOdooFormat(v.size),
        ean: v.ean,
        sku: `${raw.reference}-${v.size}`,
        quantity: qty,
        price: invoice?.unitPrice || raw.wholesale,
        rrp: raw.pvp,
      };
    });

    const product: ParsedProduct = {
      reference: raw.reference,
      name: fullName,
      originalName: productType,
      material: raw.composition,
      color: raw.color,
      ecommerceDescription: raw.description || productTypeFormatted,
      variants,
      suggestedBrand: suggestedBrand?.name,
      selectedBrand: suggestedBrand,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
    };

    product.sizeAttribute = determineSizeAttribute(product.variants);
    products.push(product);
  }

  return products;
}

function isSistersDepartmentCSV(text: string): boolean {
  const first500 = text.substring(0, 500).toLowerCase();
  return first500.includes('sisters department') || first500.includes('piupiuchick');
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const csvText = files['main_csv'] as string;
  if (csvText) {
    csvProductsCache = parseCatalogCSV(csvText);
    lastContext = context;
  }

  if (csvProductsCache && csvProductsCache.length > 0) {
    return buildProducts(csvProductsCache, invoiceItemsCache, lastContext || context);
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
    return { products: existingProducts, message: 'Geen producten gevonden in de factuur PDF.' };
  }

  invoiceItemsCache = pdfItems;
  lastContext = context;

  // If CSV was already parsed, rebuild with invoice filter
  if (csvProductsCache && csvProductsCache.length > 0) {
    const products = buildProducts(csvProductsCache, pdfItems, context);
    const total = pdfItems.reduce((sum, p) => sum + p.totalQty, 0);
    return {
      products,
      message: `${products.length} bestelde producten gefilterd uit catalogus (${total} stuks totaal). ${csvProductsCache.length - products.length} niet-bestelde producten verwijderd.`,
    };
  }

  return {
    products: existingProducts,
    message: `${pdfItems.length} producten uit factuur geladen. Upload nu de Product Info CSV voor productdetails en EAN codes.`,
  };
}

const sistersDepartmentPlugin: SupplierPlugin = {
  id: 'sistersdepartment',
  displayName: 'Sisters Department',
  brandName: 'Sisters Department',
  fileInputs: [
    { id: 'main_csv', label: 'Sisters Department Product Info CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'pdf_invoice', label: 'Factuur PDF (optioneel - filtert bestelde producten)', accept: '.pdf', required: false, type: 'pdf' },
  ],
  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) => isSistersDepartmentCSV(text),
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-sistersdepartment-pdf',
  parse,
  processPdfResults,
};

export default sistersDepartmentPlugin;
