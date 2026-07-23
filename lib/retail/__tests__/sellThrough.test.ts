import { describe, expect, it } from 'vitest';
import {
  computeSellThroughPct,
  sizeAttributeNamesForAudience,
} from '@/lib/retail/sellThrough';

describe('computeSellThroughPct', () => {
  it('uses opening + stock in as available', () => {
    // 120 sold / (200 opening + 100 in) = 40%
    expect(computeSellThroughPct(120, 200, 100)).toBeCloseTo(40);
  });

  it('returns 0 when nothing available', () => {
    expect(computeSellThroughPct(10, 0, 0)).toBe(0);
  });

  it('can exceed 100% if sold more than available calc', () => {
    expect(computeSellThroughPct(150, 100, 0)).toBeCloseTo(150);
  });
});

describe('sizeAttributeNamesForAudience', () => {
  it('maps each audience to the right MAAT attributes', () => {
    expect(sizeAttributeNamesForAudience('adults')).toEqual(['MAAT Volwassenen']);
    expect(sizeAttributeNamesForAudience('babies')).toEqual(["MAAT Baby's"]);
    expect(sizeAttributeNamesForAudience('children')).toEqual(['MAAT Kinderen']);
    expect(sizeAttributeNamesForAudience('teens')).toEqual(['MAAT Tieners']);
    expect(sizeAttributeNamesForAudience('kids')).toEqual([
      "MAAT Baby's",
      'MAAT Kinderen',
      'MAAT Tieners',
    ]);
  });
});
