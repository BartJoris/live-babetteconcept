/**
 * Grace & Mila supplier plugin.
 *
 * Import method: Invoice PDF from Fabrik Agency.
 * Invoice lines contain model, category, wholesale/RRP prices, size and color.
 * Adult sizes (XS–XL) are mapped to Odoo format with EU number suffix.
 */

import { determineSizeAttribute, mapSizeToOdooFormat } from '@/lib/import/shared';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type {
  SupplierPlugin,
  ParsedProduct,
  SupplierFiles,
  ParseContext,
  EnrichmentResult,
} from '@/lib/suppliers/types';
import type { GraceAndMilaInvoiceLine } from './pdf';

function buildProductKey(model: string, color: string): string {
  return `${model}_${color}`.toLowerCase().replace(/\s+/g, '-');
}

function convertSize(raw: string): string {
  if (!raw) return 'U';
  return mapSizeToOdooFormat(raw.trim());
}

function processGraceAndMilaPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext,
): EnrichmentResult {
  const lines = (pdfData.products || []) as GraceAndMilaInvoiceLine[];
  if (!lines.length) {
    return { products: [], message: 'Geen producten in PDF gevonden.' };
  }

  const brand = context.findBrand('grace', 'mila', 'grace & mila');
  const products = new Map<string, ParsedProduct>();

  for (const line of lines) {
    const key = buildProductKey(line.model, line.color);
    const colorDisplay = toSentenceCase(line.color);
    const size = convertSize(line.size);

    if (!products.has(key)) {
      const formattedName = `Grace & Mila - ${toSentenceCase(line.model)} - ${colorDisplay}`;

      products.set(key, {
        reference: line.model.toUpperCase(),
        name: formattedName,
        originalName: line.model,
        color: colorDisplay,
        material: '',
        csvCategory: line.category,
        ecommerceDescription: formattedName,
        variants: [],
        suggestedBrand: brand?.name || 'Grace & Mila',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    products.get(key)!.variants.push({
      size,
      quantity: line.quantity,
      ean: '',
      price: line.price,
      rrp: line.rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
    // Adult sizes mapped to "XS - 34" format aren't detected by determineSizeAttribute;
    // override when any variant has a letter-size prefix.
    if (p.variants.some(v => /^(XXS|XS|S|M|L|XL|XXL)\s*-/i.test(v.size))) {
      p.sizeAttribute = 'MAAT Volwassenen';
    }
  });

  return {
    products: productList,
    message: `${productList.length} producten uit Grace & Mila factuur geladen.`,
  };
}

const graceandmila: SupplierPlugin = {
  id: 'graceandmila',
  displayName: 'Grace & Mila',
  brandName: 'Grace & Mila',

  fileInputs: [
    { id: 'pdf_invoice', label: 'Factuur PDF (Fabrik Agency)', accept: '.pdf', required: true, type: 'pdf' },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-graceandmila-pdf',

  parse(_files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
    return [];
  },

  processPdfResults: processGraceAndMilaPdfResults,
};

export default graceandmila;
