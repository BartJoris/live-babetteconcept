import { determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  EnrichmentResult,
  SupplierFiles,
  ParseContext,
} from '@/lib/suppliers/types';
import type { DrBloomItem } from '@/pages/api/parse-drbloom-pdf';

const RRP_MULTIPLIER = 2.7;

const SIZE_SUFFIXES: Record<string, string> = {
  SM: 'S / M',
  ML: 'M / L',
  U: 'U',
};

/**
 * Extract size token from the end of a Dr Bloom item name.
 *
 * "Jersey Chiringuito Azul ML" → { name: "Jersey Chiringuito Azul", size: "M" }
 * "Nautico Nispero Camel 37"  → { name: "Nautico Nispero Camel", size: "37" }
 * "Gafas Sombra Azul U"      → { name: "Gafas Sombra Azul", size: "U" }
 */
function extractNameAndSize(itemName: string): { productName: string; size: string } {
  const trimmed = itemName.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { productName: trimmed, size: 'U' };

  const lastToken = trimmed.substring(lastSpace + 1);
  const baseName = trimmed.substring(0, lastSpace).trim();

  if (SIZE_SUFFIXES[lastToken.toUpperCase()]) {
    return { productName: baseName, size: SIZE_SUFFIXES[lastToken.toUpperCase()] };
  }

  if (/^\d{2,3}$/.test(lastToken)) {
    return { productName: baseName, size: lastToken };
  }

  return { productName: trimmed, size: 'U' };
}

function buildProducts(
  items: DrBloomItem[],
  context: ParseContext,
): ParsedProduct[] {
  const brand = context.findBrand('dr bloom', 'drbloom', 'bloom');
  const products = new Map<string, ParsedProduct>();

  for (const item of items) {
    const { productName, size } = extractNameAndSize(item.itemName);
    const groupKey = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const rrp = Math.round(item.unitPrice * RRP_MULTIPLIER);

    if (!products.has(groupKey)) {
      products.set(groupKey, {
        reference: groupKey,
        name: `Dr Bloom - ${toSentenceCase(productName)}`,
        originalName: productName,
        material: '',
        color: '',
        ecommerceDescription: item.description || toSentenceCase(productName),
        variants: [],
        suggestedBrand: brand?.name,
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(groupKey)!;

    if (!product.ecommerceDescription || product.ecommerceDescription === toSentenceCase(productName)) {
      if (item.description) {
        product.ecommerceDescription = item.description;
      }
    }

    product.variants.push({
      size,
      ean: item.code,
      sku: item.code,
      quantity: item.units,
      price: item.unitPrice,
      rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
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
  const pdfItems = (pdfData.products || []) as DrBloomItem[];
  if (pdfItems.length === 0) {
    return { products: [], message: 'Geen producten gevonden in de Dr Bloom PDF.' };
  }

  const productList = buildProducts(pdfItems, context);
  const totalVariants = productList.reduce((sum, p) => sum + p.variants.length, 0);
  const totalQty = pdfItems.reduce((sum, i) => sum + i.units, 0);

  return {
    products: productList,
    message: `${productList.length} Dr Bloom producten gevonden (${totalVariants} varianten, ${totalQty} stuks). Verkoopprijs = inkoopprijs × ${RRP_MULTIPLIER}.`,
  };
}

const drbloomPlugin: SupplierPlugin = {
  id: 'drbloom',
  displayName: 'Dr Bloom',
  brandName: 'Dr Bloom',
  fileInputs: [
    {
      id: 'pdf_invoice',
      label: 'Dr Bloom Proforma PDF',
      accept: '.pdf',
      required: true,
      type: 'pdf',
    },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-drbloom-pdf',
  parse,
  processPdfResults,
  imageUpload: {
    enabled: true,
    instructions:
      'Upload productafbeeldingen uit de Dr Bloom map. Bestandsnamen (bijv. A11343.jpg) worden niet automatisch gekoppeld — wijs ze handmatig toe aan producten.',
    exampleFilenames: ['A11343.jpg', 'B22821.jpg', 'C33816.jpg'],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: () => null,
    mapFilename: (filename: string, reference: string) => {
      return `${reference} - ${filename}`;
    },
  },
};

export default drbloomPlugin;
