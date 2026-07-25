import { describe, expect, it } from 'vitest';
import type { ParsedProduct } from '@/lib/suppliers/types';
import {
  applyWeekendHouseKidsRrp,
  parseWeekendHouseKidsSrpFromText,
} from './rrp';

const SAMPLE_PDF_TEXT = `
ORDER CONFIRMATION
Blue and red
Ref. K26848
100% organic cotton
SRP: 75 €
Dark blue
Ref. K26847
100% organic cotton
SRP: 75 €
Granate
Ref. K26948
100% recycled polyester
SRP: 135 €
Blue
Ref. K26922
SRP: 75 €
Turquesa
Ref. K26858
SRP: 45 €
Stripes blue and white
Ref. K26855
SRP: 45 €
Dark blue
Ref. K26866
SRP: 45 €
Sand
Ref. K26935
SRP: 75 €
Granate
Ref. K26811
SRP: 62 €
Blue
Ref. B26959
SRP: 49 €
Turquesa
Ref. B26882
SRP: 52,50 €
Blue
Ref. B26911
SRP: 36 €
Blue
Ref. B26895
SRP: 38 €
`;

function makeProduct(reference: string, price = 32): ParsedProduct {
  return {
    reference,
    name: `Weekend House Kids - ${reference}`,
    material: '',
    color: 'Blue',
    variants: [
      { size: '2 jaar', quantity: 1, ean: '', price, rrp: price * 2.5 },
      { size: '4 jaar', quantity: 1, ean: '8435642686381', price, rrp: price * 2.5 },
    ],
    publicCategories: [],
    productTags: [],
    isFavorite: false,
    isPublished: true,
    rrpSource: 'fallback',
  };
}

describe('parseWeekendHouseKidsSrpFromText', () => {
  it('extracts all 13 SRP prices including comma decimals', () => {
    const map = parseWeekendHouseKidsSrpFromText(SAMPLE_PDF_TEXT);
    expect(map.size).toBe(13);
    expect(map.get('K26848')).toBe(75);
    expect(map.get('K26948')).toBe(135);
    expect(map.get('B26882')).toBe(52.5);
    expect(map.get('B26895')).toBe(38);
  });

  it('returns empty map for empty text', () => {
    expect(parseWeekendHouseKidsSrpFromText('').size).toBe(0);
  });

  it('keeps first SRP when ref is duplicated', () => {
    const text = `
Ref. K26848
SRP: 75 €
Ref. K26848
SRP: 99 €
`;
    const map = parseWeekendHouseKidsSrpFromText(text);
    expect(map.get('K26848')).toBe(75);
  });
});

describe('applyWeekendHouseKidsRrp', () => {
  it('sets pdf rrp and source for matched products', () => {
    const products = [makeProduct('K26848', 32), makeProduct('K26948', 55)];
    const map = parseWeekendHouseKidsSrpFromText(SAMPLE_PDF_TEXT);
    const result = applyWeekendHouseKidsRrp(products, map);

    expect(result.matched).toBe(2);
    expect(result.fallback).toBe(0);
    expect(result.products[0].rrpSource).toBe('pdf');
    expect(result.products[0].variants.every((v) => v.rrp === 75)).toBe(true);
    expect(result.products[1].variants.every((v) => v.rrp === 135)).toBe(true);
    expect(result.message).toContain('2/2');
  });

  it('marks unmatched products as fallback ×2.5', () => {
    const products = [makeProduct('K26848', 32), makeProduct('UNKNOWN99', 20)];
    const map = new Map([['K26848', 75]]);
    const result = applyWeekendHouseKidsRrp(products, map);

    expect(result.matched).toBe(1);
    expect(result.fallback).toBe(1);
    expect(result.products[1].rrpSource).toBe('fallback');
    expect(result.products[1].variants[0].rrp).toBe(50);
    expect(result.message).toContain('1× fallback');
  });

  it('marks all as fallback when price map is empty', () => {
    const products = [makeProduct('K26848', 32)];
    const result = applyWeekendHouseKidsRrp(products, new Map());
    expect(result.matched).toBe(0);
    expect(result.fallback).toBe(1);
    expect(result.products[0].rrpSource).toBe('fallback');
    expect(result.message).toContain('inkoop × 2.5');
  });
});
