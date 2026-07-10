import { describe, it, expect } from 'vitest';
import { parseCSV, rowToObject, findHeader } from './csv-utils';

describe('parseCSV', () => {
  describe('delimiter detection', () => {
    it('detects semicolons as delimiter', () => {
      const csv = 'Name;Price;Size\nShirt;22,00;M\nPants;35,50;L';
      const result = parseCSV(csv);
      expect(result.headers).toEqual(['Name', 'Price', 'Size']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['Shirt', '22,00', 'M']);
    });

    it('detects commas as delimiter', () => {
      const csv = 'Name,Price,Size\nShirt,22.00,M\nPants,35.50,L';
      const result = parseCSV(csv);
      expect(result.headers).toEqual(['Name', 'Price', 'Size']);
      expect(result.rows[0]).toEqual(['Shirt', '22.00', 'M']);
    });

    it('detects tabs as delimiter', () => {
      const csv = 'Name\tPrice\tSize\nShirt\t22.00\tM';
      const result = parseCSV(csv);
      expect(result.headers).toEqual(['Name', 'Price', 'Size']);
      expect(result.rows[0]).toEqual(['Shirt', '22.00', 'M']);
    });
  });

  describe('header parsing', () => {
    it('parses headers and builds headerRow index', () => {
      const csv = 'A;B;C\n1;2;3';
      const result = parseCSV(csv);
      expect(result.headerRow).toEqual({ A: 0, B: 1, C: 2 });
    });

    it('handles hasHeader=false', () => {
      const csv = '1;2;3\n4;5;6';
      const result = parseCSV(csv, { hasHeader: false });
      expect(result.headers).toEqual([]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['1', '2', '3']);
    });

    it('trims header whitespace', () => {
      const csv = ' Name ; Price ; Size \n1;2;3';
      const result = parseCSV(csv);
      expect(result.headers).toEqual(['Name', 'Price', 'Size']);
    });
  });

  describe('multiline quoted fields', () => {
    it('parses fields with embedded newlines', () => {
      const csv = 'Name;Description\nShirt;"A nice\nshirt with details"';
      const result = parseCSV(csv);
      expect(result.rows[0][1]).toBe('A nice\nshirt with details');
    });

    it('handles escaped quotes inside quoted fields', () => {
      const csv = 'Name;Note\nShirt;"He said ""hello"""';
      const result = parseCSV(csv);
      expect(result.rows[0][1]).toBe('He said "hello"');
    });
  });

  describe('skipRows', () => {
    it('skips specified number of rows before parsing', () => {
      const csv = 'Table 1\nIgnore this\nName;Price\nShirt;22';
      const result = parseCSV(csv, { skipRows: 2 });
      expect(result.headers).toEqual(['Name', 'Price']);
      expect(result.rows[0]).toEqual(['Shirt', '22']);
    });
  });

  describe('empty input', () => {
    it('returns empty result for empty string', () => {
      const result = parseCSV('');
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.headerRow).toEqual({});
    });

    it('returns empty rows when only header exists', () => {
      const csv = 'Name;Price';
      const result = parseCSV(csv);
      expect(result.headers).toEqual(['Name', 'Price']);
      expect(result.rows).toEqual([]);
    });
  });

  describe('explicit delimiter', () => {
    it('uses provided delimiter instead of auto-detection', () => {
      const csv = 'A|B|C\n1|2|3';
      const result = parseCSV(csv, { delimiter: '|' });
      expect(result.headers).toEqual(['A', 'B', 'C']);
      expect(result.rows[0]).toEqual(['1', '2', '3']);
    });
  });

  describe('CRLF line endings', () => {
    it('handles Windows-style line endings', () => {
      const csv = 'Name;Price\r\nShirt;22\r\nPants;35';
      const result = parseCSV(csv);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['Shirt', '22']);
    });
  });
});

describe('rowToObject', () => {
  it('maps headers to values', () => {
    const obj = rowToObject(['Name', 'Price', 'Size'], ['Shirt', '22.00', 'M']);
    expect(obj).toEqual({ Name: 'Shirt', Price: '22.00', Size: 'M' });
  });

  it('handles missing values gracefully', () => {
    const obj = rowToObject(['A', 'B', 'C'], ['1', '2']);
    expect(obj).toEqual({ A: '1', B: '2', C: '' });
  });

  it('trims values', () => {
    const obj = rowToObject(['Name'], [' Shirt ']);
    expect(obj.Name).toBe('Shirt');
  });
});

describe('findHeader', () => {
  const headers = ['Product Name', 'Price EUR', 'Size'];

  it('finds header case-insensitively', () => {
    expect(findHeader(headers, 'product name')).toBe(0);
    expect(findHeader(headers, 'PRICE EUR')).toBe(1);
  });

  it('tries multiple candidates and returns first match', () => {
    expect(findHeader(headers, 'naam', 'name', 'product name')).toBe(0);
  });

  it('returns -1 when no match found', () => {
    expect(findHeader(headers, 'color', 'colour')).toBe(-1);
  });

  it('handles empty headers array', () => {
    expect(findHeader([], 'name')).toBe(-1);
  });
});
