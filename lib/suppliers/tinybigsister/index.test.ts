import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import tinybigsisterPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Tiny_Big_sister_AW2627_-_Order.csv');

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

describe('tinybigsister parse', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = tinybigsisterPlugin.parse({ main_csv: text }, context);

  it('groups rows into one product per reference (63 rows -> 17 products)', () => {
    expect(products).toHaveLength(17);
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(63);
  });

  it('parses the real color from Description, not the misleading "Color name" column', () => {
    const coat = products.find(p => p.reference === 'AW26-602');
    expect(coat).toBeTruthy();
    expect(coat!.color).toBe('Washed Blue');
    expect(coat!.name).toBe('Tiny Big Sister - Frills long coat - Washed blue');
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

  it('parses variants: size, ean, sku, quantity, price and rrp', () => {
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
