// @vitest-environment node
//
// SheetJS's zip/inflate handling misbehaves under jsdom (it silently reads
// garbage bytes instead of the actual sheet content) even though it works
// correctly in real browsers and in plain Node — this is a jsdom-polyfill
// quirk, not a product bug, so this file opts back into the Node environment.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import {
  parseSpreadsheetFile,
  suggestColumnMapping,
  tableToProducts,
  tableToDelimitedText,
} from './spreadsheet-utils';

/**
 * `pres.numbers` is SheetJS's own demo fixture for their Numbers-parsing
 * docs (https://docs.sheetjs.com/pres.numbers) — a real Apple Numbers file
 * (Numbers 3.0+ / iWork 2013+ format), not a converted CSV/XLSX stand-in.
 * It contains a single "Sheet1" table with columns Name/Index and 5 rows.
 */
const NUMBERS_FIXTURE = join(__dirname, 'samples/pres.numbers');

/**
 * Builds a real .xlsx buffer via ExcelJS (an independent library from the
 * SheetJS `xlsx` package under test) so this exercises genuine cross-tool
 * interop rather than a SheetJS write/read roundtrip.
 */
async function buildXlsxBuffer(rows: (string | number)[][], sheetName = 'Producten'): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((row) => ws.addRow(row));
  const buffer = await wb.xlsx.writeBuffer();
  return buffer instanceof ArrayBuffer ? buffer : (buffer as Uint8Array).buffer as ArrayBuffer;
}

describe('parseSpreadsheetFile', () => {
  it('reads a real Apple Numbers file into a table', async () => {
    const buffer = readFileSync(NUMBERS_FIXTURE);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    const tables = await parseSpreadsheetFile(arrayBuffer);

    expect(tables).toHaveLength(1);
    expect(tables[0].sheetName).toBe('Sheet1');
    expect(tables[0].headers).toEqual(['Name', 'Index']);
    expect(tables[0].rows.length).toBeGreaterThan(0);
    expect(tables[0].rows[0]).toEqual(['Bill Clinton', '42']);
  });

  it('reads an .xlsx workbook into one table per sheet', async () => {
    const buffer = await buildXlsxBuffer([
      ['Reference', 'Name', 'Size', 'Price', 'RRP', 'EAN'],
      ['REF-1', 'Shirt', 'M', '22,00', '55,00', '1234567890123'],
      ['REF-1', 'Shirt', 'L', '22,00', '55,00', '1234567890124'],
    ]);

    const tables = await parseSpreadsheetFile(buffer);

    expect(tables).toHaveLength(1);
    expect(tables[0].sheetName).toBe('Producten');
    expect(tables[0].headers).toEqual(['Reference', 'Name', 'Size', 'Price', 'RRP', 'EAN']);
    expect(tables[0].rows).toHaveLength(2);
  });
});

describe('suggestColumnMapping', () => {
  it('matches common product column headers', () => {
    const mapping = suggestColumnMapping(['Ref', 'Name', 'Size', 'Price', 'RRP', 'EAN']);
    expect(mapping.reference).toBe('Ref');
    expect(mapping.name).toBe('Name');
    expect(mapping.size).toBe('Size');
    expect(mapping.price).toBe('Price');
    expect(mapping.rrp).toBe('RRP');
    expect(mapping.ean).toBe('EAN');
  });

  it('returns null for unmatched fields', () => {
    const mapping = suggestColumnMapping(['Foo', 'Bar']);
    expect(mapping.reference).toBeNull();
    expect(mapping.price).toBeNull();
  });
});

describe('tableToProducts', () => {
  it('groups rows by reference into products with variants', () => {
    const table = {
      headers: ['Reference', 'Name', 'Size', 'Price', 'RRP', 'EAN'],
      rows: [
        ['REF-1', 'Shirt', 'M', '22,00', '55,00', '1234567890123'],
        ['REF-1', 'Shirt', 'L', '22,00', '55,00', '1234567890124'],
        ['REF-2', 'Pants', 'M', '35,50', '89,00', '1234567890125'],
      ],
    };
    const mapping = {
      reference: 'Reference',
      name: 'Name',
      size: 'Size',
      price: 'Price',
      rrp: 'RRP',
      ean: 'EAN',
    };

    const products = tableToProducts(table, mapping);

    expect(products).toHaveLength(2);
    const shirt = products.find((p) => p.reference === 'REF-1');
    expect(shirt?.variants).toHaveLength(2);
    expect(shirt?.variants[0]).toMatchObject({ size: 'M', price: 22, rrp: 55, ean: '1234567890123' });
  });

  it('skips rows without a reference', () => {
    const table = {
      headers: ['Reference', 'Name'],
      rows: [['', 'No ref'], ['REF-1', 'Has ref']],
    };
    const products = tableToProducts(table, { reference: 'Reference', name: 'Name' });
    expect(products).toHaveLength(1);
    expect(products[0].reference).toBe('REF-1');
  });
});

describe('tableToDelimitedText', () => {
  it('serializes a table back to semicolon-delimited text', () => {
    const table = {
      headers: ['Reference', 'Name'],
      rows: [['REF-1', 'Shirt']],
    };
    expect(tableToDelimitedText(table)).toBe('Reference;Name\nREF-1;Shirt');
  });

  it('quotes cells containing the delimiter', () => {
    const table = {
      headers: ['Name'],
      rows: [['Shirt; blue']],
    };
    expect(tableToDelimitedText(table)).toBe('Name\n"Shirt; blue"');
  });
});
