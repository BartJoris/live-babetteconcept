import { describe, expect, it } from 'vitest';
import {
  actionCategoryLabel,
  assembleInsights,
  buildProcesses,
  categorizeMove,
  categorizePayment,
  classifyUsers,
  dateOnly,
  entriesFromOdooRecords,
  estimateWorkEffort,
  formatDurationMinutes,
  frequencyLabel,
  groupEntries,
  isHouseUser,
  isSystemUser,
  isVatRelated,
  many2oneId,
  many2oneName,
  parseOdooDatetime,
  periodKey,
  periodLabel,
  summarizeEntries,
  type AccountingEntry,
} from '@/lib/accounting/insights';

function entry(overrides: Partial<AccountingEntry> & Pick<AccountingEntry, 'id' | 'category' | 'date'>): AccountingEntry {
  return {
    source: 'account.move',
    createDate: overrides.date,
    createAt: null,
    estimatedMinutes: 0,
    amount: 100,
    state: 'posted',
    ref: null,
    name: null,
    partnerName: null,
    journalName: null,
    userName: 'Boekhouder',
    userId: 12,
    ...overrides,
  };
}

describe('many2one helpers', () => {
  it('reads id and name from an Odoo tuple', () => {
    expect(many2oneId([4, 'Margot'])).toBe(4);
    expect(many2oneName([4, 'Margot'])).toBe('Margot');
  });

  it('returns null for false or empty values', () => {
    expect(many2oneId(false)).toBeNull();
    expect(many2oneName(false)).toBeNull();
    expect(many2oneName([4, ''])).toBeNull();
  });
});

describe('parseOdooDatetime / formatDurationMinutes', () => {
  it('parses naive Odoo UTC timestamps', () => {
    const parsed = parseOdooDatetime('2025-03-15 10:22:33');
    expect(parsed?.toISOString()).toBe('2025-03-15T10:22:33.000Z');
  });

  it('formats hours and minutes in Dutch shorthand', () => {
    expect(formatDurationMinutes(0)).toBe('0 min');
    expect(formatDurationMinutes(3)).toBe('3 min');
    expect(formatDurationMinutes(90)).toBe('1 u 30 min');
    expect(formatDurationMinutes(120)).toBe('2 u');
  });
});

describe('estimateWorkEffort', () => {
  it('treats actions within 30 minutes as one session', () => {
    const result = estimateWorkEffort([
      entry({
        id: 1,
        category: 'in_invoice',
        date: '2025-03-15',
        createAt: '2025-03-15T09:00:00.000Z',
      }),
      entry({
        id: 2,
        category: 'in_invoice',
        date: '2025-03-15',
        createAt: '2025-03-15T09:10:00.000Z',
      }),
    ]);
    expect(result.sessions).toHaveLength(1);
    expect(result.estimatedMinutes).toBe(13);
    expect(result.entries[0].estimatedMinutes).toBe(6.5);
    expect(result.users[0]).toMatchObject({ userId: 12, sessionCount: 1, actionCount: 2 });
  });

  it('starts a new session after a 30+ minute gap', () => {
    const result = estimateWorkEffort([
      entry({
        id: 1,
        category: 'in_invoice',
        date: '2025-03-15',
        createAt: '2025-03-15T09:00:00.000Z',
      }),
      entry({
        id: 2,
        category: 'in_invoice',
        date: '2025-03-15',
        createAt: '2025-03-15T09:40:00.000Z',
      }),
    ]);
    expect(result.sessions).toHaveLength(2);
    expect(result.estimatedMinutes).toBe(6);
  });

  it('caps a continuous session at 8 hours', () => {
    const entries = Array.from({ length: 25 }, (_, index) => {
      const at = new Date(Date.UTC(2025, 2, 15, 0, index * 25, 0)).toISOString();
      return entry({
        id: index + 1,
        category: 'entry',
        date: '2025-03-15',
        createAt: at,
      });
    });
    const result = estimateWorkEffort(entries);
    expect(result.sessions).toHaveLength(1);
    expect(result.estimatedMinutes).toBe(480);
  });
});

describe('dateOnly', () => {
  it('slices datetime values to YYYY-MM-DD', () => {
    expect(dateOnly('2025-03-15 10:22:33')).toBe('2025-03-15');
    expect(dateOnly('2025-03-15')).toBe('2025-03-15');
  });

  it('rejects invalid strings', () => {
    expect(dateOnly('15/03/2025')).toBeNull();
    expect(dateOnly(null)).toBeNull();
  });
});

describe('user classification', () => {
  it('treats Margot as house user regardless of casing', () => {
    expect(isHouseUser({ name: 'Margot', login: 'margot' })).toBe(true);
    expect(isHouseUser({ name: 'MARGOT Babette', login: 'shop' })).toBe(true);
    expect(isHouseUser({ name: 'Admin', login: 'margot.pos' })).toBe(true);
  });

  it('does not treat the accountant as house user', () => {
    expect(isHouseUser({ name: 'Pieter Accountant', login: 'pieter' })).toBe(false);
  });

  it('identifies system users', () => {
    expect(isSystemUser({ id: 1, name: 'OdooBot', login: '__system__' })).toBe(true);
    expect(isSystemUser({ id: 4, name: 'Public user', login: 'public' })).toBe(true);
    expect(isSystemUser({ id: 8, name: 'Pieter', login: 'pieter' })).toBe(false);
  });

  it('splits house, partner and system users', () => {
    const classified = classifyUsers([
      { id: 1, name: 'OdooBot', login: '__system__' },
      { id: 6, name: 'Margot', login: 'margot' },
      { id: 12, name: 'Pieter', login: 'pieter' },
    ]);
    expect(classified.houseUsers.map((u) => u.id)).toEqual([6]);
    expect(classified.partnerUsers.map((u) => u.id)).toEqual([12]);
    expect(classified.systemUsers.map((u) => u.id)).toEqual([1]);
  });
});

describe('categorizeMove', () => {
  it('maps invoice and refund types', () => {
    expect(categorizeMove('in_invoice', null, null, null)).toBe('in_invoice');
    expect(categorizeMove('in_receipt', null, null, null)).toBe('in_invoice');
    expect(categorizeMove('out_refund', null, null, null)).toBe('out_refund');
  });

  it('flags VAT journal entries separately', () => {
    expect(categorizeMove('entry', 'BTW', 'VAT return', null)).toBe('vat_entry');
    expect(categorizeMove('entry', 'Algemeen', 'Correctie voorraad', null)).toBe('entry');
  });
});

describe('categorizePayment', () => {
  it('splits inbound and outbound', () => {
    expect(categorizePayment('inbound')).toBe('payment_inbound');
    expect(categorizePayment('outbound')).toBe('payment_outbound');
    expect(categorizePayment(undefined)).toBe('payment_outbound');
  });
});

describe('isVatRelated', () => {
  it('matches common VAT terms', () => {
    expect(isVatRelated('Journaal BTW')).toBe(true);
    expect(isVatRelated('VAT Return Q1')).toBe(true);
    expect(isVatRelated('Algemeen')).toBe(false);
  });
});

describe('period grouping', () => {
  it('builds month and quarter keys', () => {
    expect(periodKey('2025-03-15', 'month')).toBe('2025-03');
    expect(periodKey('2025-03-15', 'quarter')).toBe('2025-Q1');
    expect(periodKey('2025-10-01', 'quarter')).toBe('2025-Q4');
  });

  it('labels periods in Dutch', () => {
    expect(periodLabel('2025-01', 'month')).toMatch(/januari 2025/i);
    expect(periodLabel('2025-Q2', 'quarter')).toBe('Q2 2025');
  });

  it('groups newest period first and sums amounts as absolute', () => {
    const periods = groupEntries(
      [
        entry({ id: 1, category: 'in_invoice', date: '2025-01-10', amount: 50 }),
        entry({ id: 2, category: 'in_invoice', date: '2025-03-02', amount: -20 }),
        entry({ id: 3, category: 'payment_outbound', date: '2025-03-20', amount: 80 }),
      ],
      'quarter'
    );
    expect(periods).toHaveLength(1);
    expect(periods[0].key).toBe('2025-Q1');
    expect(periods[0].totalCount).toBe(3);
    expect(periods[0].totalAmount).toBe(150);
    expect(periods[0].entries[0].id).toBe(3);
  });
});

describe('summarizeEntries / processes', () => {
  it('omits empty categories and keeps display order', () => {
    const summary = summarizeEntries([
      entry({ id: 1, category: 'entry', date: '2025-04-01' }),
      entry({ id: 2, category: 'in_invoice', date: '2025-04-02' }),
      entry({ id: 3, category: 'in_invoice', date: '2025-04-03' }),
    ]);
    expect(summary.map((row) => row.category)).toEqual(['in_invoice', 'entry']);
    expect(summary[0].count).toBe(2);
  });

  it('builds a playbook with frequency per period', () => {
    const periods = groupEntries(
      [
        entry({ id: 1, category: 'in_invoice', date: '2025-01-10' }),
        entry({ id: 2, category: 'in_invoice', date: '2025-02-10' }),
        entry({ id: 3, category: 'bank_statement', date: '2025-02-12' }),
      ],
      'month'
    );
    const processes = buildProcesses(periods, 'month');
    expect(processes[0].category).toBe('in_invoice');
    expect(processes[0].count).toBe(2);
    expect(processes[0].periods).toEqual([
      periodLabel('2025-02', 'month'),
      periodLabel('2025-01', 'month'),
    ]);
    expect(processes[0].avgPerPeriod).toBe(1);
    expect(frequencyLabel(1, 'month')).toContain('per maand');
  });
});

describe('actionCategoryLabel', () => {
  it('returns Dutch labels', () => {
    expect(actionCategoryLabel('in_invoice')).toBe('Aankoopfactuur');
    expect(actionCategoryLabel('bank_statement')).toBe('Bankafschrift / Reconciliatie');
  });
});

describe('entriesFromOdooRecords', () => {
  it('drops Margot and payment-linked moves', () => {
    const entries = entriesFromOdooRecords({
      partnerIds: new Set([12]),
      payments: [
        {
          id: 90,
          date: '2025-03-01',
          create_uid: [12, 'Pieter'],
          amount: 40,
          payment_type: 'outbound',
          move_id: [501, 'PAY/2025/0001'],
          state: 'posted',
          name: 'PAY/2025/0001',
        },
      ],
      bankLines: [],
      moves: [
        {
          id: 501,
          date: '2025-03-01',
          create_uid: [12, 'Pieter'],
          move_type: 'entry',
          amount_total: 40,
          name: 'PAY/2025/0001',
        },
        {
          id: 700,
          date: '2025-03-02',
          create_uid: [12, 'Pieter'],
          move_type: 'in_invoice',
          amount_total: 120,
          partner_id: [3, 'Play Up'],
          journal_id: [2, 'Aankopen'],
          name: 'BILL/2025/0007',
        },
        {
          id: 701,
          date: '2025-03-03',
          create_uid: [6, 'Margot'],
          move_type: 'out_invoice',
          amount_total: 999,
        },
      ],
    });

    expect(entries.map((row) => row.source)).toEqual(['account.payment', 'account.move']);
    expect(entries[1].category).toBe('in_invoice');
    expect(entries[1].partnerName).toBe('Play Up');
  });

  it('falls back to name filtering when partner ids are unknown', () => {
    const entries = entriesFromOdooRecords({
      partnerIds: null,
      payments: [],
      bankLines: [],
      moves: [
        {
          id: 1,
          date: '2025-06-01',
          create_uid: [6, 'Margot'],
          move_type: 'out_invoice',
          amount_total: 10,
        },
        {
          id: 2,
          date: '2025-06-02',
          create_uid: [12, 'Pieter'],
          move_type: 'entry',
          journal_id: [9, 'BTW'],
          amount_total: 5,
        },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('vat_entry');
  });
});

describe('assembleInsights', () => {
  it('lists active partner users and overall totals', () => {
    const insights = assembleInsights(
      [
        entry({ id: 1, category: 'in_invoice', date: '2025-01-10', userId: 12, userName: 'Pieter' }),
        entry({ id: 2, category: 'in_invoice', date: '2025-04-10', userId: 12, userName: 'Pieter' }),
      ],
      {
        dateFrom: '2025-01-01',
        dateTo: '2025-06-30',
        groupBy: 'quarter',
        houseUsers: [{ id: 6, name: 'Margot', login: 'margot' }],
        partnerUsers: [
          { id: 12, name: 'Pieter', login: 'pieter' },
          { id: 13, name: 'Inactief', login: 'inactive' },
        ],
      }
    );
    expect(insights.totalCount).toBe(2);
    expect(insights.periods.map((p) => p.key)).toEqual(['2025-Q2', '2025-Q1']);
    expect(insights.partnerUsersActive.map((u) => u.id)).toEqual([12]);
    expect(insights.processes[0].label).toBe('Aankoopfactuur');
    expect(insights.effort.estimatedMinutes).toBe(6);
    expect(insights.effort.sessionCount).toBe(2);
  });
});
