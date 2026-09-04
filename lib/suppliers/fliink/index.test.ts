import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import fliinkPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', '8031_revised.csv');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Fliink', source: 'test' }],
  vendorId: 'test-vendor',
  findBrand: () => ({ id: 1, name: 'Fliink', source: 'test' }),
};

describe('fliink parse — order CSV', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = fliinkPlugin.parse({ main_csv: text }, context);

  it('groups rows into 12 products (one per Style No)', () => {
    expect(products).toHaveLength(12);
  });

  it('creates correct total number of variants', () => {
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(48);
  });

  it('parses a standard product with "NY/EU" sizes', () => {
    const shirt = products.find(p => p.reference === 'F1500');
    expect(shirt).toBeTruthy();
    expect(shirt!.name).toBe('Fliink - Cody ls shirt - Insignia check');
    expect(shirt!.originalName).toBe('CODY LS SHIRT');
    expect(shirt!.color).toBe('Insignia check');
    expect(shirt!.material).toBe('100% cotton');
    expect(shirt!.suggestedBrand).toBe('Fliink');
    expect(shirt!.sizeAttribute).toBe('MAAT Kinderen');
    expect(shirt!.variants.map(v => v.size)).toEqual([
      '2 jaar', '3 jaar', '4 jaar', '5 jaar', '6 jaar',
    ]);
  });

  it('parses wholesale price and RRP (European comma format)', () => {
    const shirt = products.find(p => p.reference === 'F1500')!;
    const first = shirt.variants[0];
    expect(first.price).toBeCloseTo(16);
    expect(first.rrp).toBeCloseTo(39.99);
    expect(first.ean).toBe('5715435147408');
    expect(first.quantity).toBe(1);
  });

  it('handles products with "N-N YRS (CM)" size format', () => {
    const vest = products.find(p => p.reference === 'F2059');
    expect(vest).toBeTruthy();
    expect(vest!.name).toBe('Fliink - Alilly wide vest - Burgendy');
    expect(vest!.variants.map(v => v.size)).toEqual([
      '3 jaar', '5 jaar', '7 jaar',
    ]);
  });

  it('reads quantity > 1 correctly', () => {
    const donny = products.find(p => p.reference === 'F1963');
    expect(donny).toBeTruthy();
    expect(donny!.variants[0].quantity).toBe(2);
  });

  it('parses description from the Description column', () => {
    const shirt = products.find(p => p.reference === 'F1500')!;
    expect(shirt.ecommerceDescription).toContain('Long-sleeved shirt');
  });

  it('stores csvCategory from Type column', () => {
    const shirt = products.find(p => p.reference === 'F1500')!;
    expect(shirt.csvCategory).toBe('SHIRT');
    const pant = products.find(p => p.reference === 'F1622')!;
    expect(pant.csvCategory).toBe('PANT');
  });
});

describe('fliink image filename matching', () => {
  const extractReference = fliinkPlugin.imageMatching!.extractReference!;

  it('extracts Style No from standard filenames', () => {
    expect(extractReference('F1500 - CODY LS SHIRT - INSIGNIA CHECK - Main.jpg')).toBe('F1500');
    expect(extractReference('F2061 - ALVIN AUTUMN SWEATSHIRT - COFFEE BEAN - Extra 1.jpg')).toBe('F2061');
  });

  it('handles colors with dashes in the name', () => {
    expect(extractReference('F1580 - ALVIN LS STRIPE SWEATSHIRT - COFFEE BEAN - SANDSHELL - Extra 1.jpg')).toBe('F1580');
    expect(extractReference('F2095 - DOLLY STRIPE PANT - SMOKE ROSE-BURGUNDY STRIPE - Main.jpg')).toBe('F2095');
  });

  it('returns null for non-matching filenames', () => {
    expect(extractReference('random-photo.jpg')).toBeNull();
    expect(extractReference('IMG_2024.jpg')).toBeNull();
  });

  it('matches every sample image filename to a parsed product', () => {
    const text = readFileSync(CSV_PATH, 'utf8');
    const parsed = fliinkPlugin.parse({ main_csv: text }, context);
    const refs = new Set(parsed.map(p => p.reference));

    const filenames = readFileSync(join(__dirname, 'samples', 'image-filenames.txt'), 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const matched: string[] = [];
    const unmatched: string[] = [];

    for (const filename of filenames) {
      const ref = extractReference(filename);
      if (ref && refs.has(ref)) {
        matched.push(filename);
      } else {
        unmatched.push(filename);
      }
    }

    // F1510, F1580, F2098 appear in image list but not in CSV — those are expected mismatches
    const expectedUnmatched = unmatched.filter(f => /^F(1510|1580|2098)\s/.test(f));
    expect(expectedUnmatched.length).toBe(unmatched.length);
    expect(matched.length).toBeGreaterThan(0);
  });
});
