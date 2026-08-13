import { parseEuroPrice, determineSizeAttribute } from '@/lib/import/shared';
import type {
  SupplierPlugin,
  ParsedProduct,
  ProductVariant,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

function formatDescription(desc: string): string {
  const words = desc.split(' ');
  return words
    .map((word, index) => {
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      if (word === 'LS' || (word.length === 2 && word === word.toUpperCase())) return word;
      return word.toLowerCase();
    })
    .join(' ');
}

function formatSizeForOdoo(eanSize: string): string {
  const adultSizes: Record<string, string> = {
    XXS: 'XXS - 32',
    XS: 'XS - 34',
    S: 'S - 36',
    M: 'M - 38',
    L: 'L - 40',
    XL: 'XL - 42',
    XXL: 'XXL - 44',
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
  /** Ordered qty from Amount/Quantity when present. */
  quantity: number;
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

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^"|"$/g, '');
}

/**
 * Skip Excel export preamble rows like "Tabel 1" and locate the real header.
 */
function findHeaderRow(
  lines: string[],
): { index: number; delimiter: string; headers: string[] } | null {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const delimiter = detectDelimiter(line);
    const headers = parseQuotedCSVLine(line, delimiter).map(normalizeHeader);
    const joined = headers.join('|');
    const looksLikeOrder =
      headers.includes('model reference') &&
      headers.includes('sku') &&
      (headers.includes('pvpr') || headers.includes('ean'));
    const looksLikeClassicEan =
      headers.some((h) => h.includes('reference')) &&
      headers.some((h) => h.includes('colour code') || h === 'color') &&
      headers.some((h) => h.includes('ean'));
    const looksLikeDelivery =
      headers.includes('article') &&
      headers.includes('description') &&
      headers.includes('quantity') &&
      !joined.includes('ean');

    if (looksLikeOrder || looksLikeClassicEan || looksLikeDelivery) {
      return { index: i, delimiter, headers };
    }
  }
  return null;
}

function headerIndex(headers: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const exact = headers.findIndex((h) => h === candidate);
    if (exact !== -1) return exact;
  }
  for (const candidate of candidates) {
    const partial = headers.findIndex((h) => h.includes(candidate));
    if (partial !== -1) return partial;
  }
  return -1;
}

function isPlayUpOrderCSV(text: string): boolean {
  const sample = text.substring(0, 800).toLowerCase();
  return (
    sample.includes('model reference') &&
    sample.includes('description color') &&
    (sample.includes('pvpr') || sample.includes('playupstore'))
  );
}

function isPlayUpEANCSV(text: string): boolean {
  if (isPlayUpOrderCSV(text)) return true;
  const first300 = text.substring(0, 300);
  return (
    first300.includes('Colour Code') &&
    first300.includes('EAN') &&
    first300.includes('Reference')
  );
}

function isPlayUpDeliveryCSV(text: string): boolean {
  const first300 = text.substring(0, 300);
  return (
    first300.includes('Article') &&
    first300.includes('Description') &&
    !first300.toLowerCase().includes('ean')
  );
}

function articleFromModelReference(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || trimmed;
}

function parseEANCSV(text: string): EANProduct[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerInfo = findHeaderRow(lines);
  if (!headerInfo) return [];

  const { index: headerIndexRow, delimiter, headers } = headerInfo;
  const products: EANProduct[] = [];

  const iRef = headerIndex(headers, 'model reference', 'reference');
  const iDesc = headers.findIndex((h) => h === 'description');
  const iSize = headerIndex(headers, 'size');
  const iColCode = headers.findIndex(
    (h) => h === 'color' || h === 'colour' || h === 'colour code' || h === 'color code',
  );
  const iColDesc = headerIndex(
    headers,
    'description color',
    'colour description',
    'color description',
  );
  const iPrice = headers.findIndex((h) => h === 'price');
  const iRetail = headers.findIndex(
    (h) => h === 'pvpr' || h.includes('retail') || h === 'rrp',
  );
  const iEAN = headers.findIndex((h) => h === 'ean' || h.includes('ean'));
  const iComp = headerIndex(headers, 'composition');
  const iAmount = headers.findIndex(
    (h) => h === 'amount' || h === 'quantity' || h === 'qty',
  );

  // Prefer model reference over a generic "reference" that might hit SKU wrongly.
  // SKU alone is not enough: values look like PA00/0AT11352-R373B-9M.
  if (iRef === -1 || iColCode === -1) return products;

  for (let i = headerIndexRow + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseQuotedCSVLine(line, delimiter);

    const rawRef = values[iRef]?.trim() || '';
    if (!rawRef) continue;

    const colourCode = values[iColCode]?.trim() || '';
    const article = articleFromModelReference(rawRef);
    // Store classic EAN "Reference" as full path; order CSV uses model reference.
    // buildProductsFromEAN always takes the segment after the last "/".
    const reference = rawRef.includes('/') ? rawRef : `PA00/${article}`;

    const amountRaw = iAmount !== -1 ? values[iAmount]?.trim() || '1' : '1';
    const quantity = Math.max(0, parseInt(amountRaw.replace(',', '.'), 10) || 0);

    products.push({
      reference,
      description: iDesc !== -1 ? values[iDesc]?.trim() || '' : '',
      size: iSize !== -1 ? values[iSize]?.trim() || '' : '',
      colourCode,
      colourDescription: iColDesc !== -1 ? values[iColDesc]?.trim() || '' : '',
      price: iPrice !== -1 ? values[iPrice]?.trim() || '0' : '0',
      retailPrice: iRetail !== -1 ? values[iRetail]?.trim() || '0' : '0',
      eanCode: iEAN !== -1 ? values[iEAN]?.trim() || '' : '',
      composition: iComp !== -1 ? values[iComp]?.trim() || '' : '',
      quantity: quantity > 0 ? quantity : 1,
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

    if (invoiceItems && !invoiceMap.has(reference)) continue;

    if (!products[reference]) {
      const formattedDescription = formatDescription(ean.description);
      // Play Up "Description Color" is almost always a print/motif name
      // (DRAWING, SKETCHES, EMBROIDERY…), not a wear colour — feed it as
      // fabricPrint so the AI doesn't write "in de kleur DRAWING".
      const printOrTheme = ean.colourDescription.trim();
      const formattedName = printOrTheme
        ? `Play Up - ${formattedDescription} (${printOrTheme.toLowerCase()})`
        : `Play Up - ${formattedDescription}`;

      products[reference] = {
        reference,
        name: formattedName,
        originalName: ean.description,
        material: ean.composition,
        color: '',
        fabricPrint: printOrTheme || undefined,
        ecommerceDescription: ean.description,
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
    const qty =
      sizeMap?.get(normalizedSize) ?? (invoiceItems ? 0 : ean.quantity || 1);

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
  productList.forEach((p) => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

function normalizeDeliverySize(s: string): string {
  if (s.includes('maand')) return s.split(' ')[0] + 'M';
  if (s.includes('jaar')) return s.split(' ')[0] + 'Y';
  return s.toUpperCase();
}

/**
 * Images: `0AT11352_R373B_1.jpg` or `2AT11354_E811N.jpg` → product ref `0AT11352_R373B`.
 * Article always starts with a digit; colour code starts with a letter.
 */
export function extractPlayUpImageReference(filename: string): string | null {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const withIndex = base.match(/^(\d[A-Za-z0-9]+_[A-Za-z][A-Za-z0-9]*)_\d+$/);
  if (withIndex) return withIndex[1];
  const noIndex = base.match(/^(\d[A-Za-z0-9]+_[A-Za-z][A-Za-z0-9]*)$/);
  if (noIndex) return noIndex[1];
  return null;
}

const playup: SupplierPlugin = {
  id: 'playup',
  displayName: 'Play UP',
  brandName: 'Play Up',

  fileInputs: [
    {
      id: 'main_csv',
      label: 'Play UP order / EAN / delivery CSV',
      accept: '.csv',
      required: true,
      type: 'csv',
    },
    {
      id: 'pdf_invoice',
      label: 'Factuur PDF (optioneel - hoeveelheden)',
      accept: '.pdf',
      required: false,
      type: 'pdf',
    },
  ],

  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) =>
        isPlayUpOrderCSV(text) || isPlayUpEANCSV(text) || isPlayUpDeliveryCSV(text),
    },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-playup-invoice',

  parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
    const text = files['main_csv'] as string;
    if (!text) return [];

    if (isPlayUpEANCSV(text) || isPlayUpOrderCSV(text)) {
      eanProductsCache = parseEANCSV(text);
      invoiceItemsCache = null;
      console.log(`Play UP: Parsed ${eanProductsCache.length} EAN/order rows from CSV`);
      const products = buildProductsFromEAN(eanProductsCache, invoiceItemsCache, context);
      console.log(
        `Play UP: Built ${products.length} products (${products.reduce((s, p) => s + p.variants.length, 0)} variants)`,
      );
      return products;
    }

    // Legacy: Delivery CSV format (comma-separated)
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    if (!headers.includes('Article') || !headers.includes('Description')) return [];

    const products: Record<string, ParsedProduct> = {};
    const brand = context.findBrand('play up');
    const eanProducts = eanProductsCache || [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseQuotedCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || '').trim();
      });

      const article = row['Article'] || '';
      const color = row['Color'] || '';
      const description = row['Description'] || '';
      const size = row['Size'] || '';
      const quantity = parseInt(row['Quantity'] || '0');
      const price = parseFloat(row['Price'] || '0');

      if (!article) continue;

      const reference = `${article}_${color}`;

      if (!products[reference]) {
        const eanSample = eanProducts.find((ean) => {
          const eanArticle = ean.reference.split('/')[1];
          return eanArticle === article && ean.colourCode === color;
        });

        const productDescription = eanSample ? eanSample.description : description;
        const printOrTheme = (
          eanSample?.colourDescription ||
          color ||
          ''
        ).trim();
        const formattedDescription = formatDescription(productDescription);
        const formattedName = printOrTheme
          ? `Play Up - ${formattedDescription} (${printOrTheme.toLowerCase()})`
          : `Play Up - ${formattedDescription}`;

        products[reference] = {
          reference,
          name: formattedName,
          originalName: productDescription,
          material: eanSample?.composition || '',
          color: '',
          fabricPrint: printOrTheme || undefined,
          ecommerceDescription: productDescription,
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

      const eanMatch = eanProducts.find((ean) => {
        const eanArticle = ean.reference.split('/')[1];
        return (
          eanArticle === article &&
          ean.colourCode === color &&
          ean.size === normalizedDeliverySize
        );
      });

      const formattedSize = eanMatch ? formatSizeForOdoo(eanMatch.size) : size;

      const variant: ProductVariant = {
        size: formattedSize,
        quantity,
        ean: eanMatch?.eanCode || '',
        sku: `${article}_${color}`,
        price: eanMatch ? parseEuroPrice(eanMatch.price) : price,
        rrp: eanMatch ? parseEuroPrice(eanMatch.retailPrice) : price * 2.4,
      };

      products[reference].variants.push(variant);

      if (eanMatch?.colourDescription && !products[reference].fabricPrint) {
        products[reference].fabricPrint = eanMatch.colourDescription;
      }
    }

    const productList = Object.values(products);
    productList.forEach((p) => {
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
      return {
        products: existingProducts,
        message: 'Geen producten gevonden in de Play UP factuur.',
      };
    }

    invoiceItemsCache = pdfItems;

    if (eanProductsCache && eanProductsCache.length > 0) {
      const products = buildProductsFromEAN(eanProductsCache, pdfItems, context);
      const totalQty = pdfItems.reduce((sum, p) => sum + p.totalQty, 0);
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

  imageMatching: {
    strategy: 'reference',
    extractReference: extractPlayUpImageReference,
  },

  imageUpload: {
    enabled: true,
    instructions:
      'Upload productafbeeldingen. Bestandsnamen zijn Artikel_Kleur of Artikel_Kleur_volgnummer (bijv. 0AT11352_R373B_1.jpg).',
    exampleFilenames: [
      '0AT11352_R373B_1.jpg',
      '0AT11352_R373B_2.jpg',
      '2AT11354_E811N.jpg',
    ],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: extractPlayUpImageReference,
    dedicatedPageUrl: '/playup-images-import',
    dedicatedPageLabel: 'Upload Play UP Afbeeldingen',
  },
};

export default playup;
