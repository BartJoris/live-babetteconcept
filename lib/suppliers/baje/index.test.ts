import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import bajePlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Baje_order.csv');

const context: ParseContext = {
  brands: [],
  vendorId: 'test-vendor',
  findBrand: () => undefined,
};

describe('baje parse - Verkooporder CSV', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = bajePlugin.parse({ main_csv: text }, context);

  it('groups 108 data rows into 30 products (one per article + Kleurnummer)', () => {
    expect(products).toHaveLength(30);
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(108);
  });

  it('folds Kleurnummer into the reference so same-code colorways stay unique', () => {
    const taupe = products.find((p) => p.reference === 'BAAW2700084-202');
    const other = products.find((p) => p.reference === 'BAAW2700084-276');
    expect(taupe).toBeTruthy();
    expect(other).toBeTruthy();
    expect(taupe!.color).not.toBe(other!.color);
  });

  it('parses name, color, brand fallback and kid sizes for a dual-EU product', () => {
    const yoen = products.find((p) => p.reference === 'BAAW2700003-295');
    expect(yoen).toBeTruthy();
    expect(yoen!.name).toBe('Baje - Yoen - Taupe');
    expect(yoen!.originalName).toBe('Yoen');
    expect(yoen!.color).toBe('Taupe');
    expect(yoen!.suggestedBrand).toBe('Baje');
    expect(yoen!.selectedBrand).toBeUndefined();
    expect(yoen!.sizeAttribute).toBe('MAAT Kinderen');
    expect(yoen!.variants.map((v) => v.size)).toEqual([
      '2 jaar',
      '4 jaar',
      '6 jaar',
      '8 jaar',
    ]);
  });

  it('parses variant price, rrp, ean and quantity', () => {
    const yoen = products.find((p) => p.reference === 'BAAW2700003-295')!;
    const first = yoen.variants[0];
    expect(first.price).toBeCloseTo(15);
    expect(first.rrp).toBeCloseTo(39);
    expect(first.ean).toBe('8721263644368');
    expect(first.quantity).toBe(1);
  });

  it('converts age-range sizes like 2-4y / 5-7y', () => {
    const withAgeRange = products.find((p) =>
      p.variants.some((v) => v.size === '4 jaar' || v.size === '7 jaar'),
    );
    // Prefer a product that has the raw age-range sizes (2-4y/5-7y → upper age)
    const ageProducts = products.filter(
      (p) =>
        p.variants.length === 2 &&
        p.variants.every((v) => v.size === '4 jaar' || v.size === '7 jaar'),
    );
    expect(ageProducts.length).toBeGreaterThan(0);
    expect(withAgeRange).toBeTruthy();
  });
});

describe('baje image filename matching', () => {
  const extractReference = bajePlugin.imageMatching!.extractReference!;

  it('extracts "<article>-<Kleurnummer>" and ignores set + sequence', () => {
    expect(extractReference('BAAW2700003-295-144-40.png')).toBe('BAAW2700003-295');
    expect(extractReference('BAAW2700084-276-215-37.png')).toBe('BAAW2700084-276');
    expect(extractReference('BAAW2700155-139-4-1.png')).toBe('BAAW2700155-139');
  });

  it('returns null for filenames that do not match', () => {
    expect(extractReference('random-photo.jpg')).toBeNull();
  });

  it('matches every sample image filename to a parsed product', () => {
    const text = readFileSync(CSV_PATH, 'utf8');
    const products = bajePlugin.parse({ main_csv: text }, context);
    const refs = new Set(products.map((p) => p.reference));

    const filenames = readFileSync(join(__dirname, 'samples', 'image-filenames.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    expect(filenames).toHaveLength(55);
    for (const filename of filenames) {
      const ref = extractReference(filename);
      expect(ref).not.toBeNull();
      expect(refs.has(ref!)).toBe(true);
    }
  });
});
