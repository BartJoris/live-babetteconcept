import { odooClient } from '@/lib/odooClient';
import {
  assembleInsights,
  classifyUsers,
  entriesFromOdooRecords,
  type AccountingInsights,
  type GroupBy,
  type PartnerUser,
} from '@/lib/accounting/insights';

const PAGE_SIZE = 1000;

type OdooUser = {
  id: number;
  name: string;
  login: string;
  active?: boolean;
};

type OdooMove = {
  id: number;
  name?: string;
  date?: string;
  create_date?: string;
  create_uid?: unknown;
  state?: string;
  amount_total_signed?: number;
  amount_total?: number;
  ref?: string | false;
  partner_id?: unknown;
  journal_id?: unknown;
  move_type?: string;
};

type OdooPayment = {
  id: number;
  name?: string;
  date?: string;
  create_date?: string;
  create_uid?: unknown;
  state?: string;
  amount?: number;
  payment_type?: string;
  partner_id?: unknown;
  journal_id?: unknown;
  ref?: string | false;
  memo?: string | false;
  move_id?: unknown;
};

type OdooBankLine = {
  id: number;
  date?: string;
  create_date?: string;
  create_uid?: unknown;
  amount?: number;
  payment_ref?: string | false;
  partner_id?: unknown;
  journal_id?: unknown;
  is_reconciled?: boolean;
  move_id?: unknown;
  ref?: string | false;
  state?: string;
};

async function searchReadPaged<T>(
  uid: number,
  password: string,
  model: string,
  domain: unknown[],
  fields: string[],
  order: string
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const batch = await odooClient.searchRead<T>(
      uid,
      password,
      model,
      domain,
      fields,
      PAGE_SIZE,
      offset,
      order
    );
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function fetchUsers(uid: number, password: string): Promise<PartnerUser[]> {
  const rows = await searchReadPaged<OdooUser>(
    uid,
    password,
    'res.users',
    [],
    ['id', 'name', 'login', 'active'],
    'id asc'
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    login: row.login,
  }));
}

export async function analyzeAccountingInsights(params: {
  uid: number;
  password: string;
  dateFrom: string;
  dateTo: string;
  groupBy: GroupBy;
}): Promise<AccountingInsights> {
  const { uid, password, dateFrom, dateTo, groupBy } = params;
  const warnings: string[] = [];

  let houseUsers: PartnerUser[] = [];
  let partnerUsers: PartnerUser[] = [];
  let partnerIds: Set<number> | null = null;

  try {
    const classified = classifyUsers(await fetchUsers(uid, password));
    houseUsers = classified.houseUsers;
    partnerUsers = classified.partnerUsers;
    partnerIds = new Set(partnerUsers.map((user) => user.id));
    if (partnerIds.size === 0) {
      warnings.push(
        'Geen partner-gebruikers gevonden (alles behalve Margot). Controleer of de boekhouder een eigen Odoo-account heeft.'
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'onbekende fout';
    warnings.push(
      `Gebruikerslijst kon niet worden opgehaald (${message}). Filter gebeurt op naam van de aanmaker.`
    );
  }

  const dateDomain: unknown[] = [
    ['date', '>=', dateFrom],
    ['date', '<=', dateTo],
  ];
  const userDomain =
    partnerIds && partnerIds.size > 0
      ? [...dateDomain, ['create_uid', 'in', [...partnerIds]]]
      : dateDomain;

  const [movesResult, paymentsResult, bankResult] = await Promise.allSettled([
    searchReadPaged<OdooMove>(
      uid,
      password,
      'account.move',
      userDomain,
      [
        'id',
        'name',
        'date',
        'create_date',
        'create_uid',
        'state',
        'amount_total_signed',
        'amount_total',
        'ref',
        'partner_id',
        'journal_id',
        'move_type',
      ],
      'date desc, id desc'
    ),
    searchReadPaged<OdooPayment>(
      uid,
      password,
      'account.payment',
      userDomain,
      [
        'id',
        'name',
        'date',
        'create_date',
        'create_uid',
        'state',
        'amount',
        'payment_type',
        'partner_id',
        'journal_id',
        'move_id',
      ],
      'date desc, id desc'
    ),
    searchReadPaged<OdooBankLine>(
      uid,
      password,
      'account.bank.statement.line',
      userDomain,
      [
        'id',
        'date',
        'create_date',
        'create_uid',
        'amount',
        'payment_ref',
        'partner_id',
        'journal_id',
        'is_reconciled',
        'move_id',
        'ref',
      ],
      'date desc, id desc'
    ),
  ]);

  const moves = movesResult.status === 'fulfilled' ? movesResult.value : [];
  const payments = paymentsResult.status === 'fulfilled' ? paymentsResult.value : [];
  const bankLines = bankResult.status === 'fulfilled' ? bankResult.value : [];

  if (movesResult.status === 'rejected') {
    warnings.push(
      `Boekingen (account.move) niet beschikbaar: ${movesResult.reason instanceof Error ? movesResult.reason.message : 'onbekende fout'}`
    );
  }
  if (paymentsResult.status === 'rejected') {
    warnings.push(
      `Betalingen niet beschikbaar: ${paymentsResult.reason instanceof Error ? paymentsResult.reason.message : 'onbekende fout'}`
    );
  }
  if (bankResult.status === 'rejected') {
    warnings.push(
      `Bankafschriften niet beschikbaar: ${bankResult.reason instanceof Error ? bankResult.reason.message : 'onbekende fout'}`
    );
  }

  const entries = entriesFromOdooRecords({
    moves,
    payments,
    bankLines,
    partnerIds,
  });

  if (partnerUsers.length === 0) {
    const seen = new Map<number, PartnerUser>();
    for (const entry of entries) {
      if (entry.userId == null || seen.has(entry.userId)) continue;
      seen.set(entry.userId, {
        id: entry.userId,
        name: entry.userName ?? `Gebruiker ${entry.userId}`,
        login: '',
      });
    }
    partnerUsers = [...seen.values()];
  }

  return assembleInsights(entries, {
    dateFrom,
    dateTo,
    groupBy,
    houseUsers,
    partnerUsers,
    warnings,
  });
}
