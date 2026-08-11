import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import petitbateauPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Petit_Bateau.csv');

const context: ParseContext = {
  brands: [],
  vendorId: 'test-vendor',
  findBrand: () => undefined,
};

describe('petitbateau parse - order CSV', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = petitbateauPlugin.parse({ main_csv: text }, context);

  it('groups 65 rows into 12 products (one per Style Number + Color Code)', () => {
    expect(products).toHaveLength(12);
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(65);
  });

  it('parses baby nightwear with month sizes', () => {
    const dors = products.find((p) => p.reference === 'A0ARW-01');
    expect(dors).toBeTruthy();
    expect(dors!.name).toBe('Petit Bateau - Dors bien - Marshmallow/terkuit');
    expect(dors!.originalName).toBe('DORS BIEN');
    expect(dors!.color).toBe('Marshmallow/terkuit');
    expect(dors!.material).toBe('VELVET');
    expect(dors!.csvCategory).toBe('NIGHTWEAR');
    expect(dors!.suggestedBrand).toBe('Petit Bateau');
    expect(dors!.selectedBrand).toBeUndefined();
    expect(dors!.sizeAttribute).toBe("MAAT Baby's");
    expect(dors!.variants.map((v) => v.size)).toEqual([
      '1 maand',
      '3 maand',
      '6 maand',
      '12 maand',
    ]);
  });

  it('converts French age sizes (2A) to Dutch jaar labels', () => {
    const pyjama = products.find((p) => p.reference === 'A0DO0-02');
    expect(pyjama).toBeTruthy();
    expect(pyjama!.variants.map((v) => v.size)).toEqual([
      '2 jaar',
      '3 jaar',
      '4 jaar',
      '5 jaar',
      '6 jaar',
      '8 jaar',
      '10 jaar',
      '12 jaar',
    ]);
    // First size is kids; product-level attribute uses first variant
    expect(pyjama!.sizeAttribute).toBe('MAAT Kinderen');
  });

  it('keeps adult letter sizes and maps 2XL → XXL', () => {
    const adult = products.find((p) => p.reference === 'A0F7G-01');
    expect(adult).toBeTruthy();
    expect(adult!.variants.map((v) => v.size)).toEqual([
      'S',
      'M',
      'L',
      'XL',
      'XXL',
    ]);
    expect(adult!.sizeAttribute).toBe('MAAT Volwassenen');
  });

  it('parses wholesale, retail, ean, sku and quantity', () => {
    const dors = products.find((p) => p.reference === 'A0ARW-01')!;
    const first = dors.variants[0];
    expect(first.price).toBeCloseTo(18.75);
    expect(first.rrp).toBeCloseTo(45);
    expect(first.ean).toBe('3617102252205');
    expect(first.sku).toBe('A0ARW01460');
    expect(first.quantity).toBe(1);
  });
});

describe('petitbateau image filename matching', () => {
  const extractReference = petitbateauPlugin.imageMatching!.extractReference!;

  it('extracts "<Style Number>-<Color Code>" from "STYLE CODE Large.png"', () => {
    expect(extractReference('A0ARW 01 Large.png')).toBe('A0ARW-01');
    expect(extractReference('A0DO0 02 Large.png')).toBe('A0DO0-02');
    expect(extractReference('A0F7G 01 Large.png')).toBe('A0F7G-01');
  });

  it('returns null for filenames that do not match', () => {
    expect(extractReference('random-photo.jpg')).toBeNull();
  });

  it('matches every sample image filename to a parsed product', () => {
    const text = readFileSync(CSV_PATH, 'utf8');
    const products = petitbateauPlugin.parse({ main_csv: text }, context);
    const refs = new Set(products.map((p) => p.reference));

    const filenames = readFileSync(join(__dirname, 'samples', 'image-filenames.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    expect(filenames).toHaveLength(12);
    for (const filename of filenames) {
      const ref = extractReference(filename);
      expect(ref).not.toBeNull();
      expect(refs.has(ref!)).toBe(true);
    }
  });
});
