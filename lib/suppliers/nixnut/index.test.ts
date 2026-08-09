import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import nixnutPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Nixnut_order.csv');

// Nixnut is a brand-new supplier: not yet in Odoo, so findBrand returns
// nothing and the plugin must fall back to the plain "Nixnut" brand name.
const context: ParseContext = {
  brands: [],
  vendorId: 'test-vendor',
  findBrand: () => undefined,
};

describe('nixnut parse - Verkooporder CSV (repeated headers per block)', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = nixnutPlugin.parse({ main_csv: text }, context);

  it('groups the 30 data rows into 14 products (one per article + color)', () => {
    expect(products).toHaveLength(14);
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(30);
  });

  it('folds color into the reference so same-code colorways stay unique (HA002 has 4 colors)', () => {
    const refs = products.filter((p) => p.reference.startsWith('HA002-')).map((p) => p.reference);
    expect(refs.sort()).toEqual([
      'HA002-OFF WHITE',
      'HA002-OLD PINK',
      'HA002-STORM STRIPE',
      'HA002-WILD GREEN',
    ]);
  });

  it('parses name, color, material and brand fallback for a single-variant product', () => {
    const hat = products.find((p) => p.reference === 'HA002-OFF WHITE');
    expect(hat).toBeTruthy();
    expect(hat!.name).toBe('Nixnut - Newbie hat - Off white');
    expect(hat!.originalName).toBe('Newbie Hat');
    expect(hat!.color).toBe('Off white');
    expect(hat!.material).toBe('95% Organic cotton, 5% Elastane');
    expect(hat!.suggestedBrand).toBe('Nixnut');
    expect(hat!.selectedBrand).toBeUndefined();
    expect(hat!.sizeAttribute).toBe("MAAT Baby's");
  });

  it('converts EU baby sizes (dual "50/56" and single "56/62/68") to Dutch maand labels', () => {
    const hat = products.find((p) => p.reference === 'HA002-OFF WHITE')!;
    expect(hat.variants.map((v) => v.size)).toEqual(['1 maand']);

    const legging = products.find((p) => p.reference === 'LE002-LYCHEE')!;
    expect(legging.variants.map((v) => v.size)).toEqual(['1 maand', '3 maand', '6 maand']);
  });

  it('parses variant price, rrp, ean and quantity', () => {
    const hat = products.find((p) => p.reference === 'HA002-OFF WHITE')!;
    const variant = hat.variants[0];
    expect(variant.price).toBeCloseTo(7.37);
    expect(variant.rrp).toBeCloseTo(16.95);
    expect(variant.ean).toBe('8720053281516');
    expect(variant.quantity).toBe(2);
  });

  it('keeps a multi-color article split into separate products with 3 sizes each (ON002)', () => {
    const onesie = products.filter((p) => p.reference.startsWith('ON002-'));
    expect(onesie).toHaveLength(4);
    onesie.forEach((p) => expect(p.variants).toHaveLength(3));
  });
});

describe('nixnut image filename matching', () => {
  const extractReference = nixnutPlugin.imageMatching!.extractReference!;

  it('extracts "<code>-<COLOR>" and ignores the internal color code + sequence number', () => {
    expect(extractReference('HA002-OFF WHITE-33-13.jpg')).toBe('HA002-OFF WHITE');
    expect(extractReference('HA002-OFF WHITE-33-14.jpg')).toBe('HA002-OFF WHITE');
    expect(extractReference('HA003-BISCUIT STRIPE-23-4.jpg')).toBe('HA003-BISCUIT STRIPE');
    expect(extractReference('ON902-SNOW-166-18.jpg')).toBe('ON902-SNOW');
  });

  it('returns null for filenames that do not match the pattern', () => {
    expect(extractReference('random-photo.jpg')).toBeNull();
  });

  it('matches every sample image filename to one of the parsed products', () => {
    const text = readFileSync(CSV_PATH, 'utf8');
    const products = nixnutPlugin.parse({ main_csv: text }, context);
    const refs = new Set(products.map((p) => p.reference));

    const filenames = readFileSync(join(__dirname, 'samples', 'image-filenames.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const filename of filenames) {
      const ref = extractReference(filename);
      expect(ref).not.toBeNull();
      expect(refs.has(ref!)).toBe(true);
    }
  });
});
