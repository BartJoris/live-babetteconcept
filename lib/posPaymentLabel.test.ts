import { describe, expect, it } from 'vitest';
import { nonMolliePaymentMarks } from './posPaymentLabel';

describe('nonMolliePaymentMarks', () => {
  it('hides Mollie, Mollie QR and Mollie online', () => {
    expect(nonMolliePaymentMarks([{ name: 'Mollie' }])).toEqual([]);
    expect(nonMolliePaymentMarks([{ name: 'Mollie QR' }])).toEqual([]);
    expect(nonMolliePaymentMarks([{ name: 'Mollie online' }])).toEqual([]);
  });

  it('marks Cash', () => {
    expect(nonMolliePaymentMarks([{ name: 'Cash' }])).toEqual([
      { kind: 'cash', label: 'Cash', shortLabel: 'Cash' },
    ]);
  });

  it('marks Overschrijving and Overschrijving QR as transfer', () => {
    expect(nonMolliePaymentMarks([{ name: 'Overschrijving' }])).toEqual([
      { kind: 'transfer', label: 'Overschrijving', shortLabel: 'Oversch.' },
    ]);
    expect(nonMolliePaymentMarks([{ name: 'Overschrijving QR' }])).toEqual([
      { kind: 'transfer', label: 'Overschrijving', shortLabel: 'Oversch.' },
    ]);
  });

  it('only surfaces the non-Mollie part of a mixed payment', () => {
    expect(
      nonMolliePaymentMarks([{ name: 'Mollie' }, { name: 'Cash' }]),
    ).toEqual([{ kind: 'cash', label: 'Cash', shortLabel: 'Cash' }]);
  });

  it('dedupes two cash lines on one order', () => {
    expect(
      nonMolliePaymentMarks([{ name: 'Cash' }, { name: 'Cash' }]),
    ).toEqual([{ kind: 'cash', label: 'Cash', shortLabel: 'Cash' }]);
  });

  it('keeps a short other-method label for cadeaubon and similar', () => {
    expect(nonMolliePaymentMarks([{ name: 'Cadeaubon' }])).toEqual([
      { kind: 'other', label: 'Cadeaubon', shortLabel: 'Cadeaubon' },
    ]);
    expect(nonMolliePaymentMarks([{ name: 'Bancontact' }])).toEqual([
      { kind: 'other', label: 'Bancontact', shortLabel: 'Bancontact' },
    ]);
  });

  it('shows cash and overschrijving together', () => {
    expect(
      nonMolliePaymentMarks([{ name: 'Cash' }, { name: 'Overschrijving' }]),
    ).toEqual([
      { kind: 'cash', label: 'Cash', shortLabel: 'Cash' },
      { kind: 'transfer', label: 'Overschrijving', shortLabel: 'Oversch.' },
    ]);
  });

  it('returns no marks when there are no payments', () => {
    expect(nonMolliePaymentMarks([])).toEqual([]);
  });
});
