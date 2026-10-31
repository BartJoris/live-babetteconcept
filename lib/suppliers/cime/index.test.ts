import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { extractCimeProducts, isCimeOrderPdf } from './pdf';
import { processCimePdfResults } from './index';
import type { Brand, ParseContext } from '@/lib/suppliers/types';

const sampleText = readFileSync(
  join(__dirname, 'samples/opstart-extract.txt'),
  'utf8',
);

const brand: Brand = {
  id: 1,
  name: 'Cîme',
  source: 'odoo',
};

const context: ParseContext = {
  brands: [brand],
  findBrand: (...terms: string[]) => {
    const t = terms.join(' ').toLowerCase();
    if (t.includes('cime') || t.includes('cîme')) return brand;
    return undefined;
  },
  vendorId: 'cime',
};

describe('CÎME PDF parser', () => {
  it('detects the opstart form', () => {
    expect(isCimeOrderPdf(sampleText, 'Opstart Cîme - Babette.pdf')).toBe(true);
  });

  it('extracts numbered product lines with prices and qty', () => {
    const products = extractCimeProducts(sampleText);
    expect(products.length).toBeGreaterThanOrEqual(25);

    const nutri = products.find((p) => p.reference === '10');
    expect(nutri).toMatchObject({
      name: 'Nutri-boost dag- & nachtcrème',
      rrp: 35,
      price: 17.5,
      quantity: 6,
    });

    const retinal = products.find((p) => p.reference === '51');
    expect(retinal).toMatchObject({
      name: 'Retinal serum',
      rrp: 43,
      price: 21.5,
      quantity: 6,
    });
  });

  it('parses the Gua Sha accessory without numeric code', () => {
    const products = extractCimeProducts(sampleText);
    const gua = products.find((p) => /gua/i.test(p.name) || /gua/i.test(p.reference));
    expect(gua).toBeTruthy();
    expect(gua!.rrp).toBe(20);
    expect(gua!.price).toBe(10);
    expect(gua!.quantity).toBe(0);
  });

  it('processPdfResults keeps only ordered lines (qty > 0)', () => {
    const rows = extractCimeProducts(sampleText);
    const { products, message } = processCimePdfResults(
      { products: rows },
      [],
      context,
    );

    expect(products.every((p) => p.variants[0].quantity > 0)).toBe(true);
    expect(products.length).toBe(rows.filter((r) => r.quantity > 0).length);
    expect(products[0].name.startsWith('Cîme -')).toBe(true);
    expect(products[0].variants[0].size).toBe('U');
    expect(message).toMatch(/CÎME/);
  });
});
