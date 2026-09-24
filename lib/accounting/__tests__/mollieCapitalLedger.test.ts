import { describe, expect, it } from 'vitest';
import {
  buildCapitalRepaymentRows,
  buildInvoiceCompensationRows,
  buildMollieCapitalLedger,
  buildPaymentSettlementMap,
  groupLedgerRowsBySettlement,
  ledgerCategoryLabel,
  ledgerRowToBankLineVals,
  resolveSettlementForDate,
  sortSettlementDateRefsAsc,
  summarizeLedgerByCategory,
  withheldFeesRowsFromSettlementRows,
  type SettlementDateRef,
} from '@/lib/accounting/mollieCapitalLedger';
import type { MollieBalanceTransaction } from '@/lib/mollieBalanceTransactions';
import type { SettlementOdooRow } from '@/lib/mollieSettlementShared';

function settlementRef(overrides: Partial<SettlementDateRef>): SettlementDateRef {
  return { id: 'stl_1', reference: 'REF-1', dateIso: '2026-08-19', ...overrides };
}

function balanceTx(overrides: Partial<MollieBalanceTransaction>): MollieBalanceTransaction {
  return {
    resource: 'balance-transaction',
    id: 'baltr_1',
    type: 'payment',
    resultAmount: { currency: 'EUR', value: '10.00' },
    initialAmount: { currency: 'EUR', value: '10.00' },
    createdAt: '2026-08-19T12:00:00+00:00',
    ...overrides,
  };
}

function costRow(overrides: Partial<SettlementOdooRow> = {}): SettlementOdooRow {
  return {
    datum: '2026-08-19',
    betaalmethode: '',
    valuta: 'EUR',
    bedrag: '42.86',
    status: '',
    id: '',
    omschrijving: 'Withheld fees MOL-NL-R2026.0000598131',
    naamConsument: '',
    rekeningConsument: '',
    bicConsument: '',
    uitbetalingsvaluta: 'EUR',
    uitbetalingsbedrag: '-42.86',
    uitbetalingsreferentie: '14086537.2608.19',
    teruggestortBedrag: '',
    descriptionOdoo: 'Withheld fees MOL-NL-R2026.0000598131',
    datumDdMmYyyy: '19/08/2026',
    settlementId: 'stl_aug19',
    boekingsdatum: '2026-08-19',
    regeltype: 'kosten',
    uniekeImportId: 'stl_aug19:cost:2026-08:0',
    mollieInvoiceId: 'MOL-NL-R2026.0000598131',
    mollieModus: '',
    ...overrides,
  };
}

describe('ledgerCategoryLabel', () => {
  it('labels the three ledger categories', () => {
    expect(ledgerCategoryLabel('withheld_fees')).toBe('Withheld fees (Mollie)');
    expect(ledgerCategoryLabel('invoice_compensation')).toBe('Invoice Compensation');
    expect(ledgerCategoryLabel('capital_repayment')).toBe('Terugbetaling Mollie Capital');
  });
});

describe('sortSettlementDateRefsAsc / resolveSettlementForDate', () => {
  const settlements = [
    settlementRef({ id: 'stl_c', reference: 'C', dateIso: '2026-08-21' }),
    settlementRef({ id: 'stl_a', reference: 'A', dateIso: '2026-08-19' }),
    settlementRef({ id: 'stl_b', reference: 'B', dateIso: '2026-08-20' }),
  ];

  it('sorts ascending by date', () => {
    const sorted = sortSettlementDateRefsAsc(settlements);
    expect(sorted.map((s) => s.reference)).toEqual(['A', 'B', 'C']);
  });

  it('picks the earliest settlement on or after the given date (next payout)', () => {
    const sorted = sortSettlementDateRefsAsc(settlements);
    expect(resolveSettlementForDate('2026-08-19', sorted)?.reference).toBe('A');
    expect(resolveSettlementForDate('2026-08-20', sorted)?.reference).toBe('B');
    // A transaction timestamped late on the 19th still resolves to the settlement whose date is >= that string
    expect(resolveSettlementForDate('2026-08-19T23:59:59', sorted)?.reference).toBe('B');
  });

  it('returns null when no settlement covers that date yet (not settled yet)', () => {
    const sorted = sortSettlementDateRefsAsc(settlements);
    expect(resolveSettlementForDate('2026-08-25', sorted)).toBeNull();
  });
});

describe('withheldFeesRowsFromSettlementRows', () => {
  it('maps kosten-rows to ledger rows and ignores other regeltypes', () => {
    const rows = withheldFeesRowsFromSettlementRows([
      costRow(),
      { ...costRow(), regeltype: 'betaling', uniekeImportId: 'other' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'withheld_fees',
      date: '2026-08-19',
      reference: 'MOL-NL-R2026.0000598131',
      amount: -42.86,
      settlementReference: '14086537.2608.19',
      settlementId: 'stl_aug19',
      uniqueId: 'stl_aug19:cost:2026-08:0',
    });
  });
});

describe('buildInvoiceCompensationRows', () => {
  it('builds one row per invoice-compensation transaction, resolving the MOL-NL reference', () => {
    const settlements = sortSettlementDateRefsAsc([settlementRef({ dateIso: '2026-09-02', reference: 'REF-SEP-02', id: 'stl_sep2' })]);
    const tx = balanceTx({
      id: 'baltr_invcomp1',
      type: 'invoice-compensation',
      resultAmount: { currency: 'EUR', value: '0.52' },
      createdAt: '2026-09-01T08:00:00+00:00',
      context: { invoiceId: 'inv_abc' },
    });
    const rows = buildInvoiceCompensationRows([tx], new Map([['inv_abc', 'MOL-NL-R2026.0000598131']]), settlements);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'invoice_compensation',
      date: '2026-09-01',
      reference: 'MOL-NL-R2026.0000598131',
      description: 'Invoice Compensation MOL-NL-R2026.0000598131',
      amount: 0.52,
      settlementReference: 'REF-SEP-02',
      uniqueId: 'baltr_invcomp1',
    });
  });

  it('falls back to the raw invoiceId when no reference was resolved, and ignores other types', () => {
    const tx = balanceTx({ type: 'invoice-compensation', context: { invoiceId: 'inv_unknown' } });
    const other = balanceTx({ type: 'payment' });
    const rows = buildInvoiceCompensationRows([tx, other], new Map(), []);
    expect(rows).toHaveLength(1);
    expect(rows[0].reference).toBe('inv_unknown');
    expect(rows[0].settlementReference).toBe('');
  });
});

describe('buildPaymentSettlementMap', () => {
  it('maps a betaling-row payment id to its settlement, using the settlement’s real settle-date', () => {
    const rows: SettlementOdooRow[] = [
      {
        ...costRow(),
        regeltype: 'betaling',
        uniekeImportId: 'tr_abc',
        settlementId: 'stl_x',
        uitbetalingsreferentie: 'REF-X',
        boekingsdatum: '2026-09-20', // payment date — should NOT end up on the map
      },
      { ...costRow(), regeltype: 'kosten', uniekeImportId: 'tr_kosten' }, // not a betaling, ignored
    ];
    const settlementsById = new Map([['stl_x', settlementRef({ id: 'stl_x', reference: 'REF-X', dateIso: '2026-09-24' })]]);
    const map = buildPaymentSettlementMap(rows, settlementsById);
    expect(map.get('tr_abc')).toMatchObject({ id: 'stl_x', reference: 'REF-X', dateIso: '2026-09-24' });
    expect(map.has('tr_kosten')).toBe(false);
  });

  it('falls back to the betaling row’s own date when the settlement isn’t in settlementsById', () => {
    const rows: SettlementOdooRow[] = [
      { ...costRow(), regeltype: 'betaling', uniekeImportId: 'tr_abc', settlementId: 'stl_missing', uitbetalingsreferentie: 'REF-X', boekingsdatum: '2026-09-20' },
    ];
    const map = buildPaymentSettlementMap(rows, new Map());
    expect(map.get('tr_abc')).toMatchObject({ id: 'stl_missing', reference: 'REF-X', dateIso: '2026-09-20' });
  });
});

describe('buildCapitalRepaymentRows', () => {
  it('attributes the repayment to the settlement that actually included the payment, not the payment date', () => {
    // Real-world case that exposed the original bug: a payment made on 20 sep only got settled on 24 sep
    // (4-day lag). Grouping by transaction date alone would (wrongly) attach the deduction to whichever
    // settlement happens to fall right after the 20th — it must instead follow the payment to the 24th.
    const paymentSettlementMap = new Map([
      ['tr_pos1', { id: 'stl_24', reference: '14086537.2609.24', dateIso: '2026-09-24' }],
    ]);
    const transactions = [
      balanceTx({
        id: 'baltr_p1',
        createdAt: '2026-09-20T10:17:22+00:00', // paid on the 20th
        context: { paymentId: 'tr_pos1', paymentDescription: 'POS' },
        deductionDetails: { repayments: { currency: 'EUR', value: '-240.29' } },
      }),
    ];
    const rows = buildCapitalRepaymentRows(transactions, paymentSettlementMap);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'capital_repayment',
      date: '2026-09-24',
      description: 'Terugbetaling voor Mollie Capital',
      amount: -240.29,
      settlementReference: '14086537.2609.24',
      settlementId: 'stl_24',
      uniqueId: 'capital-repayment:14086537.2609.24',
    });
  });

  it('sums multiple payments that settled together into one row per settlement', () => {
    const paymentSettlementMap = new Map([
      ['tr_a', { id: 'stl_1', reference: 'REF-1', dateIso: '2026-08-19' }],
      ['tr_b', { id: 'stl_1', reference: 'REF-1', dateIso: '2026-08-19' }],
    ]);
    const transactions = [
      balanceTx({ context: { paymentId: 'tr_a' }, deductionDetails: { repayments: { currency: 'EUR', value: '-11.39' } } }),
      balanceTx({ context: { paymentId: 'tr_b' }, deductionDetails: { repayments: { currency: 'EUR', value: '-24.79' } } }),
      balanceTx({ context: { paymentId: 'tr_c' } }), // no repayment
    ];
    const rows = buildCapitalRepaymentRows(transactions, paymentSettlementMap);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-36.18);
    expect(rows[0].settlementReference).toBe('REF-1');
  });

  it('marks the payment as unresolved (no settlement guess) when it is not yet in any known settlement', () => {
    // This is the safe replacement for the old date-based guess, which could misattribute a pending
    // payment to an already-closed settlement dated the same day. Better to show "not yet known" than
    // to silently pick a wrong afschrift.
    const transactions = [
      balanceTx({
        createdAt: '2026-09-24T12:00:00+00:00',
        context: { paymentId: 'tr_not_settled_yet' },
        deductionDetails: { repayments: { currency: 'EUR', value: '-5' } },
      }),
    ];
    const rows = buildCapitalRepaymentRows(transactions, new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain('nog niet afgerekend');
    expect(rows[0].settlementReference).toBe('');
    expect(rows[0].date).toBe('2026-09-24');
  });

  it('skips buckets where the total rounds to zero', () => {
    const transactions = [
      balanceTx({ createdAt: '2026-08-19T09:00:00+00:00', deductionDetails: { repayments: { currency: 'EUR', value: '0.001' } } }),
    ];
    expect(buildCapitalRepaymentRows(transactions, new Map())).toHaveLength(0);
  });

  it('keeps separate rows for payments that settled in different settlements', () => {
    const paymentSettlementMap = new Map([
      ['tr_a', { id: 'stl_1', reference: 'REF-1', dateIso: '2026-08-19' }],
      ['tr_b', { id: 'stl_2', reference: 'REF-2', dateIso: '2026-08-20' }],
    ]);
    const transactions = [
      balanceTx({ context: { paymentId: 'tr_a' }, deductionDetails: { repayments: { currency: 'EUR', value: '-10' } } }),
      balanceTx({ context: { paymentId: 'tr_b' }, deductionDetails: { repayments: { currency: 'EUR', value: '-20' } } }),
    ];
    const rows = buildCapitalRepaymentRows(transactions, paymentSettlementMap);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.settlementReference).sort()).toEqual(['REF-1', 'REF-2']);
  });
});

describe('buildMollieCapitalLedger', () => {
  it('combines all three sources, attributing the capital repayment via the betaling-row payment id', () => {
    const settlements = [settlementRef({ dateIso: '2026-08-19', reference: '14086537.2608.19', id: 'stl_aug19' })];
    const rows = buildMollieCapitalLedger({
      withheldFeesSettlementRows: [
        costRow({ boekingsdatum: '2026-08-19' }),
        {
          ...costRow(),
          regeltype: 'betaling',
          uniekeImportId: 'tr_pos1',
          settlementId: 'stl_aug19',
          uitbetalingsreferentie: '14086537.2608.19',
          boekingsdatum: '2026-08-19',
        },
      ],
      balanceTransactions: [
        balanceTx({
          id: 'baltr_ic',
          type: 'invoice-compensation',
          createdAt: '2026-08-19T08:00:00+00:00',
          context: { invoiceId: 'inv_x' },
        }),
        balanceTx({
          id: 'baltr_cap',
          createdAt: '2026-08-19T09:00:00+00:00',
          context: { paymentId: 'tr_pos1' },
          deductionDetails: { repayments: { currency: 'EUR', value: '-5' } },
        }),
      ],
      invoiceReferenceByInvoiceId: new Map([['inv_x', 'MOL-NL-REF-X']]),
      settlements,
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.category)).toEqual(['capital_repayment', 'invoice_compensation', 'withheld_fees']);
    expect(rows.every((r) => r.settlementReference === '14086537.2608.19')).toBe(true);
    expect(rows.find((r) => r.category === 'capital_repayment')?.amount).toBe(-5);
  });
});

describe('summarizeLedgerByCategory', () => {
  it('counts and sums per category, matching the bookkeeper Summary sheet shape', () => {
    const rows = buildMollieCapitalLedger({
      withheldFeesSettlementRows: [costRow(), costRow({ uniekeImportId: 'x2', uitbetalingsbedrag: '-1.00' })],
      balanceTransactions: [],
      invoiceReferenceByInvoiceId: new Map(),
      settlements: [],
    });
    const summary = summarizeLedgerByCategory(rows);
    expect(summary).toEqual([{ category: 'withheld_fees', count: 2, total: -43.86 }]);
  });
});

describe('groupLedgerRowsBySettlement', () => {
  it('groups rows by settlement reference and sums the net amount', () => {
    const rows = [
      { date: '2026-08-19', category: 'withheld_fees' as const, reference: 'r1', description: 'd', amount: -10, settlementReference: 'REF-19', settlementId: 'stl_19', uniqueId: 'u1' },
      { date: '2026-08-19', category: 'capital_repayment' as const, reference: '', description: 'd', amount: -5, settlementReference: 'REF-19', settlementId: 'stl_19', uniqueId: 'u2' },
      { date: '2026-08-25', category: 'invoice_compensation' as const, reference: 'r2', description: 'd', amount: 1, settlementReference: '', settlementId: '', uniqueId: 'u3' },
    ];
    const groups = groupLedgerRowsBySettlement(rows);
    expect(groups).toHaveLength(2);
    const ref19 = groups.find((g) => g.settlementReference === 'REF-19')!;
    expect(ref19.rows).toHaveLength(2);
    expect(ref19.netAmount).toBe(-15);
    const unresolved = groups.find((g) => g.settlementReference === '')!;
    expect(unresolved.rows).toHaveLength(1);
  });
});

describe('ledgerRowToBankLineVals', () => {
  it('builds account.bank.statement.line vals from a ledger row', () => {
    const vals = ledgerRowToBankLineVals(
      {
        date: '2026-08-19',
        category: 'capital_repayment',
        reference: '',
        description: 'Terugbetaling voor Mollie Capital',
        amount: -36.18,
        settlementReference: 'REF-19',
        settlementId: 'stl_19',
        uniqueId: 'capital-repayment:2026-08-19',
      },
      12
    );
    expect(vals).toEqual({
      journal_id: 12,
      date: '2026-08-19',
      amount: -36.18,
      payment_ref: 'Terugbetaling voor Mollie Capital',
      ref: 'capital-repayment:2026-08-19',
    });
  });
});
