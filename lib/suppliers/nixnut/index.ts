/**
 * Nixnut supplier plugin.
 *
 * CSV structure (Dutch "Verkooporder" export, ; delimited):
 * - Metadata rows at the top (JOVE BV / Nixnut BV address block, order info).
 * - The column header row repeats before every product block:
 *   Artikelnummer;Artikel;Kleur;Kleurnummer;Maat;Maat 2;Aantal;Inhoud;
 *   Prijs per stuk;Totaal;Adviesprijs;Barcode;Goederencode;
 *   Land van herkomst;Kwaliteit;Materialen
 * - Data rows follow, one per size/color combo. Blank lines and a footer
 *   (Stuks/Goederentotaal/...) separate/close the blocks.
 *
 * Nixnut reuses the same Artikelnummer (e.g. HA002) across multiple colors,
 * so the color is folded into `reference` to keep it unique per product —
 * matching how the image filenames identify a product (see below).
 */

import { parseCSV } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

/** Nixnut article codes: 2 letters + 2-4 digits (HA002, ON902, VE003, ...). */
const ARTICLE_CODE_RE = /^[A-Z]{2}\d{2,4}$/i;

function buildReference(articleCode: string, colorName: string): string {
  const colorSlug = colorName.trim().toUpperCase().replace(/\s+/g, ' ');
  return colorSlug ? `${articleCode}-${colorSlug}` : articleCode;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { rows } = parseCSV(text, { delimiter: ';', hasHeader: false });
  if (rows.length === 0) return [];

  const brand = context.findBrand('nixnut');
  const products = new Map<string, ParsedProduct>();

  // The header row repeats before every block, so re-derive column indices
  // each time one is encountered instead of assuming a fixed layout.
  let col: Record<string, number> | null = null;

  for (const cells of rows) {
    const first = (cells[0] || '').trim();

    if (first.toLowerCase() === 'artikelnummer') {
      col = {};
      cells.forEach((header, idx) => {
        col![header.trim().toLowerCase()] = idx;
      });
      continue;
    }

    if (!col || !ARTICLE_CODE_RE.test(first)) continue;

    const get = (name: string): string => {
      const idx = col![name];
      return idx !== undefined ? (cells[idx] || '').trim() : '';
    };

    const articleCode = first.toUpperCase();
    const articleName = get('artikel');
    const colorDisplay = get('kleur');
    const rawSize = get('maat');
    const rawSize2 = get('maat 2');
    const size = rawSize2 || rawSize;
    const quantity = parseInt(get('aantal'), 10) || 0;
    const price = parseEuroPrice(get('prijs per stuk'));
    const rrp = parseEuroPrice(get('adviesprijs'));
    const ean = get('barcode');
    const material = get('materialen') || get('kwaliteit');

    if (!articleCode || !articleName) continue;

    const reference = buildReference(articleCode, colorDisplay);

    if (!products.has(reference)) {
      const colorFormatted = colorDisplay ? toSentenceCase(colorDisplay) : '';
      products.set(reference, {
        reference,
        name: `Nixnut - ${toSentenceCase(articleName)}${colorFormatted ? ` - ${colorFormatted}` : ''}`,
        originalName: articleName,
        productName: articleCode,
        material,
        color: colorFormatted,
        ecommerceDescription: material || undefined,
        variants: [],
        suggestedBrand: brand?.name || 'Nixnut',
        selectedBrand: brand,
        publicCategories: [],
        productTags: [],
        isFavorite: false,
        isPublished: true,
      });
    }

    products.get(reference)!.variants.push({
      size: convertSize(size),
      quantity,
      ean,
      price,
      rrp,
    });
  }

  const productList = Array.from(products.values());
  productList.forEach((p) => {
    p.sizeAttribute = determineSizeAttribute(p.variants);
  });

  return productList;
}

/**
 * Extract "<Artikelnummer>-<KLEUR>" from a Nixnut image filename.
 * "HA002-OFF WHITE-33-13.jpg" -> "HA002-OFF WHITE" (code-color, ignores the
 * internal Nixnut color code "33" and the trailing sequence number "13" —
 * neither appears in the order CSV, only the color name does).
 */
function extractNixnutImageReference(filename: string): string | null {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const match = base.match(/^([A-Z]{2}\d{2,4})-(.+?)-\d+-\d+$/i);
  if (!match) return null;
  return buildReference(match[1], match[2]);
}

const nixnutPlugin: SupplierPlugin = {
  id: 'nixnut',
  displayName: 'Nixnut',
  brandName: 'Nixnut',

  fileInputs: [
    { id: 'main_csv', label: 'Nixnut Verkooporder CSV', accept: '.csv', required: true, type: 'csv' },
  ],

  parse,

  imageMatching: {
    strategy: 'reference',
    extractReference: extractNixnutImageReference,
  },

  imageUpload: {
    enabled: true,
    instructions:
      'Upload productafbeeldingen. Bestandsnamen bestaan uit Artikelnummer-KLEUR-kleurcode-volgnummer (bijv. HA002-OFF WHITE-33-13.jpg). Meerdere foto\'s per artikel+kleur worden automatisch gegroepeerd.',
    exampleFilenames: [
      'HA002-OFF WHITE-33-13.jpg',
      'HA002-OFF WHITE-33-14.jpg',
      'ON902-SNOW-166-18.jpg',
    ],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: extractNixnutImageReference,
  },
};

export default nixnutPlugin;
