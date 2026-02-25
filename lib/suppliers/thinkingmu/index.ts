import { determineSizeAttribute, mapSizeToOdooFormat, toSentenceCase } from '@/lib/import/shared';
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

function parse(_files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
  // Thinking Mu uses PDF only - products come through processPdfResults
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

  const suggestedBrand = context.findBrand('thinking', 'mu');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfProducts) {
    const productKey = `${item.styleCode}-${item.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const formattedName = toSentenceCase(item.name);

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: item.styleCode,
        name: `Thinking Mu - ${formattedName}`,
        originalName: formattedName,
        color: '',
        material: '',
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

    product.variants.push({
      size: mappedSize,
      ean: item.barcode,
      sku: `${item.styleCode}-${item.size}`,
      quantity: item.quantity,
      price: item.price,
      rrp: item.price * 2.5,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(product => {
    product.sizeAttribute = determineSizeAttribute(product.variants);
  });

  return { products: productList };
}

const thinkingMuPlugin: SupplierPlugin = {
  id: 'thinkingmu',
  displayName: 'Thinking Mu',
  brandName: 'Thinking Mu',
  fileInputs: [
    { id: 'pdf_invoice', label: 'Thinking Mu PDF', accept: '.pdf', required: true, type: 'pdf' },
  ],
  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-thinkingmu-pdf',
  parse,
  processPdfResults,
};

export default thinkingMuPlugin;
