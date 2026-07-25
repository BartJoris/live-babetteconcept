import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  isWynckenSalesOrderText,
  parseWynckenSalesOrderText,
} from './sales-order';

const SO_PATH = '/Users/bajoris/Downloads/SO-00321_BABETTE (1) (edited).pdf';

describe('parseWynckenSalesOrderText', () => {
  it('parses size grid qtys from extracted SO text fixture', () => {
    const text = `
SO-00321
PROVISIONAL ORDER
Qty Unit Price Total
5 € 46.00 € 230.00	CHN
COO:
WK21W115 STILL LIFE FAUX FUR JACKET POLYESTER
100% POLYESTER
Description: Material Content:
Fabric: Colour:
STILL LIFE FAUX FUR JACKET
Style:
ROSE / ECRU
HTS:
2
1
3
1
4
1
6
1
8
1
10
-
12
-
14
-
16
-
Qty Unit Price Total
3 € 5.50 € 16.50	CHN
COO:
WK21A180 WIDE STRIPE OVER THE KNEE SOCK COTTON MIX
75% COTTON 20% NYLON 5% ELASTANE
Description: Material Content:
Fabric: Colour:
WIDE STRIPE OVER THE KNEE SOCK
Style:
RUSTY BEAR
HTS:
4
1
6
1
8
1
`;
    expect(isWynckenSalesOrderText(text)).toBe(true);
    const products = parseWynckenSalesOrderText(text);
    expect(products).toHaveLength(2);

    const jacket = products[0];
    expect(jacket.style).toContain('WK21W115');
    expect(jacket.colour).toBe('ROSE / ECRU');
    expect(jacket.unitPrice).toBe(46);
    expect(jacket.sizeQuantities).toEqual([
      { size: '2', quantity: 1 },
      { size: '3', quantity: 1 },
      { size: '4', quantity: 1 },
      { size: '6', quantity: 1 },
      { size: '8', quantity: 1 },
    ]);
    expect(jacket.quantity).toBe(5);

    const socks = products[1];
    expect(socks.sizeQuantities).toEqual([
      { size: '4', quantity: 1 },
      { size: '6', quantity: 1 },
      { size: '8', quantity: 1 },
    ]);
    expect(socks.quantity).toBe(3);
  });
});

describe('parseWynckenSalesOrderText (live PDF via pdf-parse)', () => {
  it('extracts ordered lines from SO-00321', async () => {
    if (typeof DOMMatrix === 'undefined') {
      (globalThis as { DOMMatrix?: unknown }).DOMMatrix = function () {
        return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      };
    }
    const pdfBuffer = readFileSync(SO_PATH);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse(new Uint8Array(pdfBuffer));
    const textResult = await parser.getText();
    const text = textResult?.text || '';
    expect(isWynckenSalesOrderText(text)).toBe(true);

    const products = parseWynckenSalesOrderText(text);
    expect(products.length).toBeGreaterThanOrEqual(18);

    const jacket = products.find(
      (p) => p.style.includes('WK21W115') && p.colour.includes('ROSE'),
    );
    expect(jacket).toBeTruthy();
    expect(jacket!.sizeQuantities?.map((s) => s.size)).toEqual(['2', '3', '4', '6', '8']);
    expect(jacket!.sizeQuantities?.every((s) => s.quantity === 1)).toBe(true);

    // Zero-qty lines should be skipped
    expect(products.every((p) => p.quantity > 0)).toBe(true);
  });
});
