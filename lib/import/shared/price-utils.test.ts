import { describe, it, expect } from 'vitest';
import { parseEuroPrice } from './price-utils';

describe('parseEuroPrice', () => {
  describe('European format (comma as decimal)', () => {
    it('parses "22,00" as 22', () => {
      expect(parseEuroPrice('22,00')).toBe(22);
    });

    it('parses "1.234,56" as 1234.56', () => {
      expect(parseEuroPrice('1.234,56')).toBe(1234.56);
    });

    it('parses "0,99" as 0.99', () => {
      expect(parseEuroPrice('0,99')).toBe(0.99);
    });

    it('parses "199,95" as 199.95', () => {
      expect(parseEuroPrice('199,95')).toBe(199.95);
    });
  });

  describe('mixed formats with currency symbols', () => {
    it('parses "12,39 €" as 12.39', () => {
      expect(parseEuroPrice('12,39 €')).toBe(12.39);
    });

    it('parses "€ 155.00" as 155', () => {
      expect(parseEuroPrice('€ 155.00')).toBe(155);
    });

    it('parses "€155,00" as 155', () => {
      expect(parseEuroPrice('€155,00')).toBe(155);
    });
  });

  describe('standard decimal format', () => {
    it('parses "12.39" as 12.39', () => {
      expect(parseEuroPrice('12.39')).toBe(12.39);
    });

    it('parses "1234.56" as 1234.56', () => {
      expect(parseEuroPrice('1234.56')).toBe(1234.56);
    });

    it('parses "100" as 100', () => {
      expect(parseEuroPrice('100')).toBe(100);
    });
  });

  describe('US format (comma as thousands separator)', () => {
    it('parses "1,234.56" as 1234.56', () => {
      expect(parseEuroPrice('1,234.56')).toBe(1234.56);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for empty string', () => {
      expect(parseEuroPrice('')).toBe(0);
    });

    it('returns 0 for null-ish values', () => {
      expect(parseEuroPrice(undefined as unknown as string)).toBe(0);
      expect(parseEuroPrice(null as unknown as string)).toBe(0);
    });

    it('handles whitespace-only string', () => {
      expect(parseEuroPrice('   ')).toBe(0);
    });

    it('handles string with only currency symbol', () => {
      expect(parseEuroPrice('€')).toBe(0);
    });
  });
});
