import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '@/lib/pdf/extractText';
import steiffPlugin, { isSteiffPricesCSV } from './index';
import { extractSteiffProducts, isSteiffInvoice, materialToArticleCode } from './pdf';
import type { ParseContext } from '@/lib/suppliers/types';

const CSV_PATH = join(__dirname, 'samples', 'Steiff-prijzen.csv');
const PDF_PATH = join(__dirname, 'samples', '0072400045.PDF');

const context: ParseContext = {
  brands: [{ id: 1, name: 'Steiff', source: 'odoo' }],
  vendorId: 'test-vendor',
  findBrand: (...terms) => {
    const brands = [{ id: 1, name: 'Steiff', source: 'odoo' }];
    for (const term of terms) {
      const found = brands.find((b) => b.name.toLowerCase().includes(term.toLowerCase()));
      if (found) return found;
    }
    return undefined;
  },
};

describe('steiff pdf helpers', () => {
  it('maps material numbers to 66.XXXXXX article codes', () => {
    expect(materialToArticleCode('014253')).toBe('66.014253');
    expect(materialToArticleCode('14253')).toBe('66.014253');
  });

  it('detects Steiff invoices', () => {
    expect(isSteiffInvoice('Invoice Margarete Steiff GmbH Material Size')).toBe(true);
    expect(isSteiffInvoice('random packing list')).toBe(false);
  });
});

describe('steiff price list CSV detection', () => {
  const csvText = readFileSync(CSV_PATH, 'utf8');

  it('detects the Steiff prijslijst headers', () => {
    expect(isSteiffPricesCSV(csvText)).toBe(true);
    expect(isSteiffPricesCSV('SKU;Name;Price\n1;x;2')).toBe(false);
  });
});

describe('steiff invoice PDF extraction', () => {
  it('extracts all 15 invoice lines from the sample PDF', async () => {
    const buf = readFileSync(PDF_PATH);
    const text = await extractPdfText(new Uint8Array(buf));
    expect(isSteiffInvoice(text)).toBe(true);

    const lines = extractSteiffProducts(text);
    expect(lines).toHaveLength(15);

    const paddy = lines.find((l) => l.material === '014253');
    expect(paddy).toBeTruthy();
    expect(paddy!.articleCode).toBe('66.014253');
    expect(paddy!.quantity).toBe(1);
    expect(paddy!.unitPrice).toBeCloseTo(37.2);
    expect(paddy!.netUnitPrice).toBeCloseTo(33.48);
    expect(paddy!.description.toLowerCase()).toContain('paddy');
  });
});

describe('steiff plugin combine (PDF + prijslijst)', () => {
  it('enriches invoice lines with EAN and adviesprijs from the CSV', async () => {
    const buf = readFileSync(PDF_PATH);
    const text = await extractPdfText(new Uint8Array(buf));
    const invoiceLines = extractSteiffProducts(text);
    const csvText = readFileSync(CSV_PATH, 'utf8');

    // Warm the price cache via parse() first (same as the wizard upload order)
    steiffPlugin.parse({ prices_csv: csvText }, context);

    const result = steiffPlugin.processPdfResults!(
      { products: invoiceLines },
      [],
      context,
    );

    expect(result.products).toHaveLength(15);

    const paddy = result.products.find((p) => p.reference === '66.014253');
    expect(paddy).toBeTruthy();
    expect(paddy!.name).toMatch(/Paddy Teddy bear/i);
    expect(paddy!.suggestedBrand).toBe('Steiff');
    expect(paddy!.variants).toHaveLength(1);
    expect(paddy!.variants[0].size).toBe('U');
    expect(paddy!.variants[0].quantity).toBe(1);
    expect(paddy!.variants[0].ean).toBe('4001505014253');
    expect(paddy!.variants[0].price).toBeCloseTo(33.48);
    expect(paddy!.variants[0].rrp).toBeCloseTo(81.95);
  });

  it('still imports from PDF alone with fallback RRP', () => {
    const invoiceLines = [
      {
        item: '000010',
        material: '014253',
        articleCode: '66.014253',
        sizeCm: '30',
        description: 'Paddy Teddy bear, golden brown',
        quantity: 2,
        unitPrice: 37.2,
        netUnitPrice: 33.48,
      },
    ];

    // Clear price cache (wizard passes prices_csv key only when a file is uploaded)
    steiffPlugin.parse({ prices_csv: '' }, context);

    const result = steiffPlugin.processPdfResults!({ products: invoiceLines }, [], context);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].variants[0].ean).toBe('');
    expect(result.products[0].variants[0].price).toBeCloseTo(33.48);
    expect(result.products[0].variants[0].rrp).toBeCloseTo(33.48 * 2.2);
    expect(result.message).toMatch(/prijslijst/i);
  });
});
