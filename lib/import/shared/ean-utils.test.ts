import { describe, it, expect } from 'vitest';
import { generateEAN13, isValidEAN13, generateUniqueEAN13Batch } from './ean-utils';

describe('generateEAN13', () => {
  it('returns a 13-digit string', () => {
    const ean = generateEAN13();
    expect(ean).toHaveLength(13);
    expect(ean).toMatch(/^\d{13}$/);
  });

  it('starts with "2" (internal use prefix)', () => {
    for (let i = 0; i < 20; i++) {
      const ean = generateEAN13();
      expect(ean[0]).toBe('2');
    }
  });

  it('has a valid check digit', () => {
    for (let i = 0; i < 20; i++) {
      const ean = generateEAN13();
      expect(isValidEAN13(ean)).toBe(true);
    }
  });

  it('generates different codes on successive calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateEAN13());
    }
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('isValidEAN13', () => {
  it('validates a correct EAN-13', () => {
    expect(isValidEAN13('4006381333931')).toBe(true);
  });

  it('rejects an invalid check digit', () => {
    expect(isValidEAN13('4006381333932')).toBe(false);
  });

  it('rejects wrong length (12 digits)', () => {
    expect(isValidEAN13('400638133393')).toBe(false);
  });

  it('rejects wrong length (14 digits)', () => {
    expect(isValidEAN13('40063813339310')).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(isValidEAN13('400638133393a')).toBe(false);
  });

  it('validates generated codes', () => {
    const ean = generateEAN13();
    expect(isValidEAN13(ean)).toBe(true);
  });
});

describe('generateUniqueEAN13Batch', () => {
  it('generates the requested count', () => {
    const batch = generateUniqueEAN13Batch(10, new Set());
    expect(batch).toHaveLength(10);
  });

  it('produces no duplicates within batch', () => {
    const batch = generateUniqueEAN13Batch(100, new Set());
    const unique = new Set(batch);
    expect(unique.size).toBe(100);
  });

  it('excludes codes from existing set', () => {
    const existing = new Set<string>();
    for (let i = 0; i < 5; i++) {
      existing.add(generateEAN13());
    }

    const batch = generateUniqueEAN13Batch(10, existing);
    for (const code of batch) {
      expect(existing.has(code)).toBe(false);
    }
  });

  it('all generated codes are valid EAN-13', () => {
    const batch = generateUniqueEAN13Batch(20, new Set());
    for (const code of batch) {
      expect(isValidEAN13(code)).toBe(true);
    }
  });

  it('handles zero count', () => {
    const batch = generateUniqueEAN13Batch(0, new Set());
    expect(batch).toHaveLength(0);
  });
});
