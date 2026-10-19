import { describe, expect, it } from 'vitest';
import { isbn13To10, isLikelyIsbn, normalizeIsbn } from './isbn';

describe('normalizeIsbn', () => {
  it('strips dashes and spaces', () => {
    expect(normalizeIsbn('978-90-022-8695-7')).toBe('9789002286957');
    expect(normalizeIsbn('978 9002286957')).toBe('9789002286957');
  });

  it('rejects invalid lengths', () => {
    expect(normalizeIsbn('123')).toBeNull();
    expect(normalizeIsbn('')).toBeNull();
  });
});

describe('isbn13To10', () => {
  it('converts known ISBN-13 values', () => {
    expect(isbn13To10('9780140328721')).toBe('0140328726');
    expect(isbn13To10('9789002286957')).toBe('9002286953');
    expect(isbn13To10('9789002287817')).toBe('900228781X');
  });

  it('rejects 979 prefixes', () => {
    expect(isbn13To10('9791234567896')).toBeNull();
  });
});

describe('isLikelyIsbn', () => {
  it('accepts ISBN-13 barcodes', () => {
    expect(isLikelyIsbn('9789002286957')).toBe(true);
    expect(isLikelyIsbn('SKU-123')).toBe(false);
  });
});
