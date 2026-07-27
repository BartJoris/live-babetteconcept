import { describe, expect, it } from 'vitest';
import type { ParsedProduct } from '@/lib/suppliers/types';
import { applyMipounetRrp, parseMipounetSrpFromText } from './rrp';

const SAMPLE_PDF_TEXT = `
ORDER CONFIRMATION
COLLECTION
FW26
Ref. 271.23
100% ORGANIC COTTON
SRP: 59 €
Ref. 271.04
100% ORGANIC COTTON
SRP: 59 €
Ref. 1238.23
SRP: 65 €
Ref. 1233.04
SRP: 75 €
Ref. 1241.08
SRP: 69 €
Ref. 130.23
SRP: 89 €
Ref. 573.04
SRP: 89 €
Ref. 473.13
SRP: 79 €
Ref. 1133.08
SRP: 49 €
Ref. 471.08
SRP: 75 €
`;

function makeProduct(reference: string, price = 24): ParsedProduct {
  return {
    reference,
    name: `Mipounet - ${reference}`,
    material: '',
    color: 'AUBERGINE',
    variants: [
      { size: '2 jaar', quantity: 1, ean: '', price, rrp: price * 2.5 },
      { size: '4 jaar', quantity: 1, ean: '8436589123456', price, rrp: price * 2.5 },
    ],
    publicCategories: [],
    productTags: [],
    isFavorite: false,
    isPublished: true,
    rrpSource: 'fallback',
  };
}

describe('parseMipounetSrpFromText', () => {
  it('extracts dotted refs and SRP prices', () => {
    const map = parseMipounetSrpFromText(SAMPLE_PDF_TEXT);
    expect(map.size).toBe(10);
    expect(map.get('271.23')).toBe(59);
    expect(map.get('130.23')).toBe(89);
    expect(map.get('1133.08')).toBe(49);
  });

  it('does not truncate 271.23 to 271', () => {
    const map = parseMipounetSrpFromText(SAMPLE_PDF_TEXT);
    expect(map.has('271')).toBe(false);
    expect(map.get('271.23')).toBe(59);
    expect(map.get('271.04')).toBe(59);
  });
});

describe('applyMipounetRrp', () => {
  it('marks matched products as pdf and sets SRP', () => {
    const result = applyMipounetRrp(
      [makeProduct('271.23'), makeProduct('999.99')],
      parseMipounetSrpFromText(SAMPLE_PDF_TEXT),
    );
    expect(result.matched).toBe(1);
    expect(result.fallback).toBe(1);
    expect(result.products[0].rrpSource).toBe('pdf');
    expect(result.products[0].variants[0].rrp).toBe(59);
    expect(result.products[1].rrpSource).toBe('fallback');
    expect(result.products[1].variants[0].rrp).toBe(60);
  });

  it('falls back all when map empty', () => {
    const result = applyMipounetRrp([makeProduct('271.23', 20)], new Map());
    expect(result.matched).toBe(0);
    expect(result.products[0].rrpSource).toBe('fallback');
    expect(result.products[0].variants[0].rrp).toBe(50);
  });
});
