import { many2oneName } from '@/lib/accounting/insights';
import { escapeCSV } from '@/lib/mollieSettlementShared';

export const LOOKUP_QUERY_MIN = 2;
export const LOOKUP_QUERY_MAX = 80;
export const IN_TRANSIT_LINE_CAP = 250;

export type MatchStatus = 'uitbetaald' | 'in_transit' | 'geen_mollie_id' | 'niet_in_mollie';

export type LookupRow = {
  odooMoveName: string | null;
  odooOrderName: string | null;
  partnerName: string | null;
  odooDate: string | null;
  amount: number | null;
  currency: string | null;
  molliePaymentId: string | null;
  molliePaymentStatus: string | null;
  settlementId: string | null;
  settlementReference: string | null;
  settledAt: string | null;
  matchStatus: MatchStatus;
  odooLineId?: number;
};

const MOLLIE_ID_IN_TEXT = /\btr_[A-Za-z0-9]+\b/;
const MOLLIE_ID_EXACT = /^tr_[A-Za-z0-9]+$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

export function parseLookupQuery(
  raw: unknown
): { ok: true; query: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Zoekterm ontbreekt.' };
  }
  const query = raw.trim();
  if (query.length < LOOKUP_QUERY_MIN) {
    return { ok: false, error: 'Zoekterm is te kort (minimaal 2 tekens).' };
  }
  if (query.length > LOOKUP_QUERY_MAX) {
    return { ok: false, error: 'Zoekterm is te lang (maximaal 80 tekens).' };
  }
  return { ok: true, query };
}

export function isMolliePaymentId(query: string): boolean {
  return MOLLIE_ID_EXACT.test(query.trim());
}

export function classifyLookupQuery(query: string): 'mollie_id' | 'odoo_text' {
  return isMolliePaymentId(query) ? 'mollie_id' : 'odoo_text';
}

export function extractMolliePaymentId(
  ...texts: Array<string | false | null | undefined>
): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = MOLLIE_ID_IN_TEXT.exec(text);
    if (match) return match[0];
  }
  return null;
}

export function settlementIdFromHref(href: string): string | null {
  const match = /\/settlements\/([^/?#]+)/.exec(href);
  return match ? decodeURIComponent(match[1]) : null;
}

export function deriveMatchStatus(input: {
  molliePaymentId: string | null;
  paymentFound: boolean;
  settlementId: string | null;
}): MatchStatus {
  if (!input.molliePaymentId) return 'geen_mollie_id';
  if (!input.paymentFound) return 'niet_in_mollie';
  if (input.settlementId) return 'uitbetaald';
  return 'in_transit';
}

export function matchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'uitbetaald':
      return 'Uitbetaald';
    case 'in_transit':
      return 'Nog in transit';
    case 'geen_mollie_id':
      return 'Geen Mollie-id in de boeking';
    case 'niet_in_mollie':
      return 'Niet gevonden in Mollie';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function emptyLookupMessage(query: string): string {
  return `Geen Odoo-order of betaling gevonden voor ${query}.`;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = DATE_ONLY.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function partnerFromMollieOmschrijving(name: string | null | undefined): string | null {
  if (!name) return null;
  const match = /^Mollie\s+\d+\s+-\s+(.+?)\s+-\s+tr_/i.exec(name.trim());
  const parsed = match?.[1]?.trim();
  return parsed || null;
}

function asText(value: string | false | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function rowFromOdooMoveLine(line: {
  id?: number;
  name?: string;
  ref?: string | false;
  date?: string;
  amount_residual?: number;
  debit?: number;
  partner_id?: unknown;
  move_name?: string;
  currency_id?: unknown;
}): LookupRow {
  const name = asText(line.name);
  const ref = asText(line.ref);
  const amount =
    typeof line.amount_residual === 'number'
      ? line.amount_residual
      : typeof line.debit === 'number'
        ? line.debit
        : null;
  const currency = many2oneName(line.currency_id) ?? 'EUR';
  return {
    odooLineId: typeof line.id === 'number' ? line.id : undefined,
    odooMoveName: asText(line.move_name),
    odooOrderName: null,
    partnerName: partnerFromMollieOmschrijving(name) ?? many2oneName(line.partner_id),
    odooDate: dateOnly(line.date),
    amount,
    currency,
    molliePaymentId: extractMolliePaymentId(name, ref),
    molliePaymentStatus: null,
    settlementId: null,
    settlementReference: null,
    settledAt: null,
    matchStatus: 'geen_mollie_id',
  };
}

export function applyMollieToRow(
  row: LookupRow,
  payment: { id: string; status: string; description?: string } | null,
  settlement: { id: string; reference: string; settledAt?: string } | null
): LookupRow {
  const molliePaymentId = payment?.id ?? row.molliePaymentId;
  const description = asText(payment?.description);
  return {
    ...row,
    odooOrderName: row.odooOrderName ?? description,
    molliePaymentId,
    molliePaymentStatus: payment?.status ?? null,
    settlementId: settlement?.id ?? null,
    settlementReference: asText(settlement?.reference) ?? (settlement?.id ?? null),
    settledAt: dateOnly(settlement?.settledAt) ?? settlement?.settledAt ?? null,
    matchStatus: deriveMatchStatus({
      molliePaymentId,
      paymentFound: payment != null,
      settlementId: settlement?.id ?? null,
    }),
  };
}

function formatCsvAmount(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '';
  return amount.toFixed(2).replace('.', ',');
}

function formatCsvDate(iso: string | null): string {
  const ymd = dateOnly(iso);
  if (!ymd) return iso ?? '';
  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) ?? [];
  if (!y) return iso ?? '';
  return `${d}/${m}/${y}`;
}

function documentName(row: LookupRow): string {
  return [row.odooOrderName, row.odooMoveName].filter(Boolean).join(' / ');
}

export function lookupRowsToCsv(rows: LookupRow[]): string {
  const headers = [
    'Order/factuur',
    'Relatie',
    'Odoo-datum',
    'Bedrag',
    'Valuta',
    'Mollie-id',
    'Mollie-status',
    'Uitbetaling',
    'Uitbetalingsdatum',
    'Match-status',
  ];
  const lines = rows.map((row) =>
    [
      documentName(row),
      row.partnerName ?? '',
      formatCsvDate(row.odooDate),
      formatCsvAmount(row.amount),
      row.currency ?? '',
      row.molliePaymentId ?? '',
      row.molliePaymentStatus ?? '',
      row.settlementReference ?? '',
      formatCsvDate(row.settledAt),
      matchStatusLabel(row.matchStatus),
    ]
      .map((value) => escapeCSV(String(value)))
      .join(',')
  );
  return `\uFEFF${[headers.map(escapeCSV).join(','), ...lines].join('\r\n')}`;
}
