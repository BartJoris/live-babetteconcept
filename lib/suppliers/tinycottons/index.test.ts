import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import tinycottonsPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Tiny_Big_sister_AW2627_-_Order.csv');
const RRP_PATH = join(__dirname, 'samples', 'Tiny_RRP.csv');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Tiny Big sister', source: 'odoo' }],
  vendorId: 'test-vendor',
  findBrand: (...terms) => {
    const brands = [{ id: 1, name: 'Tiny Big sister', source: 'odoo' }];
    for (const term of terms) {
      const found = brands.find(b => b.name.toLowerCase().includes(term.toLowerCase()));
      if (found) return found;
    }
    return undefined;
  },
};

describe('tinycottons parse - order-confirmation export (Product reference + Description)', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = tinycottonsPlugin.parse({ main_csv: text }, context);

  it('groups rows into one product per reference (63 rows -> 17 products)', () => {
    expect(products).toHaveLength(17);
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(63);
  });

  it('parses the real color from Description, not the misleading "Color name" column', () => {
    const coat = products.find(p => p.reference === 'AW26-602');
    expect(coat).toBeTruthy();
    expect(coat!.color).toBe('Washed Blue');
    expect(coat!.name).toBe('Tiny Big sister - Frills long coat - Washed blue');
    expect(coat!.material).toBe('100% Wool');
    expect(coat!.csvCategory).toBe('Outerwear');
    expect(coat!.sizeAttribute).toBe('MAAT Volwassenen');
  });

  it('keeps two colorways of the same product name as separate products', () => {
    const grey = products.find(p => p.reference === 'AW26-844');
    const blue = products.find(p => p.reference === 'AW26-845');
    expect(grey?.color).toBe('Grey/Summer Red');
    expect(blue?.color).toBe('Washed Blue/Cacao');
    expect(grey?.originalName).toBe('Frank Striped Polo');
    expect(blue?.originalName).toBe('Frank Striped Polo');
  });

  it('parses variants: size, ean, sku, quantity, price and a fallback rrp (no RRP column in this export)', () => {
    const coat = products.find(p => p.reference === 'AW26-602')!;
    expect(coat.variants.map(v => v.size)).toEqual(['36', '38', '40', '42']);
    const first = coat.variants[0];
    expect(first.ean).toBe('8434525636666');
    expect(first.sku).toBe('AW26-602L150000361');
    expect(first.quantity).toBe(1);
    expect(first.price).toBeCloseTo(110.7);
    expect(first.rrp).toBeCloseTo(110.7 * 1.2);
  });

  it('handles one-size products', () => {
    const scarf = products.find(p => p.reference === 'AW26-700');
    expect(scarf).toBeTruthy();
    expect(scarf!.color).toBe('Vanilla');
    expect(scarf!.variants.map(v => v.size)).toEqual(['O/S']);
  });

  it('suggests the brand via findBrand', () => {
    const coat = products.find(p => p.reference === 'AW26-602')!;
    expect(coat.suggestedBrand).toBe('Tiny Big sister');
  });
});

describe('tinycottons parse - with separate RRP export (order-confirmation SRP file)', () => {
  const orderText = readFileSync(CSV_PATH, 'utf8');
  const rrpText = readFileSync(RRP_PATH, 'utf8');
  const products = tinycottonsPlugin.parse({ main_csv: orderText, rrp_csv: rrpText }, context);

  it('uses the real SRP from the RRP file instead of the 1.2x fallback', () => {
    const coat = products.find(p => p.reference === 'AW26-602')!;
    expect(coat.variants[0].price).toBeCloseTo(110.7);
    expect(coat.variants[0].rrp).toBe(299);
  });

  it('falls back to the 1.2x markup for the one style missing an SRP in the export', () => {
    const cardigan = products.find(p => p.reference === 'AW26-678')!;
    expect(cardigan.variants[0].rrp).toBeCloseTo(cardigan.variants[0].price * 1.2);
  });

  it('does not change grouping/variants compared to parsing without the RRP file', () => {
    expect(products).toHaveLength(17);
  });
});

describe('tinycottons parse - older catalog export (no Product reference/Description, has RRP)', () => {
  const oldFormatCsv = [
    'Order id;Season;Brand name;Category;Product name;Composition;Size name;EAN13;Quantity;Unit price;RRP',
    '3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;34;8434525598872;1;47,6;119',
    '3117410;SS26;Tinycottons;Shorts;Alma Fruits Short;100% cotton;36;8434525598889;1;47,6;119',
  ].join('\n');

  it('falls back to grouping by product name and uses the real RRP column', () => {
    const products = tinycottonsPlugin.parse({ main_csv: oldFormatCsv }, context);
    expect(products).toHaveLength(1);
    const short = products[0];
    expect(short.reference).toBe('Alma Fruits Short');
    expect(short.name).toBe('Tiny Big sister - Alma fruits short');
    expect(short.color).toBe('');
    expect(short.variants).toHaveLength(2);
    expect(short.variants[0].price).toBeCloseTo(47.6);
    expect(short.variants[0].rrp).toBeCloseTo(119);
  });
});
