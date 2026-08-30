export type PosPaymentKind = 'cash' | 'transfer' | 'mollie' | 'other';

export type PosPaymentMark = {
  kind: Exclude<PosPaymentKind, 'mollie'>;
  label: string;
  shortLabel: string;
};

export type PosPaymentInput = {
  name: string;
};

function classifyPosPaymentMethod(name: string): PosPaymentKind {
  const n = name.trim().toLowerCase();
  if (!n) return 'other';
  if (n.includes('mollie')) return 'mollie';
  if (n.includes('cash') || n.includes('contant')) return 'cash';
  if (n.includes('overschrijving') || n.includes('transfer')) return 'transfer';
  return 'other';
}

function markForKind(kind: Exclude<PosPaymentKind, 'mollie'>, name: string): PosPaymentMark {
  switch (kind) {
    case 'cash':
      return { kind, label: 'Cash', shortLabel: 'Cash' };
    case 'transfer':
      return { kind, label: 'Overschrijving', shortLabel: 'Oversch.' };
    case 'other':
      return { kind, label: name, shortLabel: name };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Labels for POS payments that did not go through Mollie (empty = hide badge). */
export function nonMolliePaymentMarks(payments: PosPaymentInput[]): PosPaymentMark[] {
  const seen = new Set<string>();
  const marks: PosPaymentMark[] = [];

  for (const payment of payments) {
    const kind = classifyPosPaymentMethod(payment.name);
    if (kind === 'mollie') continue;
    const mark = markForKind(kind, payment.name.trim());
    const key = `${mark.kind}:${mark.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push(mark);
  }

  return marks;
}
