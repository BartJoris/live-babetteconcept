import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import boekenPlugin, { isBoekenPricesCSV, parseBoekenCSV } from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Babette_resterende_boeken_Odoo.csv');

const context: ParseContext = {
  brands: [
    { id: 1, name: 'Oogappel', source: 'odoo' },
    { id: 2, name: 'Usborne', source: 'odoo' },
    { id: 3, name: 'Leopold', source: 'odoo' },
  ],
  vendorId: 'boeken',
  findBrand: (...terms) => {
    const brands = [
      { id: 1, name: 'Oogappel', source: 'odoo' },
      { id: 2, name: 'Usborne', source: 'odoo' },
      { id: 3, name: 'Leopold', source: 'odoo' },
    ];
    for (const term of terms) {
      const found = brands.find((b) =>
        b.name.toLowerCase().includes(term.toLowerCase()),
      );
      if (found) return found;
    }
    return undefined;
  },
};

describe('boeken CSV detection', () => {
  const text = readFileSync(CSV_PATH, 'utf8');

  it('detects the Babette boeken export headers', () => {
    expect(isBoekenPricesCSV(text)).toBe(true);
    expect(isBoekenPricesCSV('SKU;Name;Price\n1;x;2')).toBe(false);
  });
});

describe('boeken parse', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = parseBoekenCSV(text, context);

  it('parses all 26 remaining books', () => {
    expect(products).toHaveLength(26);
    expect(boekenPlugin.parse({ main_csv: text }, context)).toHaveLength(26);
  });

  it('uses ISBN as reference/EAN and publisher in the name', () => {
    const book = products.find((p) => p.reference === '9789002286957');
    expect(book).toBeTruthy();
    expect(book!.name).toBe('Oogappel - Een boekje over kunst – Kleuren');
    expect(book!.originalName).toBe('Een boekje over kunst – Kleuren');
    expect(book!.suggestedBrand).toBe('Oogappel');
    // Uitgeverij is auto-selected later in the wizard against Odoo values
    expect(book!.selectedBrand).toBeUndefined();
    expect(book!.variants[0].ean).toBe('9789002286957');
    expect(book!.variants[0].size).toBe('U');
    expect(book!.variants[0].quantity).toBe(1);
    expect(book!.variants[0].price).toBeCloseTo(9.05);
    expect(book!.variants[0].rrp).toBeCloseTo(15.99);
  });

  it('keeps BTW 6%, weight, Uitgeverij attribute, categories and ecommerce paths', () => {
    const book = products.find((p) => p.reference === '9789002286957')!;
    expect(book.taxRate).toBe(6);
    expect(book.weight).toBeCloseTo(0.2);
    expect(book.brandAttributeName).toBe('Uitgeverij');
    expect(boekenPlugin.brandAttributeName).toBe('Uitgeverij');
    expect(book.csvInternalCategory).toBe('All / Speelgoed / Boeken');
    expect(book.csvPublicCategoryPaths).toEqual([
      'Speelgoed / Boeken',
      'Speelgoed / Op leeftijd / 3 jaar',
      'Speelgoed / Op leeftijd / 4–5 jaar',
    ]);
    expect(book.csvProductTagNames).toEqual(['klantenkaart']);
    expect(book.ecommerceDescription).toMatch(/Kleine handjes/i);
  });

  it('covers multiple publishers including ones without a preloaded brand', () => {
    const publishers = new Set(products.map((p) => p.suggestedBrand));
    expect(publishers.has('Usborne')).toBe(true);
    expect(publishers.has('Infodok')).toBe(true);
    expect(publishers.has('Ballon Kids')).toBe(true);

    const infodok = products.find((p) => p.suggestedBrand === 'Infodok');
    expect(infodok?.selectedBrand).toBeUndefined();
  });
});
