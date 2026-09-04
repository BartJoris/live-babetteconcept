import { describe, expect, it } from 'vitest';
import { computeSellThroughPct } from '@/lib/retail/sellThrough';
import {
  addPhase,
  collectionPeriods,
  consolidateBrandSeasonRows,
  emptyPhase,
  inferSeasonFromCategoryName,
  isStockSalePrice,
  leftoverKidsWarning,
  profitMarginPct,
} from '@/lib/retail/seasonInsights';

describe('inferSeasonFromCategoryName', () => {
  it('reads summer and year from "Zomer 2026"', () => {
    expect(inferSeasonFromCategoryName('Zomer 2026')).toEqual({
      kind: 'summer',
      year: 2026,
    });
  });

  it('still infers summer/year from "Solden zomer 2025"', () => {
    expect(inferSeasonFromCategoryName('Solden zomer 2025')).toEqual({
      kind: 'summer',
      year: 2025,
    });
  });

  it('maps AW26, Herfst and Winter to winter of that year', () => {
    expect(inferSeasonFromCategoryName('AW26')).toEqual({
      kind: 'winter',
      year: 2026,
    });
    expect(inferSeasonFromCategoryName('Herfst 2026')).toEqual({
      kind: 'winter',
      year: 2026,
    });
    expect(inferSeasonFromCategoryName('Winter 2026')).toEqual({
      kind: 'winter',
      year: 2026,
    });
  });

  it('returns null when season or year cannot be inferred', () => {
    expect(inferSeasonFromCategoryName('Accessoires')).toBeNull();
    expect(inferSeasonFromCategoryName('')).toBeNull();
  });
});

describe('collectionPeriods', () => {
  it('builds summer 2026 windows and caps after at today', () => {
    const periods = collectionPeriods('summer', 2026, '2026-08-21');
    expect(periods.regular).toEqual({ start: '2026-02-01', end: '2026-06-30' });
    expect(periods.solden).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(periods.after).toEqual({ start: '2026-08-01', end: '2026-08-21' });
  });

  it('builds winter 2026 windows with regular from Aug 1 previous year', () => {
    const periods = collectionPeriods('winter', 2026, '2026-08-21');
    expect(periods.regular).toEqual({ start: '2025-08-01', end: '2026-01-02' });
    expect(periods.solden).toEqual({ start: '2026-01-03', end: '2026-01-31' });
    expect(periods.after).toEqual({ start: '2026-02-01', end: '2026-06-30' });
  });
});

describe('isStockSalePrice', () => {
  it('is true at 20% of list (±3 percentage points)', () => {
    expect(isStockSalePrice(20, 100)).toBe(true);
    expect(isStockSalePrice(17, 100)).toBe(true);
    expect(isStockSalePrice(23, 100)).toBe(true);
  });

  it('is false at 50% of list or when list is 0', () => {
    expect(isStockSalePrice(50, 100)).toBe(false);
    expect(isStockSalePrice(20, 0)).toBe(false);
  });
});

describe('computeSellThroughPct', () => {
  it('is 40 when 80 sold of 200 available', () => {
    expect(computeSellThroughPct(80, 200, 0)).toBe(40);
  });
});

describe('emptyPhase / addPhase', () => {
  it('starts at zero and adds units, revenue, cost and profit', () => {
    expect(emptyPhase()).toEqual({ units: 0, revenue: 0, cost: 0, profit: 0 });
    expect(
      addPhase(
        { units: 1, revenue: 10, cost: 4, profit: 6 },
        { units: 2, revenue: 20.5, cost: 10, profit: 10.5 }
      )
    ).toEqual({
      units: 3,
      revenue: 30.5,
      cost: 14,
      profit: 16.5,
    });
  });
});

describe('profitMarginPct', () => {
  it('is profit / revenue as a percentage', () => {
    expect(profitMarginPct(25, 100)).toBe(25);
  });

  it('is 0 when there is no revenue', () => {
    expect(profitMarginPct(10, 0)).toBe(0);
  });
});

describe('consolidateBrandSeasonRows', () => {
  const base = {
    brandId: 1,
    brandName: 'American Vintage',
    available: 56,
    regularUnits: 7,
    soldenUnits: 32,
    afterUnits: 0,
    stockSaleUnits: 15,
    currentStock: 1,
    sellThroughRetailPct: 0,
    revenue: 100,
    cost: 40,
    profit: 60,
    profitMarginPct: 60,
  };

  it('merges duplicate merknamen and sums collection units', () => {
    const merged = consolidateBrandSeasonRows([
      base,
      {
        ...base,
        brandId: 99,
        available: 16,
        regularUnits: 0,
        soldenUnits: 10,
        stockSaleUnits: 5,
        currentStock: 1,
        revenue: 50,
        cost: 20,
        profit: 30,
        profitMarginPct: 60,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        brandName: 'American Vintage',
        available: 72,
        regularUnits: 7,
        soldenUnits: 42,
        stockSaleUnits: 20,
        currentStock: 2,
        revenue: 150,
        cost: 60,
        profit: 90,
      })
    );
  });

  it('drops empty rows and unnamed brands', () => {
    const merged = consolidateBrandSeasonRows([
      {
        ...base,
        brandId: 2,
        brandName: 'LN',
        available: 0,
        regularUnits: 0,
        soldenUnits: 0,
        afterUnits: 0,
        stockSaleUnits: 0,
        currentStock: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        profitMarginPct: 0,
      },
      {
        ...base,
        brandId: null,
        brandName: 'Onbekend',
        available: 6,
        regularUnits: 0,
        soldenUnits: 3,
        stockSaleUnits: 3,
      },
    ]);
    expect(merged).toEqual([]);
  });

  it('merges Ln and LN as one brand', () => {
    const merged = consolidateBrandSeasonRows([
      { ...base, brandId: 3, brandName: 'Ln', available: 24, regularUnits: 3 },
      {
        ...base,
        brandId: 4,
        brandName: 'LN',
        available: 0,
        regularUnits: 0,
        soldenUnits: 0,
        stockSaleUnits: 0,
        currentStock: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].brandName).toBe('Ln');
    expect(merged[0].available).toBe(24);
  });
});

describe('leftoverKidsWarning', () => {
  it('warns when kids current stock is still on hand', () => {
    const warning = leftoverKidsWarning(12);
    expect(warning).toEqual(expect.stringMatching(/niet afgeboekt/i));
    expect(warning).toEqual(expect.stringContaining('12'));
  });

  it('is silent when kids stock is empty', () => {
    expect(leftoverKidsWarning(0)).toBeNull();
    expect(leftoverKidsWarning(-1)).toBeNull();
  });
});
