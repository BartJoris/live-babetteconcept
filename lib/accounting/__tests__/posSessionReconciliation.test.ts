import { describe, expect, it } from 'vitest';
import {
  extractPosSessionId,
  groupOutstandingReceiptsByPosSession,
  type OutstandingReceiptLine,
} from '@/lib/accounting/posSessionReconciliation';

function line(overrides: Partial<OutstandingReceiptLine> & { id: number }): OutstandingReceiptLine {
  return {
    date: '2026-09-23',
    name: null,
    debit: 0,
    credit: 0,
    moveId: null,
    moveName: null,
    partnerName: null,
    ...overrides,
  };
}

describe('extractPosSessionId', () => {
  it('reads the numeric session id from an Odoo POS payment line name', () => {
    expect(
      extractPosSessionId(
        'pos_session_id=1412,payment_uuid=d5370610-8385-4b3b-be3b-9138dceb7d21 payment pointofsale'
      )
    ).toBe(1412);
  });

  it('returns null for lines without the pattern', () => {
    expect(extractPosSessionId('Mollie: S03248')).toBeNull();
    expect(extractPosSessionId(null)).toBeNull();
    expect(extractPosSessionId(undefined)).toBeNull();
  });
});

describe('groupOutstandingReceiptsByPosSession', () => {
  it('groups lines by session and flags a balanced session (debit = credit)', () => {
    const lines = [
      line({ id: 1, name: 'pos_session_id=1412,payment_uuid=a payment pointofsale', credit: 128.45 }),
      line({ id: 2, name: 'pos_session_id=1412', debit: 128.45, moveName: 'Molli/2026/03848' }),
    ];
    const groups = groupOutstandingReceiptsByPosSession(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0].posSessionId).toBe(1412);
    expect(groups[0].totalDebit).toBe(128.45);
    expect(groups[0].totalCredit).toBe(128.45);
    expect(groups[0].difference).toBe(0);
    expect(groups[0].balanced).toBe(true);
  });

  it('flags an unbalanced session where debit and credit differ', () => {
    const lines = [
      line({ id: 1, name: 'pos_session_id=1411,payment_uuid=a', credit: 89 }),
    ];
    const groups = groupOutstandingReceiptsByPosSession(lines);
    expect(groups[0].balanced).toBe(false);
    expect(groups[0].difference).toBe(-89);
  });

  it('puts lines without a pos_session_id in an always-unbalanced null group, sorted last', () => {
    const lines = [
      line({ id: 1, name: 'pos_session_id=1412,payment_uuid=a', credit: 10, debit: 10 }), // balanced, small diff
      line({ id: 2, name: 'Mollie: S03248', debit: 49.95 }),
      line({ id: 3, name: 'Handmatig: Voeg kassabetalingen samen', debit: 201.95 }),
    ];
    const groups = groupOutstandingReceiptsByPosSession(lines);
    expect(groups.at(-1)!.posSessionId).toBeNull();
    expect(groups.at(-1)!.balanced).toBe(false);
    expect(groups.at(-1)!.lines).toHaveLength(2);
  });

  it('sorts sessions by largest absolute difference first', () => {
    const lines = [
      line({ id: 1, name: 'pos_session_id=1', credit: 100 }), // diff -100
      line({ id: 2, name: 'pos_session_id=2', credit: 10 }), // diff -10
      line({ id: 3, name: 'pos_session_id=3', credit: 5, debit: 5 }), // diff 0
    ];
    const groups = groupOutstandingReceiptsByPosSession(lines);
    expect(groups.map((g) => g.posSessionId)).toEqual([1, 2, 3]);
  });

  it('respects a custom tolerance for rounding differences', () => {
    const lines = [line({ id: 1, name: 'pos_session_id=1', debit: 100, credit: 100.005 })];
    expect(groupOutstandingReceiptsByPosSession(lines, 0.01)[0].balanced).toBe(true);
    expect(groupOutstandingReceiptsByPosSession(lines, 0)[0].balanced).toBe(false);
  });
});
