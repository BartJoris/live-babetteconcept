import { mapSizeToOdooFormat, determineSizeAttribute } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

interface SundayCollectivePdfItem {
  sku: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  msrp: number;
  total: number;
}

/**
 * Sentence case but first word keeps its original casing, rest lowercase.
 * "Avenue Shorts" -> "Avenue shorts"
 */
function formatSundayCollectiveName(name: string): string {
  if (!name) return name;
  const words = name.split(' ');
  return words.map((word, idx) => (idx === 0 ? word : word.toLowerCase())).join(' ');
}

function processSundayCollectivePdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as SundayCollectivePdfItem[];
  if (!pdfProducts.length) return { products: [], message: 'No products found in PDF.' };

  const brand = context.findBrand('sunday collective', 'sunday');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfProducts) {
    const skuBase = item.sku.replace(/-\d{1,2}$/, '');
    const productKey = `${skuBase}-${item.color}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

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
        suggestedBrand: brand?.name || 'The Sunday Collective',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
        sizeAttribute: 'MAAT Kinderen',
      });
    }

    const product = products.get(productKey)!;

    // Use mapSizeToOdooFormat for adult sizes, raw for others
    const isAdult = /^(XXS|XS|S|M|L|XL|XXL)$/i.test(item.size.trim());
    const size = isAdult ? mapSizeToOdooFormat(item.size) : item.size;

    product.variants.push({
      size,
      ean: '',
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      rrp: item.msrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    if (!p.sizeAttribute) {
      p.sizeAttribute = determineSizeAttribute(p.variants);
    }
  });

  return {
    products: productList,
    message: `${productList.length} products loaded from Sunday Collective PDF. Barcodes are empty — fill manually.`,
  };
}

const sundayCollectivePlugin: SupplierPlugin = {
  id: 'sundaycollective',
  displayName: 'The Sunday Collective',
  brandName: 'The Sunday Collective',

  fileInputs: [
    { id: 'pdf_invoice', label: 'Sunday Collective PDF', accept: '.pdf', required: true, type: 'pdf' },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-sundaycollective-pdf',

  parse(_files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
    // PDF-only supplier — products are created via processPdfResults
    return [];
  },

  processPdfResults: processSundayCollectivePdfResults,
};

export default sundayCollectivePlugin;
