import { describe, expect, it } from 'vitest';
import {
  categorySearchAliases,
  collectionAgeYears,
  isAgedBySignals,
  isCountableQty,
  isLastSizeLeft,
  parseCollectionYear,
  receiptAgeYears,
  remainingVariantLabel,
} from '@/lib/retail/stockSnapshot';

describe('isCountableQty', () => {
  it('accepts positive stock', () => {
    expect(isCountableQty(1)).toBe(true);
    expect(isCountableQty(12)).toBe(true);
  });

  it('rejects zero, negative, and unlimited -1', () => {
    expect(isCountableQty(0)).toBe(false);
    expect(isCountableQty(-1)).toBe(false);
    expect(isCountableQty(-3)).toBe(false);
  });
});

describe('isLastSizeLeft', () => {
  it('matches exactly one variant with qty 1', () => {
    expect(isLastSizeLeft([1])).toBe(true);
  });

  it('rejects multiple sizes or qty > 1', () => {
    expect(isLastSizeLeft([1, 2])).toBe(false);
    expect(isLastSizeLeft([3])).toBe(false);
    expect(isLastSizeLeft([])).toBe(false);
  });
});

describe('parseCollectionYear', () => {
  it('parses season names', () => {
    expect(parseCollectionYear('Zomer 2024')).toBe(2024);
    expect(parseCollectionYear('Solden zomer 2025')).toBe(2025);
    expect(parseCollectionYear('Stocksale juni 2026')).toBe(2026);
  });

  it('uses the latest year in a path', () => {
    expect(parseCollectionYear('All / Winter 2023 / Solden 2024')).toBe(2024);
  });

  it('returns null when no year', () => {
    expect(parseCollectionYear('All / All')).toBeNull();
    expect(parseCollectionYear(null)).toBeNull();
  });
});

describe('age helpers', () => {
  it('computes collection age in calendar years', () => {
    expect(collectionAgeYears(2024, 2026)).toBe(2);
  });

  it('computes receipt age with anniversary rule', () => {
    expect(receiptAgeYears('2024-07-23', '2026-07-23')).toBe(2);
    expect(receiptAgeYears('2024-07-24', '2026-07-23')).toBe(1);
  });

  it('ages by OR of collection and first receipt', () => {
    expect(
      isAgedBySignals({
        collectionYear: 2024,
        firstReceiptDate: '2025-01-01',
        minAgeYears: 2,
        currentYear: 2026,
        asOfDate: '2026-07-23',
      })
    ).toEqual({ aged: true, ageReason: 'collection' });

    expect(
      isAgedBySignals({
        collectionYear: 2026,
        firstReceiptDate: '2023-01-01',
        minAgeYears: 2,
        currentYear: 2026,
        asOfDate: '2026-07-23',
      })
    ).toEqual({ aged: true, ageReason: 'first_receipt' });

    expect(
      isAgedBySignals({
        collectionYear: 2024,
        firstReceiptDate: '2023-01-01',
        minAgeYears: 2,
        currentYear: 2026,
        asOfDate: '2026-07-23',
      })
    ).toEqual({ aged: true, ageReason: 'both' });

    expect(
      isAgedBySignals({
        collectionYear: 2026,
        firstReceiptDate: '2025-06-01',
        minAgeYears: 2,
        currentYear: 2026,
        asOfDate: '2026-07-23',
      })
    ).toEqual({ aged: false, ageReason: null });
  });
});

describe('remainingVariantLabel', () => {
  it('prefers trailing parentheses', () => {
    expect(remainingVariantLabel('Nice Dress (XS)')).toBe('XS');
  });
});

describe('categorySearchAliases', () => {
  it('maps Herfst 2026 to AW26', () => {
    const aliases = categorySearchAliases('Herfst 2026');
    expect(aliases).toEqual(
      expect.arrayContaining(['Herfst 2026', 'AW26', 'Winter 2026'])
    );
  });
});
