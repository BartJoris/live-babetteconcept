import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bankLineAmount,
  bookingDateFromIso,
  buildCSVOdoo,
  buildCSVOdooBank,
  buildOdooDescription,
  collectSettlementOdooRows,
  costToOdooRow,
  escapeCSV,
  formatDdMmYyyyFromIso,
  groupSettlementRowsBySettlement,
  isNetAmountBalanced,
  normalizeAmountForOdoo,
  paymentToOdooRow,
  revenueToOdooRow,
  settlementGroupToStatementVals,
  settlementOdooRowToBankLineVals,
  sortSettlementOdooRows,
  type MolliePayment,
  type MollieSettlement,
  type SettlementOdooRow,
} from '@/lib/mollieSettlementShared';

function payment(overrides: Partial<MolliePayment> = {}): MolliePayment {
  return {
    id: 'tr_abc123',
    mode: 'live',
    createdAt: '2026-09-10T08:00:00+00:00',
    status: 'paid',
    paidAt: '2026-09-10T08:05:00+00:00',
    description: 'S03248',
    amount: { currency: 'EUR', value: '49.95' },
    settlementAmount: { currency: 'EUR', value: '48.20' },
    details: { consumerName: 'Stephanie Aerts' },
    ...overrides,
  };
}

describe('escapeCSV', () => {
  it('quotes values with commas, quotes, spaces or newlines', () => {
    expect(escapeCSV('simple')).toBe('simple');
    expect(escapeCSV('a,b')).toBe('"a,b"');
    expect(escapeCSV('a "b"')).toBe('"a ""b"""');
    expect(escapeCSV('a b')).toBe('"a b"');
  });
});

describe('date helpers', () => {
  it('extracts YYYY-MM-DD from an ISO timestamp', () => {
    expect(bookingDateFromIso('2026-09-10T08:05:00+00:00')).toBe('2026-09-10');
    expect(bookingDateFromIso('2026-09-10')).toBe('2026-09-10');
  });

  it('formats to Belgian dd/mm/yyyy', () => {
    expect(formatDdMmYyyyFromIso('2026-01-05T00:00:00+00:00')).toBe('05/01/2026');
  });
});

describe('buildOdooDescription / normalizeAmountForOdoo', () => {
  it('joins non-empty parts with " - "', () => {
    expect(buildOdooDescription('S03248', '48.20', 'ref-1')).toBe('S03248 - 48.20 - ref-1');
    expect(buildOdooDescription('', '48.20', '')).toBe('48.20');
  });

  it('normalizes comma decimals to a fixed 2-decimal string', () => {
    expect(normalizeAmountForOdoo('48,2')).toBe('48.20');
    expect(normalizeAmountForOdoo('48.2')).toBe('48.20');
    expect(normalizeAmountForOdoo('nope')).toBe('nope');
  });
});

describe('row builders', () => {
  it('builds a payment row with a betaling regeltype', () => {
    const row = paymentToOdooRow(payment(), '14086537.2609.18', 'stl_1', 'inv_1');
    expect(row.regeltype).toBe('betaling');
    expect(row.uniekeImportId).toBe('tr_abc123');
    expect(row.uitbetalingsreferentie).toBe('14086537.2609.18');
    expect(row.uitbetalingsbedrag).toBe('48.20');
    expect(row.settlementId).toBe('stl_1');
  });

  const settlement: MollieSettlement = {
    id: 'stl_1',
    reference: '14086537.2609.18',
    createdAt: '2026-09-18T10:00:00+00:00',
    settledAt: '2026-09-18T10:00:00+00:00',
    status: 'paidout',
    amount: { currency: 'EUR', value: '100.00' },
  };

  it('builds a revenue row with an omzet regeltype and gross amount', () => {
    const row = revenueToOdooRow(
      {
        description: 'POS revenue',
        method: 'pointofsale',
        count: 3,
        amountNet: { currency: 'EUR', value: '95.00' },
        amountVat: { currency: 'EUR', value: '5.00' },
        amountGross: { currency: 'EUR', value: '100.00' },
      },
      settlement,
      settlement.settledAt!,
      '2026-09',
      0,
      'inv_1'
    );
    expect(row.regeltype).toBe('omzet');
    expect(row.uitbetalingsbedrag).toBe('100.00');
    expect(row.uniekeImportId).toBe('stl_1:rev:2026-09:0');
  });

  it('builds a cost row with a kosten regeltype and a NEGATIVE amount (it is a deduction, not revenue)', () => {
    const row = costToOdooRow(
      {
        description: 'Mollie fees',
        method: null,
        count: 3,
        amountNet: { currency: 'EUR', value: '1.50' },
        amountVat: { currency: 'EUR', value: '0.32' },
        amountGross: { currency: 'EUR', value: '1.82' },
      },
      settlement,
      settlement.settledAt!,
      '2026-09',
      0,
      'inv_1'
    );
    expect(row.regeltype).toBe('kosten');
    expect(row.uniekeImportId).toBe('stl_1:cost:2026-09:0');
    // Mollie's `amountGross` on a cost item is a positive magnitude — it must become negative here,
    // otherwise it books as extra revenue instead of a withheld fee (real bug found against a live
    // settlement: fees showed up as +5.34 instead of -5.34 in the app).
    expect(row.bedrag).toBe('-1.82');
    expect(row.uitbetalingsbedrag).toBe('-1.82');
    expect(row.descriptionOdoo).toContain('-1.82');
  });
});

describe('sortSettlementOdooRows', () => {
  it('orders by boekingsdatum then betaling < omzet < kosten', () => {
    const rows: SettlementOdooRow[] = [
      { boekingsdatum: '2026-09-10', regeltype: 'kosten', uniekeImportId: 'c' } as SettlementOdooRow,
      { boekingsdatum: '2026-09-10', regeltype: 'betaling', uniekeImportId: 'a' } as SettlementOdooRow,
      { boekingsdatum: '2026-09-09', regeltype: 'omzet', uniekeImportId: 'b' } as SettlementOdooRow,
    ];
    sortSettlementOdooRows(rows);
    expect(rows.map((r) => r.uniekeImportId)).toEqual(['b', 'a', 'c']);
  });
});

describe('settlementOdooRowToBankLineVals / bankLineAmount', () => {
  const row: SettlementOdooRow = {
    ...paymentToOdooRow(payment(), '14086537.2609.18', 'stl_1', 'inv_1'),
  };

  it('builds account.bank.statement.line vals from a row', () => {
    const vals = settlementOdooRowToBankLineVals(row, 12);
    expect(vals).toMatchObject({
      journal_id: 12,
      date: row.boekingsdatum,
      amount: 48.2,
      ref: 'tr_abc123',
    });
  });

  it('bankLineAmount mirrors the amount used for the bank line', () => {
    expect(bankLineAmount(row)).toBe(48.2);
    expect(bankLineAmount({ ...row, uitbetalingsbedrag: 'garbage' })).toBe(0);
  });
});

describe('isNetAmountBalanced', () => {
  it('accepts small rounding differences but flags real gaps', () => {
    expect(isNetAmountBalanced(0)).toBe(true);
    expect(isNetAmountBalanced(0.009)).toBe(true);
    expect(isNetAmountBalanced(-0.009)).toBe(true);
    expect(isNetAmountBalanced(1.5)).toBe(false);
  });
});

describe('groupSettlementRowsBySettlement', () => {
  it('groups rows by settlementId and keeps all row types in `rows`', () => {
    const rows: SettlementOdooRow[] = [
      paymentToOdooRow(payment({ id: 'tr_1' }), 'REF-A', 'stl_a', ''),
      paymentToOdooRow(payment({ id: 'tr_2' }), 'REF-A', 'stl_a', ''),
      paymentToOdooRow(payment({ id: 'tr_3' }), 'REF-B', 'stl_b', ''),
    ];

    const groups = groupSettlementRowsBySettlement(rows);
    expect(groups).toHaveLength(2);

    const groupA = groups.find((g) => g.settlementId === 'stl_a')!;
    expect(groupA.reference).toBe('REF-A');
    expect(groupA.rows).toHaveLength(2);
  });

  it('only counts `kosten`-rows as bookable — betaling/omzet must NOT be booked as new banklines', () => {
    // Regression test for a real bug found against a live settlement: the individual `betaling`
    // rows duplicate bank lines that already exist in Odoo (via the POS/webshop integration), and
    // the `omzet` rows duplicate that same total again. Only `kosten` (Withheld fees) is genuinely
    // missing from Odoo and safe to create here.
    const settledAt = '2026-09-24T04:00:00+00:00';
    const settlement: MollieSettlement = {
      id: 'stl_24',
      reference: '14086537.2609.24',
      createdAt: settledAt,
      settledAt,
      status: 'paidout',
      amount: { currency: 'EUR', value: '955.75' },
    };
    const rows: SettlementOdooRow[] = [
      paymentToOdooRow(payment({ id: 'tr_1', settlementAmount: { currency: 'EUR', value: '126.98' } }), '14086537.2609.24', 'stl_24', ''),
      revenueToOdooRow(
        { description: 'Point of sale', method: 'pointofsale', count: 1, amountNet: { currency: 'EUR', value: '1201.38' }, amountVat: { currency: 'EUR', value: '0.00' }, amountGross: { currency: 'EUR', value: '1201.38' } },
        settlement,
        settledAt,
        '2026-09',
        0,
        ''
      ),
      costToOdooRow(
        { description: 'Point of sale', method: 'pointofsale', count: 1, amountNet: { currency: 'EUR', value: '5.34' }, amountVat: { currency: 'EUR', value: '0.00' }, amountGross: { currency: 'EUR', value: '5.34' } },
        settlement,
        settledAt,
        '2026-09',
        0,
        ''
      ),
    ];

    const [group] = groupSettlementRowsBySettlement(rows);
    expect(group.rows).toHaveLength(3); // informational: all 3 row types are still visible
    expect(group.bookableRows).toHaveLength(1); // but only the kosten row is bookable
    expect(group.bookableRows[0].regeltype).toBe('kosten');
    expect(group.netAmount).toBe(-5.34); // negative — the fee deduction, not a "balanced to 0" figure
  });

  it('puts rows without a settlementId into a single ungrouped bucket', () => {
    const rows: SettlementOdooRow[] = [
      paymentToOdooRow(payment({ id: 'tr_1' }), '', '', ''),
      paymentToOdooRow(payment({ id: 'tr_2' }), '', '', ''),
    ];
    const groups = groupSettlementRowsBySettlement(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].settlementId).toBe('');
    expect(groups[0].rows).toHaveLength(2);
  });

  it('sorts groups by most recent booking date first', () => {
    const rows: SettlementOdooRow[] = [
      { ...paymentToOdooRow(payment({ id: 'tr_1' }), 'REF-OLD', 'stl_old', ''), boekingsdatum: '2026-01-01' },
      { ...paymentToOdooRow(payment({ id: 'tr_2' }), 'REF-NEW', 'stl_new', ''), boekingsdatum: '2026-09-01' },
    ];
    const groups = groupSettlementRowsBySettlement(rows);
    expect(groups.map((g) => g.settlementId)).toEqual(['stl_new', 'stl_old']);
  });
});

describe('settlementGroupToStatementVals', () => {
  it('builds account.bank.statement vals with balance 0/0 and the settlement reference as name', () => {
    const rows = [
      paymentToOdooRow(payment({ id: 'tr_1' }), '14086537.2609.18', 'stl_1', ''),
    ];
    const [group] = groupSettlementRowsBySettlement(rows);
    const vals = settlementGroupToStatementVals(group, 12);
    expect(vals).toMatchObject({
      journal_id: 12,
      name: '14086537.2609.18',
      balance_start: 0,
      balance_end_real: 0,
    });
  });
});

describe('CSV builders', () => {
  it('buildCSVOdoo includes the extended headers', () => {
    const rows = [paymentToOdooRow(payment(), 'REF', 'stl_1', 'inv_1')];
    const csv = buildCSVOdoo(rows);
    expect(csv).toContain('Settlement_ID');
    expect(csv).toContain('Regeltype');
    expect(csv).toContain('tr_abc123');
  });

  it('buildCSVOdooBank only has the minimal 4 columns', () => {
    const rows = [paymentToOdooRow(payment(), 'REF', 'stl_1', 'inv_1')];
    const csv = buildCSVOdooBank(rows);
    const [header] = csv.replace('\uFEFF', '').split('\r\n');
    expect(header).toBe('date,amount,payment_ref,ref');
  });
});

describe('collectSettlementOdooRows', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('combines individual payments with period revenue/cost breakdown rows', async () => {
    const settlement: MollieSettlement = {
      id: 'stl_1',
      reference: '14086537.2609.18',
      createdAt: '2026-09-18T10:00:00+00:00',
      settledAt: '2026-09-18T10:00:00+00:00',
      status: 'paidout',
      amount: { currency: 'EUR', value: '100.00' },
      periods: {
        '2026': {
          '09': {
            revenue: [
              {
                description: 'POS revenue',
                method: 'pointofsale',
                count: 1,
                amountNet: { currency: 'EUR', value: '95.00' },
                amountVat: { currency: 'EUR', value: '5.00' },
                amountGross: { currency: 'EUR', value: '100.00' },
              },
            ],
            costs: [
              {
                description: 'Mollie fees',
                method: null,
                count: 1,
                amountNet: { currency: 'EUR', value: '1.50' },
                amountVat: { currency: 'EUR', value: '0.32' },
                amountGross: { currency: 'EUR', value: '1.82' },
              },
            ],
          },
        },
      },
    };

    global.fetch = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes('/settlements?')) {
        return new Response(
          JSON.stringify({
            count: 1,
            _embedded: { settlements: [settlement] },
            _links: { self: { href } },
          }),
          { status: 200 }
        );
      }
      if (href.includes('/settlements/stl_1/payments')) {
        return new Response(
          JSON.stringify({
            count: 1,
            _embedded: { payments: [payment()] },
            _links: { self: { href } },
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL in test: ${href}`);
    }) as unknown as typeof fetch;

    const { rows, approach, settlementError } = await collectSettlementOdooRows({
      apiKey: 'test-key',
      accessToken: undefined,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(approach).toBe('settlements');
    expect(settlementError).toBe('');
    expect(rows.map((r) => r.regeltype).sort()).toEqual(['betaling', 'kosten', 'omzet']);

    const groups = groupSettlementRowsBySettlement(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].settlementId).toBe('stl_1');
    expect(groups[0].reference).toBe('14086537.2609.18');
    expect(groups[0].rows).toHaveLength(3);
  });

  it('falls back to the Payments API when the Settlements API errors', async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes('/settlements?')) {
        return new Response('access token required', { status: 403 });
      }
      if (href.includes('/payments?')) {
        return new Response(
          JSON.stringify({
            count: 1,
            _embedded: { payments: [payment({ id: 'tr_fallback' })] },
            _links: { self: { href } },
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL in test: ${href}`);
    }) as unknown as typeof fetch;

    const { rows, approach, settlementError } = await collectSettlementOdooRows({
      apiKey: 'test-key',
      accessToken: undefined,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(approach).toBe('payments');
    expect(settlementError).toContain('403');
    expect(rows).toHaveLength(1);
    expect(rows[0].settlementId).toBe('');

    const groups = groupSettlementRowsBySettlement(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].settlementId).toBe('');
  });
});
