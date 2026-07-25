import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  extractWynckenBarcode,
  isWynckenBarcodesCSV,
  isWynckenMasterDataCSV,
  parseWynckenBarcodesCSV,
} from './barcodes';

const BARCODES_PATH = '/Users/bajoris/Downloads/AW26 BARCODES.csv';
const MASTER_PATH = '/Users/bajoris/Downloads/AW26 MASTER DATA.csv';

describe('extractWynckenBarcode', () => {
  it('uses URL when barcode cell is scientific notation', () => {
    expect(
      extractWynckenBarcode(
        '1.11111E+12',
        'https://blue.zedonk.biz/barcode_images/EAN-13/default/1111111187128.jpg',
      ),
    ).toBe('1111111187128');
  });

  it('keeps a clean EAN cell', () => {
    expect(extractWynckenBarcode('8435642686381', '')).toBe('8435642686381');
  });
});

describe('parseWynckenBarcodesCSV', () => {
  it('parses semicolon AW26 barcodes with URL EANs', () => {
    const text = readFileSync(BARCODES_PATH, 'utf8');
    expect(isWynckenBarcodesCSV(text)).toBe(true);
    expect(isWynckenMasterDataCSV(text)).toBe(false);

    const map = parseWynckenBarcodesCSV(text);
    expect(map.size).toBeGreaterThan(100);

    const row = map.get('MW21J01 MINI RUSTY BEAR SWEAT COTTON COCOA-12M');
    expect(row?.barcode).toBe('1111111187128');
  });
});

describe('isWynckenMasterDataCSV', () => {
  it('detects master data file', () => {
    const text = readFileSync(MASTER_PATH, 'utf8');
    expect(isWynckenMasterDataCSV(text)).toBe(true);
    expect(isWynckenBarcodesCSV(text)).toBe(false);
  });
});
