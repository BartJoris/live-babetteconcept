/**
 * CÎME supplier plugin.
 *
 * Opstart / bestelformulier PDF with product code, retail (incl. BTW),
 * purchase (excl. BTW), margin %, and order quantity.
 */

import { determineSizeAttribute } from '@/lib/import/shared/size-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  SupplierFiles,
  ParseContext,
  EnrichmentResult,
} from '@/lib/suppliers/types';
import type { CimePdfProduct } from './pdf';

function formatDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Cîme';
  if (/^c[iî]me\s*-/i.test(trimmed)) return trimmed;
  return `Cîme - ${trimmed}`;
}

function extractPdfProducts(pdfData: Record<string, unknown>): CimePdfProduct[] {
  const list = pdfData.products;
  if (!Array.isArray(list)) return [];
  return list as CimePdfProduct[];
}

export function processCimePdfResults(
  pdfData: Record<string, unknown>,
  _existing: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const rows = extractPdfProducts(pdfData);
  if (rows.length === 0) {
    return { products: [], message: 'Geen producten in CÎME PDF gevonden.' };
  }

  const brand = context.findBrand('cime', 'cîme', 'cîmé');
  const ordered = rows.filter((r) => (r.quantity || 0) > 0);
  const source = ordered.length > 0 ? ordered : rows;

  const products: ParsedProduct[] = source.map((item) => {
    const name = formatDisplayName(item.name);
    return {
      reference: item.reference,
      name,
      originalName: item.name,
      material: '',
      color: '',
      ecommerceDescription: name,
      variants: [
        {
          size: 'U',
          quantity: item.quantity || 0,
          ean: '',
          sku: item.reference,
          price: item.price,
          rrp: item.rrp,
        },
      ],
      suggestedBrand: brand?.name || 'Cîme',
      selectedBrand: brand,
      publicCategories: [],
      productTags: [],
      isFavorite: false,
      isPublished: true,
      sizeAttribute: 'Eén Maat',
      rrpSource: 'pdf',
    };
  });

  products.forEach((p) => {
    p.sizeAttribute = determineSizeAttribute(p.variants) || 'Eén Maat';
  });

  const skipped = rows.length - source.length;
  const message =
    `${products.length} CÎME producten geladen` +
    (skipped > 0 ? ` (${skipped} met order=0 overgeslagen)` : '') +
    '.';

  return { products, message };
}

const cimePlugin: SupplierPlugin = {
  id: 'cime',
  displayName: 'Cîme',
  brandName: 'Cîme',

  fileInputs: [
    {
      id: 'pdf_order',
      label: 'Opstart / bestelformulier PDF',
      accept: '.pdf',
      required: true,
      type: 'pdf',
    },
  ],

  serverSideFileInputs: ['pdf_order'],
  pdfParseEndpoint: '/api/parse-cime-pdf',

  parse(_files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
    return [];
  },

  processPdfResults: processCimePdfResults,
};

export default cimePlugin;
export { formatDisplayName };
