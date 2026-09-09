import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import tnsPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'order-3329034-20260909.csv');

const context: ParseContext = {
  brands: [{ id: 1, name: 'The New Society', source: 'test' }],
  vendorId: 'test-vendor',
  findBrand: () => ({ id: 1, name: 'The New Society', source: 'test' }),
};

describe('thenewsociety parse — Le New Black order CSV (FW26)', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = tnsPlugin.parse({ main_csv: text }, context);

  it('parses products from quoted CSV', () => {
    expect(products.length).toBeGreaterThan(0);
    console.log(`The New Society: ${products.length} products, ${products.reduce((s, p) => s + p.variants.length, 0)} variants`);
  });

  it('produces correct product names', () => {
    const first = products[0];
    expect(first.name).toContain('The New Society');
    expect(first.reference).toBeTruthy();
    expect(first.color).toBeTruthy();
    console.log(`First: ${first.name} (ref=${first.reference}, color=${first.color})`);
  });

  it('converts year sizes (12y → 12 jaar)', () => {
    const allSizes = products.flatMap(p => p.variants.map(v => v.size));
    const hasConvertedSizes = allSizes.some(s => s.includes('jaar'));
    expect(hasConvertedSizes).toBe(true);
    console.log('Sample sizes:', [...new Set(allSizes)].sort().join(', '));
  });

  it('parses prices and calculates RRP', () => {
    const first = products[0];
    const v = first.variants[0];
    expect(v.price).toBeGreaterThan(0);
    expect(v.rrp).toBeGreaterThan(0);
    expect(v.quantity).toBe(1);
    console.log(`Price: ${v.price}, RRP: ${v.rrp}`);
  });

  it('parses EAN codes', () => {
    const allEans = products.flatMap(p => p.variants.map(v => v.ean));
    const nonEmpty = allEans.filter(e => e);
    expect(nonEmpty.length).toBeGreaterThan(0);
  });
});
