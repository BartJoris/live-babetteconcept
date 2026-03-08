/**
 * Babe & Tess supplier plugin.
 * Order PDF from MINI B (Babe & Tess): product name, code, color, sizes, quantities.
 * Unit price is "prezzo un." in the PDF; verkoopprijs (RRP) = unit price × 2.7.
 */

import { determineSizeAttribute, convertSize } from '@/lib/import/shared';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext, EnrichmentResult } from '@/lib/suppliers/types';

export interface BabeAndTessPdfProduct {
  reference: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  rrp: number;
  ean?: string;
  sku?: string;
}

const RRP_MULTIPLIER = 2.7;

/**
 * Normaliseer kleur voor weergave: 065-LightRose → Light Rose, 001-Bianco → Bianco.
 * Strip cijferprefix, splits camelCase, title case.
 */
function normalizeColorName(color: string): string {
  if (!color || typeof color !== 'string') return '';
  const withoutPrefix = color.replace(/^\d+-/, '').trim();
  const withSpaces = withoutPrefix.replace(/([a-z])([A-Z])/g, '$1 $2');
  return withSpaces
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function processBabeAndTessPdfResults(
  pdfData: Record<string, unknown>,
  _existingProducts: ParsedProduct[],
  context: ParseContext
): EnrichmentResult {
  const pdfProducts = (pdfData.products || []) as BabeAndTessPdfProduct[];
  if (!pdfProducts.length) {
    return { products: [], message: 'Geen producten in PDF gevonden.' };
  }

  const brand = context.findBrand('babe', 'tess', 'babe & tess');
  const products = new Map<string, ParsedProduct>();

  for (const item of pdfProducts) {
    const ref = (item.reference || '').trim();
    const rawColor = (item.color || '').trim();
    const displayColor = normalizeColorName(rawColor) || rawColor;
    const productKey = `${ref}-${rawColor}`.toLowerCase().replace(/\s+/g, '-');
    const productName = `Babe & Tess - ${item.name || ref} - ${displayColor}`.trim();

    if (!products.has(productKey)) {
      products.set(productKey, {
        reference: ref,
        name: productName,
        originalName: item.name,
        color: displayColor,
        material: '',
        variants: [],
        suggestedBrand: brand?.name || 'Babe & Tess',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    const product = products.get(productKey)!;
    // API already returns "3 jaar", "24 maand" etc.; convertSize keeps standard forms consistent
    const size = item.size ? convertSize(item.size) : item.size;
    product.variants.push({
      size: size || '',
      ean: item.ean || '',
      sku: item.sku || undefined,
      quantity: item.quantity,
      price: item.price,
      rrp: item.rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach(p => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return {
    products: productList,
    message: `${productList.length} producten uit Babe & Tess PDF geladen. Verkoopprijs = aankoopprijs × ${RRP_MULTIPLIER}.`,
  };
}

const babeandtess: SupplierPlugin = {
  id: 'babeandtess',
  displayName: 'Babe & Tess',
  brandName: 'Babe & Tess',

  fileInputs: [
    { id: 'pdf_invoice', label: 'Order PDF (z_ordine-xxx.pdf)', accept: '.pdf', required: true, type: 'pdf' },
  ],

  serverSideFileInputs: ['pdf_invoice'],
  pdfParseEndpoint: '/api/parse-babeandtess-pdf',

  parse(_files: SupplierFiles, _context: ParseContext): ParsedProduct[] {
    return [];
  },

  processPdfResults: processBabeAndTessPdfResults,
};

export default babeandtess;
