import { parseCSV } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  ProductVariant,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';
import { isPlausibleBayiriColor, STYLE_REF_RE, type BayiriPdfProduct } from './pdf';

const RRP_FALLBACK = 2.5;

const SIZE_COLUMNS = [
  'one size',
  '0-6m',
  '6-12m',
  '1-3y',
  '3-6y',
  '3m',
  '6m',
  '12m',
  '18m',
  '2y',
  '3y',
  '4y',
  '6y',
];

function convertBayiriSize(size: string): string {
  if (!size) return size;
  const s = size.trim();
  if (/^U\b/i.test(s) || /^ONE\s*SIZE$/i.test(s)) return 'U';
  return convertSize(s);
}

function isOneSizeRange(sizeRange: string): boolean {
  const s = sizeRange.trim().toUpperCase();
  return s === 'U' || s.startsWith('U ') || s.includes('ONE SIZE') || /90\s*[X×]\s*90/.test(s);
}

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
}

function parseCatalogCsv(text: string): ParsedProduct[] {
  if (!text) return [];
  const { rows } = parseCSV(text, { delimiter: ';', hasHeader: false });
  if (rows.length === 0) return [];

  const headerIdx = rows.findIndex((row) =>
    row.some((cell) => headerKey(cell) === 'style ref'),
  );
  if (headerIdx === -1) return [];

  const col: Record<string, number> = {};
  rows[headerIdx].forEach((cell, idx) => {
    const key = headerKey(cell);
    if (key) col[key] = idx;
  });

  const get = (cells: string[], name: string): string => {
    const idx = col[name];
    return idx !== undefined ? (cells[idx] || '').trim() : '';
  };

  const products: ParsedProduct[] = [];

  for (const cells of rows.slice(headerIdx + 1)) {
    const styleRef = (get(cells, 'style ref') || cells.find((c) => STYLE_REF_RE.test(c)) || '')
      .trim()
      .toLowerCase();
    if (!STYLE_REF_RE.test(styleRef)) continue;

    const description = get(cells, 'description');
    const color = get(cells, 'color');
    const sizeRange = get(cells, 'size range');
    const composition = get(cells, 'composition');
    const wholesale = parseEuroPrice(get(cells, 'wholesale price (eur)'));
    const rrp = parseEuroPrice(get(cells, 'suggested pvp (eur)'));
    const totalPieces = parseInt(get(cells, 'total pieces'), 10) || 0;

    const sizeQtys: Array<{ size: string; quantity: number }> = [];
    for (const sizeCol of SIZE_COLUMNS) {
      const raw = get(cells, sizeCol);
      const qty = parseInt(raw, 10);
      if (qty > 0) sizeQtys.push({ size: sizeCol.toUpperCase().replace('ONE SIZE', 'U'), quantity: qty });
    }

    const variants: ProductVariant[] = [];
    if (sizeQtys.length > 0) {
      for (const s of sizeQtys) {
        variants.push({
          size: convertBayiriSize(s.size),
          ean: '',
          sku: `${styleRef}-${s.size}`,
          quantity: s.quantity,
          price: wholesale,
          rrp: rrp || wholesale * RRP_FALLBACK,
        });
      }
    } else if (isOneSizeRange(sizeRange) && totalPieces > 0) {
      variants.push({
        size: 'U',
        ean: '',
        sku: styleRef,
        quantity: totalPieces,
        price: wholesale,
        rrp: rrp || wholesale * RRP_FALLBACK,
      });
    } else {
      variants.push({
        size: isOneSizeRange(sizeRange) ? 'U' : convertBayiriSize(sizeRange.split(/[-/]/).pop()?.trim() || 'U'),
        ean: '',
        sku: styleRef,
        quantity: totalPieces,
        price: wholesale,
        rrp: rrp || wholesale * RRP_FALLBACK,
      });
    }

    const nameFormatted = toSentenceCase(description);
    const colorFormatted = toSentenceCase(color);

    products.push({
      reference: styleRef,
      name: colorFormatted
        ? `Bayiri - ${nameFormatted} - ${colorFormatted}`
        : `Bayiri - ${nameFormatted}`,
      originalName: description,
      material: composition,
      color,
      ecommerceDescription: nameFormatted,
      csvCategory: /kid/i.test(styleRef) ? 'KIDS' : 'BABY',
      variants,
      suggestedBrand: undefined,
      selectedBrand: undefined,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
    });
  }

  return products;
}

function pdfProductsFromFiles(files: SupplierFiles): BayiriPdfProduct[] {
  const raw = files['pdf_invoice'];
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return [];
  try {
    const data = JSON.parse(raw) as { products?: BayiriPdfProduct[] };
    return data.products || [];
  } catch {
    return [];
  }
}

function applyBrand(products: ParsedProduct[], context: ParseContext): ParsedProduct[] {
  const brand = context.findBrand('bayiri', 'bayíri');
  products.forEach((p) => {
    p.suggestedBrand = brand?.name;
    p.selectedBrand = brand;
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });
  return products;
}

function buildFromPdf(pdfProducts: BayiriPdfProduct[], context: ParseContext): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  for (const item of pdfProducts) {
    if (item.totalPieces <= 0 && item.sizes.every((s) => s.quantity <= 0)) continue;
    const nameFormatted = toSentenceCase(item.description);
    const colorFormatted = toSentenceCase(item.color);
    const variants: ProductVariant[] =
      item.sizes.length > 0
        ? item.sizes.map((s) => ({
            size: convertBayiriSize(s.size),
            ean: '',
            sku: `${item.styleRef}-${s.size}`,
            quantity: s.quantity,
            price: item.wholesalePrice,
            rrp: item.suggestedPvp || item.wholesalePrice * RRP_FALLBACK,
          }))
        : [
            {
              size: 'U',
              ean: '',
              sku: item.styleRef,
              quantity: item.totalPieces,
              price: item.wholesalePrice,
              rrp: item.suggestedPvp || item.wholesalePrice * RRP_FALLBACK,
            },
          ];

    products.push({
      reference: item.styleRef,
      name: colorFormatted
        ? `Bayiri - ${nameFormatted} - ${colorFormatted}`
        : `Bayiri - ${nameFormatted}`,
      originalName: item.description,
      material: '',
      color: item.color,
      ecommerceDescription: nameFormatted,
      csvCategory: item.section,
      variants,
      suggestedBrand: undefined,
      selectedBrand: undefined,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
    });
  }
  return applyBrand(products, context);
}

function mergeOrderWithCatalog(
  pdfProducts: BayiriPdfProduct[],
  catalog: ParsedProduct[],
  context: ParseContext,
): ParsedProduct[] {
  if (catalog.length === 0) return buildFromPdf(pdfProducts, context);

  const byRef = new Map(catalog.map((p) => [p.reference.toLowerCase(), p]));
  const merged: ParsedProduct[] = [];

  for (const item of pdfProducts) {
    if (item.totalPieces <= 0 && item.sizes.every((s) => s.quantity <= 0)) continue;
    const csv = byRef.get(item.styleRef.toLowerCase());
    if (!csv) {
      merged.push(...buildFromPdf([item], context));
      continue;
    }

    const price = csv.variants[0]?.price || item.wholesalePrice;
    const rrp = csv.variants[0]?.rrp || item.suggestedPvp || price * RRP_FALLBACK;
    let variants: ProductVariant[];

    const pdfIsUnit = item.sizes.length > 0 && item.sizes.every((s) => s.size === 'U');
    const csvIsUnit = csv.variants.length > 0 && csv.variants.every((v) => v.size === 'U');
    if (pdfIsUnit || (item.sizes.length === 0 && csvIsUnit)) {
      variants = [
        {
          size: 'U',
          ean: '',
          sku: csv.reference,
          quantity: item.totalPieces || item.sizes.reduce((sum, s) => sum + s.quantity, 0),
          price,
          rrp,
        },
      ];
    } else if (item.sizes.length > 0) {
      variants = item.sizes.map((s) => ({
        size: convertBayiriSize(s.size),
        ean: '',
        sku: `${csv.reference}-${s.size}`,
        quantity: s.quantity,
        price,
        rrp,
      }));
    } else {
      variants = [
        {
          ...csv.variants[0],
          quantity: item.totalPieces,
          price,
          rrp,
        },
      ];
    }

    const color = isPlausibleBayiriColor(csv.color)
      ? csv.color
      : item.color || csv.color;
    const name = isPlausibleBayiriColor(csv.color)
      ? csv.name
      : color
        ? `Bayiri - ${toSentenceCase(item.description)} - ${toSentenceCase(color)}`
        : `Bayiri - ${toSentenceCase(item.description)}`;

    merged.push({
      ...csv,
      color,
      name,
      variants,
    });
  }

  return applyBrand(merged, context);
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const catalog = typeof files['main_csv'] === 'string' ? parseCatalogCsv(files['main_csv']) : [];
  const pdfProducts = pdfProductsFromFiles(files);

  if (pdfProducts.length > 0) {
    return mergeOrderWithCatalog(pdfProducts, catalog, context);
  }

  const ordered = catalog.filter((p) => p.variants.some((v) => v.quantity > 0));
  if (ordered.length > 0) return applyBrand(ordered, context);
  if (catalog.length > 0) return applyBrand(catalog, context);
  return [];
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as BayiriPdfProduct[];
  if (pdfProducts.length === 0) {
    return { products: [], message: 'Geen producten gevonden in de Bayiri PDF.' };
  }

  const productList = mergeOrderWithCatalog(pdfProducts, existingProducts, context);
  const totalVariants = productList.reduce((sum, p) => sum + p.variants.length, 0);
  const totalQty = productList.reduce(
    (sum, p) => sum + p.variants.reduce((q, v) => q + v.quantity, 0),
    0,
  );

  return {
    products: productList,
    message: `${productList.length} Bayiri producten gevonden (${totalVariants} varianten, ${totalQty} stuks).`,
  };
}

function extractStyleRef(filename: string): string | null {
  const match = filename.match(/^([a-z]+(?:\.[a-z]+)*\.\d{2}\.\d{2})/i);
  return match ? match[1].toLowerCase() : null;
}

const bayiriPlugin: SupplierPlugin = {
  id: 'bayiri',
  displayName: 'Bayiri',
  brandName: 'Bayiri',
  fileInputs: [
    {
      id: 'main_csv',
      label: 'Bayiri Order CSV',
      accept: '.csv,.xlsx',
      required: false,
      type: 'csv',
    },
    {
      id: 'pdf_invoice',
      label: 'Bayiri Factuur PDF',
      accept: '.pdf',
      required: true,
      type: 'pdf',
    },
  ],
  fileDetection: [
    {
      fileInputId: 'main_csv',
      detect: (text) =>
        /style\s*ref/i.test(text) &&
        /wholesale\s*price/i.test(text) &&
        STYLE_REF_RE.test(text),
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-bayiri-pdf',
  parse,
  processPdfResults,
  imageMatching: {
    strategy: 'reference',
    extractReference: (filename: string) => extractStyleRef(filename),
  },
  imageUpload: {
    enabled: true,
    instructions:
      'Upload productafbeeldingen. Bestandsnamen moeten beginnen met de style reference (bijv. sweater.baby.16.01.jpg).',
    exampleFilenames: [
      'sweater.baby.16.01.jpg',
      'cardigan.kid.12.08.jpg',
      'body.baby.01.01.jpg',
    ],
    filenameFilter: /\.(jpg|jpeg|png)$/i,
    extractReference: (filename: string) => extractStyleRef(filename),
    mapFilename: (_filename: string, reference: string) => {
      return `${reference} - Main.jpg`;
    },
  },
};

export default bayiriPlugin;
