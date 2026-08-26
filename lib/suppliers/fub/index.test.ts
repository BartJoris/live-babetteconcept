import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  detectFubPdfKind,
  extractFubInvoiceProducts,
  extractFubOrderProducts,
} from './pdf';
import fubPlugin, { __test__ } from './index';
import type { ParseContext } from '@/lib/suppliers/types';

const SAMPLES = join(__dirname, 'samples');
const ORDER_TXT = readFileSync(join(SAMPLES, 'Order_FUB_AW26.pdf.txt'), 'utf8');
const INVOICE_TXT = readFileSync(join(SAMPLES, 'Invoice_FUB_AW26.pdf.txt'), 'utf8');

const context: ParseContext = {
  brands: [{ id: 1, name: 'FUB', source: 'odoo' }],
  vendorId: 'fub',
  findBrand: (...terms) => {
    const brands = [{ id: 1, name: 'FUB', source: 'odoo' }];
    for (const term of terms) {
      const found = brands.find((b) => b.name.toLowerCase().includes(term.toLowerCase()));
      if (found) return found;
    }
    return undefined;
  },
};

describe('FUB PDF extractors (AW26)', () => {
  it('detects order vs invoice by content and filename', () => {
    expect(detectFubPdfKind(ORDER_TXT, 'Order_FUB_AW26.pdf')).toBe('order');
    expect(detectFubPdfKind(INVOICE_TXT, 'Invoice_FUB_AW26.pdf')).toBe('invoice');
    expect(detectFubPdfKind(ORDER_TXT)).toBe('order');
    expect(detectFubPdfKind(INVOICE_TXT)).toBe('invoice');
  });

  it('parses order confirmation: AW codes, EANs, skips freight', () => {
    const products = extractFubOrderProducts(ORDER_TXT);
    expect(products).toHaveLength(12);
    expect(products.every((p) => !p.articleCode.includes('9999'))).toBe(true);

    const body = products.find((p) => p.articleCode === '4826 AW');
    expect(body).toBeTruthy();
    expect(body!.color).toBe('pale rose');
    expect(body!.unitPrice).toBe(22);
    expect(body!.eanBySize).toHaveLength(6);
    expect(body!.eanBySize[0]).toEqual({
      euSize: '56',
      qty: 1,
      ean: '5712199428330',
    });
  });

  it('parses invoice: composition + unit/RRP, skips shipping', () => {
    const products = extractFubInvoiceProducts(INVOICE_TXT);
    expect(products).toHaveLength(12);

    const jumper = products.find((p) => p.articleCode === '1626 AW');
    expect(jumper).toBeTruthy();
    expect(jumper!.composition).toBe('100% Merino wool');
    expect(jumper!.unitPrice).toBe(28);
    expect(jumper!.rrp).toBe(70);
    expect(jumper!.sizes).toEqual([{ euSize: '130', qty: 1 }]);

    const body = products.find((p) => p.articleCode === '4826 AW');
    expect(body!.rrp).toBe(55);
    expect(body!.unitPrice).toBe(22);
    expect(body!.sizes.map((s) => s.euSize)).toEqual(['56', '62', '68', '74', '80', '86']);
  });
});

describe('FUB PDF-only import (order + invoice)', () => {
  beforeEach(() => {
    __test__.resetCaches();
  });

  it('builds products with EANs, purchase price, RRP and material', () => {
    const order = extractFubOrderProducts(ORDER_TXT);
    const invoice = extractFubInvoiceProducts(INVOICE_TXT);
    const products = __test__.buildFromOrderAndInvoice(order, invoice, context);

    expect(products).toHaveLength(12);

    const body = products.find((p) => p.originalName?.includes('4826 AW'));
    expect(body).toBeTruthy();
    expect(body!.color).toBe('pale rose');
    expect(body!.material).toBe('100% Merino wool');
    expect(body!.suggestedBrand).toBe('FUB');
    expect(body!.variants).toHaveLength(6);
    expect(body!.variants[0].ean).toBe('5712199428330');
    expect(body!.variants[0].price).toBe(22);
    expect(body!.variants[0].rrp).toBe(55);
    expect(body!.variants[0].size).toMatch(/maand|jaar|56/);
  });

  it('processPdfResults merges order then invoice via caches', () => {
    const order = extractFubOrderProducts(ORDER_TXT);
    const invoice = extractFubInvoiceProducts(INVOICE_TXT);

    const step1 = fubPlugin.processPdfResults!(
      { kind: 'order', products: order },
      [],
      context,
    );
    expect(step1.products).toHaveLength(12);
    expect(step1.products[0].variants[0].rrp).toBe(0);

    const step2 = fubPlugin.processPdfResults!(
      { kind: 'invoice', products: invoice },
      step1.products,
      context,
    );
    expect(step2.products).toHaveLength(12);
    const withRrp = step2.products.filter((p) => p.variants.some((v) => v.rrp > 0));
    expect(withRrp.length).toBe(12);
  });

  it('parse() rebuilds from stored PDF JSON in fileMap', () => {
    const order = extractFubOrderProducts(ORDER_TXT);
    const invoice = extractFubInvoiceProducts(INVOICE_TXT);
    __test__.resetCaches();

    const products = fubPlugin.parse(
      {
        pdf_order: JSON.stringify({ kind: 'order', products: order }),
        pdf_invoice: JSON.stringify({ kind: 'invoice', products: invoice }),
      },
      context,
    );

    expect(products).toHaveLength(12);
    expect(products.every((p) => p.variants.some((v) => v.ean))).toBe(true);
    expect(products.every((p) => p.variants.some((v) => v.rrp > 0))).toBe(true);
  });
});
