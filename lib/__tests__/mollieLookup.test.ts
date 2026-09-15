import { describe, expect, it } from 'vitest';
import {
  applyMollieToRow,
  classifyLookupQuery,
  deriveMatchStatus,
  emptyLookupMessage,
  extractMolliePaymentId,
  isMolliePaymentId,
  lookupRowsToCsv,
  matchStatusLabel,
  parseLookupQuery,
  partnerFromMollieOmschrijving,
  rowFromOdooMoveLine,
  settlementIdFromHref,
  type LookupRow,
} from '@/lib/mollieLookup';

function row(overrides: Partial<LookupRow> = {}): LookupRow {
  return {
    odooMoveName: null,
    odooOrderName: null,
    partnerName: null,
    odooDate: null,
    amount: null,
    currency: 'EUR',
    molliePaymentId: null,
    molliePaymentStatus: null,
    settlementId: null,
    settlementReference: null,
    settledAt: null,
    matchStatus: 'geen_mollie_id',
    ...overrides,
  };
}

describe('extractMolliePaymentId', () => {
  it('reads tr_… from an Odoo 580100 omschrijving', () => {
    expect(
      extractMolliePaymentId('Mollie 502651 - Lien Van Haecke - tr_gV8HHoliPUS1X6xS1PU')
    ).toBe('tr_gV8HHoliPUS1X6xS1PU');
  });

  it('returns the first id when several texts are given', () => {
    expect(extractMolliePaymentId('S02118', 'ref tr_abc123XYZ')).toBe('tr_abc123XYZ');
  });

  it('ignores strings that look similar but are not Mollie ids', () => {
    expect(extractMolliePaymentId('transport', 'tr_', 'trx_123', 'order S02118')).toBeNull();
  });
});

describe('settlementIdFromHref', () => {
  it('reads a settlement id from a Mollie _links href', () => {
    expect(
      settlementIdFromHref('https://api.mollie.com/v2/settlements/stl_abc123?test=1')
    ).toBe('stl_abc123');
    expect(settlementIdFromHref('https://example.com/nope')).toBeNull();
  });
});

describe('query routing', () => {
  it('treats a bare tr_… as a Mollie id lookup', () => {
    expect(isMolliePaymentId('tr_gV8HHoliPUS1X6xS1PU')).toBe(true);
    expect(classifyLookupQuery('tr_gV8HHoliPUS1X6xS1PU')).toBe('mollie_id');
  });

  it('treats order numbers and customer names as Odoo text', () => {
    expect(classifyLookupQuery('S02118')).toBe('odoo_text');
    expect(classifyLookupQuery('Lien Van Haecke')).toBe('odoo_text');
    expect(isMolliePaymentId('S02118')).toBe(false);
  });
});

describe('parseLookupQuery', () => {
  it('trims a valid query', () => {
    expect(parseLookupQuery('  S02118  ')).toEqual({ ok: true, query: 'S02118' });
  });

  it('rejects too short or too long input', () => {
    expect(parseLookupQuery('S').ok).toBe(false);
    expect(parseLookupQuery('x'.repeat(81)).ok).toBe(false);
  });
});

describe('match status', () => {
  it('maps the four statuses', () => {
    expect(
      deriveMatchStatus({
        molliePaymentId: 'tr_abc',
        paymentFound: true,
        settlementId: 'stl_1',
      })
    ).toBe('uitbetaald');
    expect(
      deriveMatchStatus({
        molliePaymentId: 'tr_abc',
        paymentFound: true,
        settlementId: null,
      })
    ).toBe('in_transit');
    expect(
      deriveMatchStatus({
        molliePaymentId: null,
        paymentFound: false,
        settlementId: null,
      })
    ).toBe('geen_mollie_id');
    expect(
      deriveMatchStatus({
        molliePaymentId: 'tr_abc',
        paymentFound: false,
        settlementId: null,
      })
    ).toBe('niet_in_mollie');
  });

  it('labels statuses in Dutch', () => {
    expect(matchStatusLabel('uitbetaald')).toBe('Uitbetaald');
    expect(matchStatusLabel('in_transit')).toBe('Nog in transit');
    expect(matchStatusLabel('geen_mollie_id')).toBe('Geen Mollie-id in de boeking');
    expect(matchStatusLabel('niet_in_mollie')).toBe('Niet gevonden in Mollie');
  });
});

describe('applyMollieToRow', () => {
  it('marks a paid settlement as uitbetaald', () => {
    const result = applyMollieToRow(
      row({
        partnerName: 'Lien Van Haecke',
        molliePaymentId: 'tr_gV8HHoliPUS1X6xS1PU',
      }),
      { id: 'tr_gV8HHoliPUS1X6xS1PU', status: 'paid', description: 'S02118' },
      { id: 'stl_x', reference: '1234567.2409.01', settledAt: '2025-10-02T08:00:00+00:00' }
    );
    expect(result.matchStatus).toBe('uitbetaald');
    expect(result.molliePaymentStatus).toBe('paid');
    expect(result.settlementReference).toBe('1234567.2409.01');
    expect(result.odooOrderName).toBe('S02118');
  });

  it('keeps in_transit when Mollie has no settlement', () => {
    const result = applyMollieToRow(
      row({ molliePaymentId: 'tr_abc' }),
      { id: 'tr_abc', status: 'paid' },
      null
    );
    expect(result.matchStatus).toBe('in_transit');
    expect(result.settlementId).toBeNull();
  });
});

describe('rowFromOdooMoveLine', () => {
  it('reads the customer from a Mollie 580100 omschrijving', () => {
    expect(
      partnerFromMollieOmschrijving('Mollie 502651 - Lien Van Haecke - tr_gV8HHoliPUS1X6xS1PU')
    ).toBe('Lien Van Haecke');
  });

  it('builds a row from a 580100 line and pulls the tr_…', () => {
    const result = rowFromOdooMoveLine({
      name: 'Mollie 502651 - Lien Van Haecke - tr_gV8HHoliPUS1X6xS1PU',
      date: '2026-01-28',
      amount_residual: 94.56,
      debit: 94.56,
      partner_id: [12, 'Lien Van Haecke'],
      move_name: 'Moll/2026/01/0032',
    });
    expect(result.molliePaymentId).toBe('tr_gV8HHoliPUS1X6xS1PU');
    expect(result.partnerName).toBe('Lien Van Haecke');
    expect(result.amount).toBe(94.56);
    expect(result.odooMoveName).toBe('Moll/2026/01/0032');
    expect(result.odooDate).toBe('2026-01-28');
  });

  it('prefers the omschrijving customer over partner Mollie B.v.', () => {
    const result = rowFromOdooMoveLine({
      name: 'Mollie 502164 - Ezra Becu - tr_PWqhfMPjynxC2Bbb9cbFJ',
      partner_id: [1, 'Mollie B.v.'],
      amount_residual: 55,
    });
    expect(result.partnerName).toBe('Ezra Becu');
  });
});

describe('CSV and empty copy', () => {
  it('names the query in the empty-state message', () => {
    expect(emptyLookupMessage('S02118')).toBe(
      'Geen Odoo-order of betaling gevonden voor S02118.'
    );
  });

  it('writes Dutch headers and one sample row', () => {
    const csv = lookupRowsToCsv([
      row({
        odooOrderName: 'S02118',
        partnerName: 'Lien Van Haecke',
        odooDate: '2025-09-28',
        amount: 91.26,
        molliePaymentId: 'tr_abc',
        molliePaymentStatus: 'paid',
        settlementReference: '1234567.2409.01',
        settledAt: '2025-10-02',
        matchStatus: 'uitbetaald',
      }),
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Order/factuur');
    expect(csv).toContain('Match-status');
    expect(csv).toContain('S02118');
    expect(csv).toContain('Uitbetaald');
    expect(csv).toContain('tr_abc');
  });
});
