import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  aggregateStockValues,
  computeStockAtDate,
  isValidIsoDate,
  stockDeltaFromMove,
  type ProductPriceRow,
  type StockMoveInput,
} from '@/lib/retail/stockValueAtDate';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/stock-value-at-date-moves.json'
);

type Fixture = {
  internalLocationIds: number[];
  asOfDate: string;
  products: ProductPriceRow[];
  brandByTemplateId: Record<string, string>;
  moves: StockMoveInput[];
  expected: {
    stockByProductId: Record<string, number>;
    totalUnits: number;
    costValue: number;
    retailValue: number;
  };
};

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;

describe('isValidIsoDate', () => {
  it('accepts valid ISO dates', () => {
    expect(isValidIsoDate('2025-06-15')).toBe(true);
    expect(isValidIsoDate('2025-02-28')).toBe(true);
  });

  it('rejects invalid dates', () => {
    expect(isValidIsoDate('15-06-2025')).toBe(false);
    expect(isValidIsoDate('2025-13-01')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('stockDeltaFromMove', () => {
  const internal = new Set([10, 11]);

  it('adds qty on incoming moves to internal', () => {
    expect(stockDeltaFromMove(99, 10, 5, internal)).toBe(5);
  });

  it('subtracts qty on outgoing moves from internal', () => {
    expect(stockDeltaFromMove(10, 88, 2, internal)).toBe(-2);
  });

  it('ignores internal transfers and zero qty', () => {
    expect(stockDeltaFromMove(10, 11, 3, internal)).toBe(0);
    expect(stockDeltaFromMove(99, 88, 4, internal)).toBe(0);
    expect(stockDeltaFromMove(99, 10, 0, internal)).toBe(0);
  });
});

describe('computeStockAtDate', () => {
  it('reconstructs stock from sample moves at cutoff date', () => {
    const internal = new Set(fixture.internalLocationIds);
    const stock = computeStockAtDate(fixture.moves, fixture.asOfDate, internal);

    for (const [productId, qty] of Object.entries(fixture.expected.stockByProductId)) {
      expect(stock.get(Number(productId))).toBe(qty);
    }
    expect(stock.size).toBe(Object.keys(fixture.expected.stockByProductId).length);
  });

  it('excludes moves after the as-of date', () => {
    const internal = new Set(fixture.internalLocationIds);
    const stock = computeStockAtDate(fixture.moves, '2025-05-31', internal);
    expect(stock.get(201)).toBe(4);
    expect(stock.has(201)).toBe(true);
  });
});

describe('aggregateStockValues', () => {
  it('totals units and values from sample fixture', () => {
    const internal = new Set(fixture.internalLocationIds);
    const stock = computeStockAtDate(fixture.moves, fixture.asOfDate, internal);
    const brandMap = new Map(
      Object.entries(fixture.brandByTemplateId).map(([k, v]) => [Number(k), v])
    );

    const totals = aggregateStockValues(stock, fixture.products, brandMap);

    expect(totals.totalUnits).toBe(fixture.expected.totalUnits);
    expect(totals.costValue).toBe(fixture.expected.costValue);
    expect(totals.retailValue).toBe(fixture.expected.retailValue);
    expect(totals.variantCount).toBe(3);
    expect(totals.templateCount).toBe(2);
    expect(totals.brands).toHaveLength(2);
    expect(totals.brands[0]?.brandName).toBe('Tiny Cottons');
  });
});
