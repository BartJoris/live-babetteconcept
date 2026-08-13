import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import playupPlugin, { extractPlayUpImageReference } from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Order_play_Up.csv');
const IMAGE_LIST_PATH = join(__dirname, 'samples', 'image-filenames.txt');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Play Up', source: 'MERK' }],
  vendorId: 'test-vendor',
  findBrand: (q) =>
    q.toLowerCase().includes('play')
      ? { id: 1, name: 'Play Up', source: 'MERK' }
      : undefined,
};

describe('playup parse - order CSV (SKU / model reference / PVPR)', () => {
  const text = readFileSync(CSV_PATH, 'utf8');
  const products = playupPlugin.parse({ main_csv: text }, context);

  it('skips the Tabel 1 preamble and builds 51 products from 248 rows', () => {
    expect(products).toHaveLength(51);
    const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
    expect(totalVariants).toBe(248);
  });

  it('builds reference as Artikel_Kleur from model reference + Color', () => {
    const sweater = products.find((p) => p.reference === '0AT11352_R373B');
    expect(sweater).toBeTruthy();
    expect(sweater!.name).toBe('Play Up - Striped jersey sweater (drawing)');
    expect(sweater!.color).toBe('');
    expect(sweater!.fabricPrint).toBe('DRAWING');
    expect(sweater!.material).toContain('Cotton');
    expect(sweater!.ecommerceDescription).toBe('STRIPED JERSEY SWEATER');
    expect(sweater!.selectedBrand?.name).toBe('Play Up');
  });

  it('converts month/year sizes and keeps letter sizes mapped for Odoo', () => {
    const baby = products.find((p) => p.reference === '0AT11352_R373B')!;
    expect(baby.variants.map((v) => v.size).sort()).toEqual(
      ['1 maand', '3 maand', '6 maand', '9 maand'].sort(),
    );
    expect(baby.sizeAttribute).toBe("MAAT Baby's");

    const withLetter = products.find((p) =>
      p.variants.some((v) => v.size === 'S - 36' || v.size === 'S'),
    );
    expect(withLetter).toBeTruthy();
  });

  it('parses wholesale, PVPR, EAN and Amount', () => {
    const sweater = products.find((p) => p.reference === '0AT11352_R373B')!;
    const variant = sweater.variants.find((v) => v.size === '9 maand');
    expect(variant).toBeTruthy();
    expect(variant!.price).toBeCloseTo(16.96);
    expect(variant!.rrp).toBeCloseTo(44.5);
    expect(variant!.ean).toBe('5608838655666');
    expect(variant!.quantity).toBe(1);
  });
});

describe('playup image filename matching', () => {
  it('extracts Artikel_Kleur and strips trailing image index', () => {
    expect(extractPlayUpImageReference('0AT11352_R373B_1.jpg')).toBe('0AT11352_R373B');
    expect(extractPlayUpImageReference('0AT11352_R373B_2.jpg')).toBe('0AT11352_R373B');
    expect(extractPlayUpImageReference('2AT11354_E811N.jpg')).toBe('2AT11354_E811N');
    expect(extractPlayUpImageReference('4AT11605_E834B.jpg')).toBe('4AT11605_E834B');
  });

  it('returns null for unrelated filenames', () => {
    expect(extractPlayUpImageReference('random-photo.jpg')).toBeNull();
    expect(extractPlayUpImageReference('IMG_001.jpg')).toBeNull();
  });

  it('matches every sample image filename to a parsed product', () => {
    const text = readFileSync(CSV_PATH, 'utf8');
    const products = playupPlugin.parse({ main_csv: text }, context);
    const refs = new Set(products.map((p) => p.reference));
    const filenames = readFileSync(IMAGE_LIST_PATH, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    expect(filenames.length).toBeGreaterThan(50);

    const unmatched: string[] = [];
    for (const filename of filenames) {
      const ref = extractPlayUpImageReference(filename);
      if (!ref || !refs.has(ref)) unmatched.push(filename);
    }
    expect(unmatched).toEqual([]);
  });
});
