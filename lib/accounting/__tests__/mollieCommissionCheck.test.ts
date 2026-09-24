import { describe, expect, it } from 'vitest';
import {
  computeMollieCommissionCheck,
  monthKeyFromIso,
  type MollieCommissionBill,
} from '@/lib/accounting/mollieCommissionCheck';
import type { SettlementOdooRow } from '@/lib/mollieSettlementShared';

function costRow(overrides: Partial<SettlementOdooRow> & { boekingsdatum: string; uitbetalingsbedrag: string }): SettlementOdooRow {
  return {
    datum: overrides.boekingsdatum,
    betaalmethode: '',
    valuta: 'EUR',
    bedrag: overrides.uitbetalingsbedrag,
    status: '',
    id: '',
    omschrijving: 'Mollie fees',
    naamConsument: '',
    rekeningConsument: '',
    bicConsument: '',
    uitbetalingsvaluta: 'EUR',
    uitbetalingsreferentie: 'REF',
    teruggestortBedrag: '',
    descriptionOdoo: 'Mollie fees',
    datumDdMmYyyy: '',
    settlementId: 'stl_1',
    regeltype: 'kosten',
    uniekeImportId: 'stl_1:cost:0',
    mollieInvoiceId: '',
    mollieModus: '',
    ...overrides,
  };
}

function bill(overrides: Partial<MollieCommissionBill> & { id: number }): MollieCommissionBill {
  return {
    name: `BILL/${overrides.id}`,
    date: '2026-08-31',
    amountTotal: 100,
    ref: null,
    ...overrides,
  };
}

describe('monthKeyFromIso', () => {
  it('extracts YYYY-MM', () => {
    expect(monthKeyFromIso('2026-08-31')).toBe('2026-08');
    expect(monthKeyFromIso('2026-08-31T10:00:00+00:00')).toBe('2026-08');
    expect(monthKeyFromIso(null)).toBeNull();
    expect(monthKeyFromIso(undefined)).toBeNull();
  });
});

describe('computeMollieCommissionCheck', () => {
  it('matches when settlement cost totals equal the sum of that month’s bills', () => {
    const rows = [
      costRow({ boekingsdatum: '2026-08-05', uitbetalingsbedrag: '100.00' }),
      costRow({ boekingsdatum: '2026-08-20', uitbetalingsbedrag: '50.00' }),
    ];
    const bills = [bill({ id: 1, amountTotal: 150 })];

    const [result] = computeMollieCommissionCheck(rows, bills);
    expect(result.month).toBe('2026-08');
    expect(result.settlementCostsTotal).toBe(150);
    expect(result.billsTotal).toBe(150);
    expect(result.difference).toBe(0);
    expect(result.matched).toBe(true);
  });

  it('flags a mismatch when totals differ beyond tolerance', () => {
    const rows = [costRow({ boekingsdatum: '2026-07-10', uitbetalingsbedrag: '120.00' })];
    const bills = [bill({ id: 2, date: '2026-07-31', amountTotal: 100 })];

    const [result] = computeMollieCommissionCheck(rows, bills);
    expect(result.matched).toBe(false);
    expect(result.difference).toBe(20);
  });

  it('sums multiple bills for the same month and lists them', () => {
    const rows = [costRow({ boekingsdatum: '2026-07-10', uitbetalingsbedrag: '600' })];
    const bills = [
      bill({ id: 1, date: '2026-07-31', amountTotal: 400 }),
      bill({ id: 2, date: '2026-07-31', amountTotal: 200 }),
    ];
    const [result] = computeMollieCommissionCheck(rows, bills);
    expect(result.billsTotal).toBe(600);
    expect(result.matched).toBe(true);
    expect(result.bills).toHaveLength(2);
  });

  it('reports a month with costs but no bill yet as unmatched', () => {
    const rows = [costRow({ boekingsdatum: '2026-09-05', uitbetalingsbedrag: '30.00' })];
    const [result] = computeMollieCommissionCheck(rows, []);
    expect(result.billsTotal).toBe(0);
    expect(result.matched).toBe(false);
  });

  it('ignores non-kosten rows and rows without a bookable month', () => {
    const rows: SettlementOdooRow[] = [
      { ...costRow({ boekingsdatum: '2026-08-05', uitbetalingsbedrag: '999' }), regeltype: 'betaling' },
      { ...costRow({ boekingsdatum: '', uitbetalingsbedrag: '10' }) },
    ];
    const result = computeMollieCommissionCheck(rows, []);
    expect(result).toHaveLength(0);
  });

  it('sorts months most recent first', () => {
    const rows = [
      costRow({ boekingsdatum: '2026-06-01', uitbetalingsbedrag: '10' }),
      costRow({ boekingsdatum: '2026-08-01', uitbetalingsbedrag: '10' }),
      costRow({ boekingsdatum: '2026-07-01', uitbetalingsbedrag: '10' }),
    ];
    const results = computeMollieCommissionCheck(rows, []);
    expect(results.map((r) => r.month)).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('respects a custom tolerance', () => {
    const rows = [costRow({ boekingsdatum: '2026-08-05', uitbetalingsbedrag: '100.03' })];
    const bills = [bill({ id: 1, amountTotal: 100 })];
    expect(computeMollieCommissionCheck(rows, bills, 0.05)[0].matched).toBe(true);
    expect(computeMollieCommissionCheck(rows, bills, 0.01)[0].matched).toBe(false);
  });
});
