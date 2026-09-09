import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { extractGraceAndMilaProducts, isGraceAndMilaInvoice } from './pdf';
import graceandmilaPlugin from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const SAMPLE_TEXT = `Babette.
Albert I Laan 75/001
8670 Oostduinkerke
België
BTW: BE0782481578
Factuur INV/2026/00001929
Factuurdatum:
02-09-2026
Vervaldatum
02-09-2026
Leveringsdatum
10-08-2026
Bron
S03888
OMSCHRIJVING \tAANTAL \tEENHEIDSPRIJS \tBTW \tBEDRAG
1 - LIBERTY - BAS - 24,5/69 (XS, ECRU)\t1,00\t24,50\t21%\t24,50 €
1 - LIBERTY - BAS - 24,5/69 (S, ECRU)\t1,00\t24,50\t21%\t24,50 €
1 - LIBERTY - BAS - 24,5/69 (M, ECRU)\t1,00\t24,50\t21%\t24,50 €
1 - LIBERTY - BAS - 24,5/69 (L, ECRU)\t1,00\t24,50\t21%\t24,50 €
1 - LIBERTY - BAS - 24,5/69 (XL, ECRU)\t2,00\t24,50\t21%\t49,00 €
1 - ANGELO - PULL - 24,5/69 (XS, CHOCOLAT)\t1,00\t24,50\t21%\t24,50 €
1 - ANGELO - PULL - 24,5/69 (S, CHOCOLAT)\t1,00\t24,50\t21%\t24,50 €
1 - ANGELO - PULL - 24,5/69 (M, CHOCOLAT)\t1,00\t24,50\t21%\t24,50 €
1 - ANGELO - PULL - 24,5/69 (L, CHOCOLAT)\t1,00\t24,50\t21%\t24,50 €
1 - ANGELO - PULL - 24,5/69 (XL, CHOCOLAT)\t2,00\t24,50\t21%\t49,00 €
1 - AUDEN - ACCESS - 7,5/15 (NOIR)\t3,00\t7,50\t21%\t22,50 €
1 - AUDEN - ACCESS - 7,5/15 (KAKI)\t3,00\t7,50\t21%\t22,50 €
1 - AUDEN - ACCESS - 7,5/15 (ANTHRACITE)\t3,00\t7,50\t21%\t22,50 €
1 - AUDEN - ACCESS - 7,5/15 (TAUPE)\t3,00\t7,50\t21%\t22,50 €
BV FABRIK AGENCY
BE 0847 341 223`;

const context: ParseContext = {
  brands: [{ id: 1, name: 'Grace & Mila', source: 'test' }],
  vendorId: 'test-vendor',
  findBrand: () => ({ id: 1, name: 'Grace & Mila', source: 'test' }),
};

describe('graceandmila PDF parser', () => {
  it('detects Grace & Mila / Fabrik Agency invoices', () => {
    expect(isGraceAndMilaInvoice(SAMPLE_TEXT)).toBe(true);
    expect(isGraceAndMilaInvoice('random text')).toBe(false);
  });

  it('extracts all invoice lines', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    expect(lines).toHaveLength(14);
  });

  it('parses model, category, size, color, prices from sized items', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    const libertyXS = lines[0];
    expect(libertyXS.model).toBe('LIBERTY');
    expect(libertyXS.category).toBe('BAS');
    expect(libertyXS.size).toBe('XS');
    expect(libertyXS.color).toBe('ECRU');
    expect(libertyXS.price).toBeCloseTo(24.5);
    expect(libertyXS.rrp).toBeCloseTo(69);
    expect(libertyXS.quantity).toBe(1);
  });

  it('parses one-size items (no size, just color)', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    const audenNoir = lines.find(l => l.model === 'AUDEN' && l.color === 'NOIR');
    expect(audenNoir).toBeTruthy();
    expect(audenNoir!.size).toBe('');
    expect(audenNoir!.quantity).toBe(3);
    expect(audenNoir!.price).toBeCloseTo(7.5);
    expect(audenNoir!.rrp).toBeCloseTo(15);
  });

  it('handles XL quantity of 2', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    const libertyXL = lines.find(l => l.model === 'LIBERTY' && l.size === 'XL');
    expect(libertyXL).toBeTruthy();
    expect(libertyXL!.quantity).toBe(2);
  });
});

describe('graceandmila processPdfResults', () => {
  it('groups invoice lines into products', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    const result = graceandmilaPlugin.processPdfResults!(
      { products: lines },
      [],
      context,
    );

    expect(result.products).toHaveLength(6);

    const liberty = result.products.find(p => p.reference === 'LIBERTY' && p.color === 'Ecru');
    expect(liberty).toBeTruthy();
    expect(liberty!.name).toBe('Grace & Mila - Liberty - Ecru');
    expect(liberty!.variants).toHaveLength(5);
    expect(liberty!.variants.map(v => v.size)).toEqual([
      'XS - 34', 'S - 36', 'M - 38', 'L - 40', 'XL - 42',
    ]);
    expect(liberty!.sizeAttribute).toBe('MAAT Volwassenen');
  });

  it('handles one-size accessories as "U"', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    const result = graceandmilaPlugin.processPdfResults!(
      { products: lines },
      [],
      context,
    );

    const audenNoir = result.products.find(p => p.reference === 'AUDEN' && p.color === 'Noir');
    expect(audenNoir).toBeTruthy();
    expect(audenNoir!.variants).toHaveLength(1);
    expect(audenNoir!.variants[0].size).toBe('U');
    expect(audenNoir!.variants[0].quantity).toBe(3);
  });

  it('preserves wholesale and RRP prices', () => {
    const lines = extractGraceAndMilaProducts(SAMPLE_TEXT);
    const result = graceandmilaPlugin.processPdfResults!(
      { products: lines },
      [],
      context,
    );

    const angelo = result.products.find(p => p.reference === 'ANGELO');
    expect(angelo).toBeTruthy();
    expect(angelo!.variants[0].price).toBeCloseTo(24.5);
    expect(angelo!.variants[0].rrp).toBeCloseTo(69);
  });
});
