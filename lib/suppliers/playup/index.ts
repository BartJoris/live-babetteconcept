import { parseEuroPrice, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, ProductVariant, EnrichmentResult, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

function formatDescription(desc: string): string {
  const words = desc.split(' ');
  return words.map((word, index) => {
    if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (word === 'LS' || (word.length === 2 && word === word.toUpperCase())) return word;
    return word.toLowerCase();
  }).join(' ');
}

function formatSizeForOdoo(eanSize: string): string {
  const adultSizes: Record<string, string> = {
    'XXS': 'XXS - 32', 'XS': 'XS - 34', 'S': 'S - 36',
    'M': 'M - 38', 'L': 'L - 40', 'XL': 'XL - 42', 'XXL': 'XXL - 44',
  };
  if (adultSizes[eanSize.toUpperCase()]) return adultSizes[eanSize.toUpperCase()];
  if (/^\d+M$/i.test(eanSize)) return eanSize.slice(0, -1) + ' maand';
  if (/^\d+Y$/i.test(eanSize)) return eanSize.slice(0, -1) + ' jaar';
  return eanSize;
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
}

interface InvoiceItem {
  article: string;
  colourCode: string;
  description: string;
  sizes: Array<{ size: string; qty: number }>;
  totalQty: number;
  unitPrice: number;
}

let eanProductsCache: EANProduct[] | null = null;
let invoiceItemsCache: InvoiceItem[] | null = null;

function parseQuotedCSVLine(line: string, delimiter: string = ','): string[] {
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue);
  return values;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseEANCSV(text: string): EANProduct[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(text);
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const products: EANProduct[] = [];

  const col = (name: string) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const iRef = col('Reference');
  const iDesc = col('Description');
  const iSize = col('Size');
  const iColCode = col('Colour Code');
  const iColDesc = col('Colour Description');
  const iPrice = col('Price');
  const iRetail = headers.findIndex(h => h.toLowerCase().includes('retail'));
  const iEAN = col('EAN');
  const iComp = col('Composition');

  if (iRef === -1) return products;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseQuotedCSVLine(line, delimiter);

    const ref = values[iRef]?.trim();
    if (!ref) continue;

    products.push({
      reference: ref,
      description: values[iDesc]?.trim() || '',
      size: values[iSize]?.trim() || '',
      colourCode: values[iColCode]?.trim() || '',
      colourDescription: values[iColDesc]?.trim() || '',
      price: values[iPrice]?.trim() || '0',
      retailPrice: iRetail !== -1 ? (values[iRetail]?.trim() || '0') : '0',
      eanCode: iEAN !== -1 ? (values[iEAN]?.trim() || '') : '',
      composition: iComp !== -1 ? (values[iComp]?.trim() || '') : '',
    });
  }
  return products;
}

function buildProductsFromEAN(
  eanProducts: EANProduct[],
  invoiceItems: InvoiceItem[] | null,
  context: ParseContext,
): ParsedProduct[] {
  const brand = context.findBrand('play up');
  const products: Record<string, ParsedProduct> = {};

  // Build invoice lookup: article+colour → item
  const invoiceMap = new Map<string, InvoiceItem>();
  const invoiceSizeQty = new Map<string, Map<string, number>>();
  if (invoiceItems) {
    for (const item of invoiceItems) {
      const key = `${item.article}_${item.colourCode}`;
      invoiceMap.set(key, item);
      const sizeMap = new Map<string, number>();
      for (const s of item.sizes) sizeMap.set(s.size, s.qty);
      invoiceSizeQty.set(key, sizeMap);
    }
  }

  for (const ean of eanProducts) {
    const refParts = ean.reference.split('/');
    const article = refParts[refParts.length - 1] || ean.reference;
    const colourCode = ean.colourCode;
    const reference = `${article}_${colourCode}`;

    // If invoice loaded, only include ordered items
    if (invoiceItems && !invoiceMap.has(reference)) continue;

    if (!products[reference]) {
      const formattedDescription = formatDescription(ean.description);
      const colourName = ean.colourDescription || colourCode;
      const formattedName = `Play Up - ${formattedDescription} (${colourName.toLowerCase()})`;

      products[reference] = {
        reference,
        name: formattedName,
        originalName: ean.description,
        material: ean.composition,
        color: colourName,
        ecommerceDescription: `${ean.description}\n\n${ean.composition}`,
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      };
    }

    const sizeMap = invoiceSizeQty.get(reference);
    const normalizedSize = ean.size.toUpperCase();
    const qty = sizeMap?.get(normalizedSize) ?? (invoiceItems ? 0 : 1);

    const variant: ProductVariant = {
      size: formatSizeForOdoo(ean.size),
      quantity: qty,
      ean: ean.eanCode,
      sku: reference,
      price: parseEuroPrice(ean.price),
      rrp: parseEuroPrice(ean.retailPrice),
    };

    products[reference].variants.push(variant);
  }

  const productList = Object.values(products);
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

function isPlayUpEANCSV(text: string): boolean {
  const first300 = text.substring(0, 300);
  return first300.includes('Colour Code') && first300.includes('EAN') && first300.includes('Reference');
}

function isPlayUpDeliveryCSV(text: string): boolean {
  const first300 = text.substring(0, 300);
  return first300.includes('Article') && first300.includes('Description') && !first300.includes('EAN');
}

function normalizeDeliverySize(s: string): string {
  if (s.includes('maand')) return s.split(' ')[0] + 'M';
  if (s.includes('jaar')) return s.split(' ')[0] + 'Y';
  return s.toUpperCase();
}

const playup: SupplierPlugin = {
  id: 'playup',
  displayName: 'Play UP',
  brandName: 'Play Up',

  fileInputs: [
    { id: 'main_csv', label: 'Play UP EAN CSV of Delivery CSV', accept: '.csv', required: true, type: 'csv' },
    { id: 'pdf_invoice', label: 'Factuur PDF (optioneel - hoeveelheden)', accept: '.pdf', required: false, type: 'pdf' },
  ],

  fileDetection: [
    { fileInputId: 'main_csv', detect: (text) => isPlayUpEANCSV(text) || isPlayUpDeliveryCSV(text) },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-playup-invoice',

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const text = files['main_csv'] as string;
    if (!text) return [];

    // Detect format: EAN CSV or Delivery CSV
    if (isPlayUpEANCSV(text)) {
      eanProductsCache = parseEANCSV(text);
      // When CSV is uploaded fresh, ignore stale invoice cache
      // (PDF should be re-uploaded to filter)
      invoiceItemsCache = null;
      console.log(`Play UP: Parsed ${eanProductsCache.length} EAN rows from CSV`);
      const products = buildProductsFromEAN(eanProductsCache, invoiceItemsCache, context);
      console.log(`Play UP: Built ${products.length} products (${products.reduce((s, p) => s + p.variants.length, 0)} variants)`);
      return products;
    }

    // Legacy: Delivery CSV format (comma-separated)
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    if (!headers.includes('Article') || !headers.includes('Description')) return [];

    const products: Record<string, ParsedProduct> = {};
    const brand = context.findBrand('play up');

    // Also parse EAN data if cached
    const eanProducts = eanProductsCache || [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseQuotedCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

      const article = row['Article'] || '';
      const color = row['Color'] || '';
      const description = row['Description'] || '';
      const size = row['Size'] || '';
      const quantity = parseInt(row['Quantity'] || '0');
      const price = parseFloat(row['Price'] || '0');

      if (!article) continue;

      const reference = `${article}_${color}`;

      if (!products[reference]) {
        const eanSample = eanProducts.find(ean => {
          const eanArticle = ean.reference.split('/')[1];
          return eanArticle === article && ean.colourCode === color;
        });

        const productDescription = eanSample ? eanSample.description : description;
        const colorDescription = eanSample ? eanSample.colourDescription.toLowerCase() : color;
        const formattedDescription = formatDescription(productDescription);
        const formattedName = `Play Up - ${formattedDescription} (${colorDescription})`;

        products[reference] = {
          reference,
          name: formattedName,
          originalName: productDescription,
          material: eanSample?.composition || color,
          color: colorDescription,
          ecommerceDescription: eanSample
            ? `${productDescription}\n\n${eanSample.composition}`
            : productDescription,
          variants: [],
          suggestedBrand: brand?.name,
          selectedBrand: brand,
          publicCategories: [],
          productTags: [],
          isFavorite: false,
          isPublished: true,
        };
      }

      const normalizedDeliverySize = normalizeDeliverySize(size);

      const eanMatch = eanProducts.find(ean => {
        const eanArticle = ean.reference.split('/')[1];
        return eanArticle === article && ean.colourCode === color && ean.size === normalizedDeliverySize;
      });

      const formattedSize = eanMatch ? formatSizeForOdoo(eanMatch.size) : size;

      const variant: ProductVariant = {
        size: formattedSize,
        quantity,
        ean: eanMatch?.eanCode || '',
        sku: `${article}_${color}`,
        price: eanMatch ? parseEuroPrice(eanMatch.price) : price,
        rrp: eanMatch ? parseEuroPrice(eanMatch.retailPrice) : (price * 2.4),
      };

      products[reference].variants.push(variant);

      if (eanMatch && !products[reference].color.includes(' ')) {
        products[reference].color = eanMatch.colourDescription;
      }
    }

    const productList = Object.values(products);
    productList.forEach(p => {
      p.sizeAttribute = determineSizeAttribute(p.variants);
    });

    return productList;
  },

  processPdfResults(
    pdfData: Record<string, unknown>,
    existingProducts: ParsedProduct[],
    context: ParseContext,
  ): EnrichmentResult {
    const pdfItems = (pdfData.products || []) as InvoiceItem[];
    if (pdfItems.length === 0) {
      return { products: existingProducts, message: 'Geen producten gevonden in de Play UP factuur.' };
    }

    invoiceItemsCache = pdfItems;

    if (eanProductsCache && eanProductsCache.length > 0) {
      const products = buildProductsFromEAN(eanProductsCache, pdfItems, context);
      const totalQty = pdfItems.reduce((sum, p) => sum + p.totalQty, 0);
      // Als koppeling 0 producten geeft maar we hadden wel EAN-producten, behoud die zodat de gebruiker kan verdergaan
      if (products.length === 0 && existingProducts.length > 0) {
        return {
          products: existingProducts,
          message: `Factuur bevat ${pdfItems.length} regels maar geen match met EAN CSV. Alle ${existingProducts.length} producten uit EAN CSV worden getoond. Je kunt gewoon verdergaan.`,
        };
      }
      return {
        products,
        message: `${products.length} bestelde producten uit factuur (${totalQty} stuks). Niet-bestelde producten verwijderd.`,
      };
    }

    return {
      products: existingProducts,
      message: `${pdfItems.length} items uit factuur geladen. Upload de EAN CSV voor productdetails.`,
    };
  },

  imageUpload: {
    enabled: true,
    instructions: 'Upload product afbeeldingen via de dedicated pagina.',
    exampleFilenames: [],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => {
      const match = filename.match(/^(\w+)[-_]/);
      return match ? match[1] : null;
    },
    dedicatedPageUrl: '/playup-images-import',
    dedicatedPageLabel: 'Upload Play UP Afbeeldingen',
  },
};

export default playup;
