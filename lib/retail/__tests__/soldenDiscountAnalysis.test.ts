import { describe, expect, it } from 'vitest';
import {
  classifyDiscountManner,
  discountBucket,
  isOrderLevelKortingProduct,
} from '@/lib/retail/soldenDiscountAnalysis';

describe('solden discount classifiers', () => {
  it('detects order-level korting product names', () => {
    expect(isOrderLevelKortingProduct('Korting zomer')).toBe(true);
    expect(isOrderLevelKortingProduct('SummerSales -10')).toBe(true);
    expect(isOrderLevelKortingProduct('Discount POS')).toBe(true);
    expect(isOrderLevelKortingProduct('Hvid jurk')).toBe(false);
  });

  it('classifies manners in priority order', () => {
    expect(
      classifyDiscountManner({
        discountPct: 30,
        productName: 'Korting',
        inSoldenCategory: true,
      })
    ).toBe('order_level_korting');

    expect(
      classifyDiscountManner({
        discountPct: 30,
        productName: 'Hvid jurk',
        inSoldenCategory: true,
      })
    ).toBe('line_percent');

    expect(
      classifyDiscountManner({
        discountPct: 0,
        productName: 'Hvid jurk',
        inSoldenCategory: true,
      })
    ).toBe('solden_category');

    expect(
      classifyDiscountManner({
        discountPct: 0,
        productName: 'Hvid jurk',
        inSoldenCategory: false,
      })
    ).toBe('none');
  });

  it('buckets line discount percentages', () => {
    expect(discountBucket(0)).toBe('0');
    expect(discountBucket(15)).toBe('1-20');
    expect(discountBucket(35)).toBe('21-40');
    expect(discountBucket(50)).toBe('41-60');
    expect(discountBucket(70)).toBe('60+');
  });
});
