import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import inuwetPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Inuwet_webshop.csv');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Inuwet', source: 'odoo' }],
  vendorId: 'test-vendor',
  findBrand: (...terms) => {
    const brands = [{ id: 1, name: 'Inuwet', source: 'odoo' }];
    for (const term of terms) {
      const found = brands.find(b => b.name.toLowerCase().includes(term.toLowerCase()));
      if (found) return found;
    }
    return undefined;
  },
};

describe('inuwet parse - webshop catalog CSV', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = inuwetPlugin.parse({ main_csv: text }, context);

  it('parses one product per row (25 catalog items)', () => {
    expect(products).toHaveLength(25);
    products.forEach((p) => expect(p.variants).toHaveLength(1));
  });

  it('maps artikelcode, ean, wholesale HT and retail TTC for a lippenbalsem', () => {
    const balm = products.find((p) => p.reference === 'VINLB01');
    expect(balm).toBeTruthy();
    expect(balm!.name).toBe('Inuwet - Lippenbalsem Vanille-Coco');
    expect(balm!.originalName).toBe('Lippenbalsem Vanille-Coco');
    expect(balm!.suggestedBrand).toBe('Inuwet');

    const variant = balm!.variants[0];
    expect(variant.size).toBe('U');
    expect(variant.ean).toBe('3662232001568');
    expect(variant.sku).toBe('VINLB01');
    expect(variant.quantity).toBe(0);
    expect(variant.price).toBeCloseTo(3.35);
    expect(variant.rrp).toBeCloseTo(6.5);
  });

  it('keeps multiline webshoptekst as ecommerce description', () => {
    const mousse = products.find((p) => p.reference === 'VINBM200');
    expect(mousse).toBeTruthy();
    expect(mousse!.ecommerceDescription).toContain('Mousse de Douche Vanille (200 ml)');
    expect(mousse!.ecommerceDescription).toContain('biologische aloë vera');
    expect(mousse!.variants[0].price).toBeCloseTo(6.1);
    expect(mousse!.variants[0].rrp).toBeCloseTo(12);
  });

  it('parses TTC prices with one decimal (19,9) and two decimals (16,90)', () => {
    const peony = products.find((p) => p.reference === 'VINCP01')!;
    expect(peony.variants[0].price).toBeCloseTo(10);
    expect(peony.variants[0].rrp).toBeCloseTo(19.9);

    const aqualand = products.find((p) => p.reference === 'VINKV22')!;
    expect(aqualand.variants[0].price).toBeCloseTo(7.8);
    expect(aqualand.variants[0].rrp).toBeCloseTo(16.9);
  });
});
