import { describe, expect, it } from 'vitest';
import {
  extractBrandFromProductName,
  parseQuotationRef,
  productNameWithoutBrand,
  sortQuotationLines,
} from './quotationExport';

describe('parseQuotationRef', () => {
  it('parses Odoo sales URL', () => {
    expect(parseQuotationRef('https://www.babetteconcept.be/odoo/sales/3167')).toEqual({
      kind: 'id',
      id: 3167,
    });
  });

  it('parses numeric id', () => {
    expect(parseQuotationRef('3167')).toEqual({ kind: 'id', id: 3167 });
  });

  it('parses quotation name', () => {
    expect(parseQuotationRef('S03167')).toEqual({ kind: 'name', name: 'S03167' });
  });
});

describe('extractBrandFromProductName', () => {
  it('takes segment before first " - "', () => {
    expect(extractBrandFromProductName('Ao76 - Samuel rain jacket (4 jaar)')).toBe('Ao76');
    expect(extractBrandFromProductName('Mini Rodini - Space tour T-shirt')).toBe('Mini Rodini');
  });
});

describe('sortQuotationLines', () => {
  it('sorts by brand then product name', () => {
    const sorted = sortQuotationLines([
      { brand: 'Wynken', productName: 'Wynken - cloud skirt' },
      { brand: 'Ao76', productName: 'Ao76 - Zulu jacket' },
      { brand: 'Ao76', productName: 'Ao76 - Samuel rain jacket (4 jaar)' },
    ]);
    expect(sorted.map((l) => l.productName)).toEqual([
      'Ao76 - Samuel rain jacket (4 jaar)',
      'Ao76 - Zulu jacket',
      'Wynken - cloud skirt',
    ]);
  });

  it('compares product names without brand prefix', () => {
    expect(productNameWithoutBrand('Ao76 - Samuel rain jacket', 'Ao76')).toBe(
      'Samuel rain jacket',
    );
  });
});
