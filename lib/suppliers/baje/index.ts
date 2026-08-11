/**
 * Baje (Baje studio) supplier plugin.
 *
 * CSV structure (Dutch "Verkooporder" export, ; delimited) — same family as
 * Nixnut, with a shorter column set:
 *   Artikelnummer;Artikel;Kleur;Kleurnummer;Maat;Aantal;Inhoud;
 *   Prijs per stuk;Totaal;Adviesprijs;Barcode
 *
 * The header row repeats before every product block. Article codes are long
 * (BAAW2700003) and the same code appears in multiple colors, so the
 * Kleurnummer is folded into `reference` to keep products unique — matching
 * the image filenames (BAAW2700003-295-144-40.png → BAAW2700003-295).
 */

import { parseCSV } from '@/lib/import/shared/csv-utils';
import { parseEuroPrice } from '@/lib/import/shared/price-utils';
import { convertSize, determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toSentenceCase } from '@/lib/import/shared/name-utils';
import type { SupplierPlugin, ParsedProduct, SupplierFiles, ParseContext } from '@/lib/suppliers/types';

/** Baje article codes: BA… followed by digits (BAAW2700003, …). */
const ARTICLE_CODE_RE = /^BA[A-Z0-9]*\d+$/i;

function buildReference(articleCode: string, colorNumber: string): string {
  const code = articleCode.trim().toUpperCase();
  const color = colorNumber.trim();
  return color ? `${code}-${color}` : code;
}

function parse(files: SupplierFiles, context: ParseContext): ParsedProduct[] {
  const text = files['main_csv'] as string;
  if (!text) return [];

  const { rows } = parseCSV(text, { delimiter: ';', hasHeader: false });
  if (rows.length === 0) return [];

  const brand = context.findBrand('baje', 'baje studio');
  const products = new Map<string, ParsedProduct>();

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
    const colorNumber = get('kleurnummer');
    const size = get('maat');
    const quantity = parseInt(get('aantal'), 10) || 0;
    const price = parseEuroPrice(get('prijs per stuk'));
    const rrp = parseEuroPrice(get('adviesprijs'));
    const ean = get('barcode');

    if (!articleCode || !articleName) continue;

    const reference = buildReference(articleCode, colorNumber);

    if (!products.has(reference)) {
      const colorFormatted = colorDisplay ? toSentenceCase(colorDisplay) : '';
      products.set(reference, {
        reference,
        name: `Baje - ${toSentenceCase(articleName)}${colorFormatted ? ` - ${colorFormatted}` : ''}`,
        originalName: articleName,
        productName: articleCode,
        material: '',
        color: colorFormatted,
        variants: [],
        suggestedBrand: brand?.name || 'Baje',
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
 * "BAAW2700003-295-144-40.png" → "BAAW2700003-295"
 * (article + Kleurnummer; ignores the internal photo-set id and sequence).
 */
function extractBajeImageReference(filename: string): string | null {
  const base = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const match = base.match(/^(BA[A-Z0-9]*\d+)-(\d+)-\d+-\d+$/i);
  if (!match) return null;
  return buildReference(match[1], match[2]);
}

const bajePlugin: SupplierPlugin = {
  id: 'baje',
  displayName: 'Baje',
  brandName: 'Baje',

  fileInputs: [
    { id: 'main_csv', label: 'Baje Verkooporder CSV', accept: '.csv', required: true, type: 'csv' },
  ],

  parse,

  imageMatching: {
    strategy: 'reference',
    extractReference: extractBajeImageReference,
  },

  imageUpload: {
    enabled: true,
    instructions:
      "Upload productafbeeldingen. Bestandsnamen bestaan uit Artikelnummer-Kleurnummer-set-volgnummer (bijv. BAAW2700003-295-144-40.png). Meerdere foto's per artikel+kleur worden automatisch gegroepeerd.",
    exampleFilenames: [
      'BAAW2700003-295-144-40.png',
      'BAAW2700003-295-144-41.jpg',
      'BAAW2700084-276-215-37.png',
    ],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    extractReference: extractBajeImageReference,
  },
};

export default bajePlugin;
