import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import babeandtessPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'order-3215528-20260909.csv');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Babe & Tess', source: 'test' }],
  vendorId: 'test-vendor',
  findBrand: () => ({ id: 1, name: 'Babe & Tess', source: 'test' }),
};

describe('babeandtess parse — Le New Black order CSV (FW26)', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = babeandtessPlugin.parse({ main_csv: text }, context);

  it('parses products from quoted CSV', () => {
    expect(products.length).toBeGreaterThan(0);
    console.log(`Babe & Tess: ${products.length} products, ${products.reduce((s, p) => s + p.variants.length, 0)} variants`);
  });

  it('produces correct product names', () => {
    const first = products[0];
    expect(first.name).toContain('Babe & Tess');
    expect(first.reference).toBeTruthy();
    expect(first.color).toBeTruthy();
    console.log(`First: ${first.name} (ref=${first.reference}, color=${first.color})`);
  });

  it('converts Italian sizes (3A → 3 jaar, 3M → 3 maand)', () => {
    const allSizes = products.flatMap(p => p.variants.map(v => v.size));
    const hasBabySizes = allSizes.some(s => s.includes('maand'));
    const hasKidSizes = allSizes.some(s => s.includes('jaar'));
    expect(hasBabySizes).toBe(true);
    expect(hasKidSizes).toBe(true);
    console.log('Sample sizes:', [...new Set(allSizes)].sort().join(', '));
  });

  it('parses prices and calculates RRP with 2.7 multiplier', () => {
    const first = products[0];
    const v = first.variants[0];
    expect(v.price).toBeGreaterThan(0);
    expect(v.rrp).toBeCloseTo(v.price * 2.7);
    expect(v.quantity).toBe(1);
    console.log(`Price: ${v.price}, RRP: ${v.rrp} (×2.7)`);
  });
});
