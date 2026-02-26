import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';

interface BayiriPdfProduct {
  styleRef: string;
  description: string;
  color: string;
  section: string;
  sizes: Array<{ size: string; quantity: number }>;
  totalPieces: number;
  wholesalePrice: number;
  totalWholesale: number;
  suggestedPvp: number;
}

function convertBayiriSize(size: string): string {
  if (!size) return size;
  const s = size.trim();

  if (/^\d{1,2}M$/i.test(s)) return s.replace(/M$/i, ' maand');
  if (/^\d+-\d+M$/i.test(s)) {
    const match = s.match(/(\d+)-(\d+)M/i);
    return match ? `${match[2]} maand` : s;
  }
  if (/^\d+Y$/i.test(s)) return s.replace(/Y$/i, ' jaar');
  if (/^\d+-\d+Y$/i.test(s)) {
    const match = s.match(/(\d+)-(\d+)Y/i);
    return match ? `${match[2]} jaar` : s;
  }
  if (/^ONE\s*SIZE$/i.test(s)) return 'U';

  return convertSize(s);
}

function buildProducts(
  pdfProducts: BayiriPdfProduct[],
  context: ParseContext,
): ParsedProduct[] {
  const suggestedBrand = context.findBrand('bayiri', 'bayíri');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfProducts) {
    const productKey = item.styleRef.toLowerCase();
    const nameFormatted = toSentenceCase(item.description);
    const colorFormatted = toSentenceCase(item.color);

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: item.styleRef,
        name: colorFormatted
          ? `Bayiri - ${nameFormatted} - ${colorFormatted}`
          : `Bayiri - ${nameFormatted}`,
        originalName: item.description,
        material: '',
        color: item.color,
        ecommerceDescription: nameFormatted,
        csvCategory: item.section,
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

    if (item.sizes.length > 0) {
      for (const s of item.sizes) {
        const mappedSize = convertBayiriSize(s.size);
        product.variants.push({
          size: mappedSize,
          ean: '',
          sku: `${item.styleRef}-${s.size}`,
          quantity: s.quantity,
          price: item.wholesalePrice,
          rrp: item.suggestedPvp,
        });
      }
    } else if (item.totalPieces > 0) {
      product.variants.push({
        size: 'U',
        ean: '',
        sku: item.styleRef,
        quantity: item.totalPieces,
        price: item.wholesalePrice,
        rrp: item.suggestedPvp,
      });
    }
  }

  const productList = Array.from(products.values());
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return productList;
}

function parse(_files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
  return [];
}

function processPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as BayiriPdfProduct[];
  if (pdfProducts.length === 0) {
    return { products: [], message: 'Geen producten gevonden in de Bayiri PDF.' };
  }

  const productList = buildProducts(pdfProducts, context);

  const totalVariants = productList.reduce((sum, p) => sum + p.variants.length, 0);
  const message = `${productList.length} Bayiri producten gevonden (${totalVariants} varianten).`;

  return { products: productList, message };
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
      id: 'pdf_invoice',
      label: 'Bayiri Factuur PDF',
      accept: '.pdf',
      required: true,
      type: 'pdf',
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
