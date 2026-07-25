import { describe, expect, it } from 'vitest';
import {
  normalizeMatchToken,
  parseEmileetidaRepairRows,
  variantMatchesRepairRow,
} from '@/lib/suppliers/emileetida/repair-barcodes';

const SAMPLE_CSV = `Order id;Product name;Product reference;Color name;Size name;EAN13;Quantity;Unit price
1;PANTALON VELOURS LARGE;IDA-EDGAR;FARINE;S;3664547699874;1;61,2
1;PANTALON VELOURS LARGE;IDA-EDGAR;FARINE;XS;3664547699997;1;61,2
1;BONNET;IDA-EVELAND;CHATAIGNE;TU;3664547707029;3;22,7
`;

describe('parseEmileetidaRepairRows', () => {
  it('parses adult sizes into Odoo MAAT format', () => {
    const rows = parseEmileetidaRepairRows(SAMPLE_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      productRef: 'IDA-EDGAR',
      colorName: 'FARINE',
      sizeRaw: 'S',
      sizeOdoo: 'S - 36',
      ean: '3664547699874',
      quantity: 1,
      price: 61.2,
    });
    expect(rows[2].sizeOdoo).toBe('U');
  });
});

describe('variantMatchesRepairRow', () => {
  it('matches color + adult size when reference is absent from name', () => {
    const row = parseEmileetidaRepairRows(SAMPLE_CSV)[0];
    expect(
      variantMatchesRepairRow(
        'Emile & Ida - Pantalon velours large (Farine) (S - 36)',
        row,
      ),
    ).toBe(true);
    expect(
      variantMatchesRepairRow(
        'Emile & Ida - Pantalon velours large (Farine) (XS - 34)',
        row,
      ),
    ).toBe(false);
    // Bare letter "S" must not match words containing "s"
    expect(
      variantMatchesRepairRow(
        'Emile & Ida - Pantalon velours large (Farine)',
        row,
      ),
    ).toBe(false);
  });

  it('matches one-size accessories', () => {
    const row = parseEmileetidaRepairRows(SAMPLE_CSV)[2];
    expect(
      variantMatchesRepairRow(
        'Emile & Ida - Bonnet - Chataigne (ida-eveland)',
        row,
      ),
    ).toBe(true);
  });
});

describe('normalizeMatchToken', () => {
  it('strips accents and punctuation', () => {
    expect(normalizeMatchToken('Hélsinski')).toBe('helsinski');
    expect(normalizeMatchToken('S - 36')).toBe('s36');
  });
});
