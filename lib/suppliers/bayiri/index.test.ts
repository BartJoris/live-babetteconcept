import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '@/lib/pdf/extractText';
import bayiriPlugin from './index';
import { extractBayiriLayoutItems } from './pdf-layout';
import { extractBayiriProductsFromLayout, type BayiriLayoutItem } from './pdf';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'AW26-ORDER-Babette.csv');
const LAYOUT_PATH = join(__dirname, 'samples', 'AW26W12-0901-layout.json');
const PDF_PATH = join(__dirname, 'samples', 'AW26W12-0901-Babette.pdf');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Bayiri', source: 'odoo' }],
  vendorId: 'test-vendor',
  findBrand: (...terms) => {
    const brands = [{ id: 1, name: 'Bayiri', source: 'odoo' }];
    for (const term of terms) {
      const found = brands.find((b) => b.name.toLowerCase().includes(term.toLowerCase()));
      if (found) return found;
    }
    return undefined;
  },
};

describe('bayiri PDF extract - AW26W12 order form', () => {
  const layout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')) as BayiriLayoutItem[];
  const items = extractBayiriProductsFromLayout(layout);

  it('finds the 11 ordered style refs', () => {
    expect(items.map((p) => p.styleRef)).toEqual([
      'cardigan.baby.16.01',
      'dungaree.baby.11.01',
      'beanie.kid.16.33',
      'cardigan.kid.17.33',
      'pants.kid.22.33',
      'blanket.baby.24.33',
      'cardigan.kid.18.23',
      'sweater.kid.17.34',
      'pants.kid.21.34',
      'sweater.kid.17.35',
      'pants.kid.21.35',
    ]);
  });

  it('reads wholesale and total pieces, not line-total as RRP', () => {
    const cardigan = items.find((p) => p.styleRef === 'cardigan.baby.16.01')!;
    expect(cardigan.wholesalePrice).toBeCloseTo(30);
    expect(cardigan.totalWholesale).toBeCloseTo(60);
    expect(cardigan.suggestedPvp).toBe(0);
    expect(cardigan.totalPieces).toBe(2);
  });

  it('keeps blankets as one-size instead of inventing 2Y/3Y', () => {
    const blanket = items.find((p) => p.styleRef === 'blanket.baby.24.33')!;
    expect(blanket.sizes).toEqual([{ size: 'U', quantity: 2 }]);
  });

  it('maps filled size columns to separate variants (3M + 6M)', () => {
    const cardigan = items.find((p) => p.styleRef === 'cardigan.baby.16.01')!;
    expect(cardigan.sizes).toEqual([
      { size: '3M', quantity: 1 },
      { size: '6M', quantity: 1 },
    ]);
  });

  it('reads description and color from their own columns, not the rest of the row', () => {
    const cardigan = items.find((p) => p.styleRef === 'cardigan.baby.16.01')!;
    expect(cardigan.description).toBe('SLOTH CARDIGAN');
    expect(cardigan.color).toBe('MILK');
  });

  it('maps beanie accessory columns 0-6M and 6-12M', () => {
    const beanie = items.find((p) => p.styleRef === 'beanie.kid.16.33')!;
    expect(beanie.sizes).toEqual([
      { size: '0-6M', quantity: 1 },
      { size: '6-12M', quantity: 1 },
    ]);
  });
});

describe('bayiri parse - catalog CSV + order PDF', () => {
  const csv = readFileSync(CSV_PATH, 'utf8');
  const pdfItems = extractBayiriProductsFromLayout(
    JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')) as BayiriLayoutItem[],
  );
  const products = bayiriPlugin.parse(
    { main_csv: csv, pdf_invoice: JSON.stringify({ products: pdfItems }) },
    context,
  );

  it('keeps only the ordered lines (11), not the full catalog (60)', () => {
    expect(products).toHaveLength(11);
  });

  it('uses CSV name, color, composition and suggested PVP', () => {
    const cardigan = products.find((p) => p.reference === 'cardigan.baby.16.01');
    expect(cardigan).toBeTruthy();
    expect(cardigan!.name).toBe('Bayiri - Sloth cardigan - Milk');
    expect(cardigan!.color).toBe('MILK');
    expect(cardigan!.material).toBe('100% Organic Cotton');
    expect(cardigan!.suggestedBrand).toBe('Bayiri');
    expect(cardigan!.variants[0].price).toBeCloseTo(30);
    expect(cardigan!.variants[0].rrp).toBeCloseTo(75);
    expect(cardigan!.variants.map((v) => ({ size: v.size, quantity: v.quantity }))).toEqual([
      { size: '3 maand', quantity: 1 },
      { size: '6 maand', quantity: 1 },
    ]);
  });

  it('imports the moons blanket as unit size with qty 2', () => {
    const blanket = products.find((p) => p.reference === 'blanket.baby.24.33')!;
    expect(blanket.variants).toHaveLength(1);
    expect(blanket.variants[0].size).toBe('U');
    expect(blanket.variants[0].quantity).toBe(2);
    expect(blanket.variants[0].rrp).toBeCloseTo(110);
  });

  it('keeps 21 ordered size lines instead of collapsing each product to one variant', () => {
    const variantCount = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(variantCount).toBe(21);
  });
});

describe('bayiri processPdfResults - PDF only fallback', () => {
  const pdfItems = extractBayiriProductsFromLayout(
    JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')) as BayiriLayoutItem[],
  );
  const result = bayiriPlugin.processPdfResults!(
    { products: pdfItems },
    [],
    context,
  );

  it('still builds products when no CSV is present', () => {
    expect(result.products).toHaveLength(11);
    expect(result.products[0].variants[0].price).toBeGreaterThan(0);
    const cardigan = result.products.find((p) => p.reference === 'cardigan.baby.16.01')!;
    expect(cardigan.variants).toHaveLength(2);
    expect(cardigan.color).toBe('MILK');
  });
});

describe('bayiri PDF layout from the real order file', () => {
  it('reads 3M and 6M from the cardigan row', async () => {
    const pdf = readFileSync(PDF_PATH);
    const layout = await extractBayiriLayoutItems(pdf);
    const items = extractBayiriProductsFromLayout(layout);
    const cardigan = items.find((p) => p.styleRef === 'cardigan.baby.16.01');
    expect(cardigan?.sizes).toEqual([
      { size: '3M', quantity: 1 },
      { size: '6M', quantity: 1 },
    ]);
  });

  it('still reads size columns after the same buffer was used for text extract', async () => {
    const pdf = readFileSync(PDF_PATH);
    await extractPdfText(pdf);
    const layout = await extractBayiriLayoutItems(pdf);
    const items = extractBayiriProductsFromLayout(layout);
    const cardigan = items.find((p) => p.styleRef === 'cardigan.baby.16.01');
    expect(cardigan?.sizes).toHaveLength(2);
  });
});

describe('bayiri Winter 26 files from iCloud', () => {
  const dir = join(
    '/Users/bajoris/Library/Mobile Documents/com~apple~CloudDocs/Babette Bart',
    'Bayiri - Winter 26',
  );

  it('detects CSV + PDF as Bayiri, not Wyncken', async () => {
    const { readdirSync, existsSync } = await import('fs');
    if (!existsSync(dir)) return;
    const names = readdirSync(dir);
    const csvName = names.find((n) => n.toLowerCase().endsWith('.csv'));
    const pdfName = names.find((n) => n.toLowerCase().endsWith('.pdf'));
    expect(csvName).toBeTruthy();
    expect(pdfName).toBeTruthy();

    const { detectCSV, detectPDF } = await import('@/pages/api/detect-supplier');
    const csv = detectCSV('csv', csvName!, readFileSync(join(dir, csvName!), 'utf8'));
    const pdf = detectPDF('pdf', pdfName!);

    expect(csv.bestMatch?.supplierId).toBe('bayiri');
    expect(pdf.bestMatch?.supplierId).toBe('bayiri');
    expect(pdf.matches.some((m) => m.supplierId === 'wyncken')).toBe(false);
  });

  it('parses 11 products and 21 size variants', async () => {
    const { readdirSync, existsSync } = await import('fs');
    if (!existsSync(dir)) return;
    const names = readdirSync(dir);
    const csvName = names.find((n) => n.toLowerCase().endsWith('.csv'));
    const pdfName = names.find((n) => n.toLowerCase().endsWith('.pdf'));
    const csv = readFileSync(join(dir, csvName!), 'utf8');
    const layout = await extractBayiriLayoutItems(readFileSync(join(dir, pdfName!)));
    const pdfItems = extractBayiriProductsFromLayout(layout);
    const products = bayiriPlugin.parse(
      { main_csv: csv, pdf_invoice: JSON.stringify({ products: pdfItems }) },
      context,
    );
    const variantCount = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(products).toHaveLength(11);
    expect(variantCount).toBe(21);
    expect(
      products.find((p) => p.reference === 'cardigan.baby.16.01')?.variants.map((v) => v.size),
    ).toEqual(['3 maand', '6 maand']);
  });
});
