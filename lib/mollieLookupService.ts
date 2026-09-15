import { many2oneName } from '@/lib/accounting/insights';
import {
  applyMollieToRow,
  extractMolliePaymentId,
  IN_TRANSIT_LINE_CAP,
  isMolliePaymentId,
  rowFromOdooMoveLine,
  settlementIdFromHref,
  type LookupRow,
} from '@/lib/mollieLookup';
import {
  fetchMollie,
  type MolliePayment,
  type MollieSettlement,
} from '@/lib/mollieSettlementShared';
import { odooClient } from '@/lib/odooClient';

type OdooAccount = { id: number; code?: string; name?: string };

type OdooMoveLine = {
  id: number;
  name?: string;
  ref?: string | false;
  date?: string;
  amount_residual?: number;
  debit?: number;
  partner_id?: unknown;
  move_name?: string;
  currency_id?: unknown;
};

type OdooOrder = {
  id: number;
  name?: string;
  partner_id?: unknown;
  date_order?: string;
  amount_total?: number;
  transaction_ids?: number[];
};

type OdooInvoice = {
  id: number;
  name?: string;
  ref?: string | false;
  invoice_origin?: string | false;
  invoice_date?: string;
  amount_total?: number;
  partner_id?: unknown;
};

type OdooPayment = {
  id: number;
  name?: string;
  ref?: string | false;
  memo?: string | false;
  date?: string;
  amount?: number;
  partner_id?: unknown;
};

type OdooTransaction = {
  id: number;
  reference?: string;
  provider_reference?: string;
  acquirer_reference?: string;
  amount?: number;
  partner_id?: unknown;
};

const LINE_FIELDS = [
  'id',
  'name',
  'ref',
  'date',
  'amount_residual',
  'debit',
  'partner_id',
  'move_name',
  'currency_id',
] as const;

function emptyRow(overrides: Partial<LookupRow> = {}): LookupRow {
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

async function searchReadSafe<T>(
  uid: number,
  password: string,
  model: string,
  domain: unknown[],
  fields: string[],
  limit: number,
  order?: string
): Promise<T[]> {
  try {
    return await odooClient.searchRead<T>(uid, password, model, domain, fields, limit, 0, order);
  } catch (error) {
    console.warn(`mollie lookup: ${model} search failed`, error);
    return [];
  }
}

export async function findMollieInTransitAccount(
  uid: number,
  password: string
): Promise<OdooAccount | null> {
  const byCode = await searchReadSafe<OdooAccount>(
    uid,
    password,
    'account.account',
    [['code', '=', '580100']],
    ['id', 'code', 'name'],
    1
  );
  if (byCode[0]) return byCode[0];
  const byName = await searchReadSafe<OdooAccount>(
    uid,
    password,
    'account.account',
    [['name', 'ilike', 'Mollie in transit']],
    ['id', 'code', 'name'],
    1
  );
  return byName[0] ?? null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(Math.max(limit, 1), Math.max(items.length, 1));
  if (items.length === 0) return [];
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function isMollieNotFound(error: unknown): boolean {
  return error instanceof Error && /Mollie API 404/.test(error.message);
}

function isMollieForbidden(error: unknown): boolean {
  return error instanceof Error && /Mollie API 403/.test(error.message);
}

async function fetchPaymentOrNull(token: string, id: string): Promise<MolliePayment | null> {
  try {
    return (await fetchMollie(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, token)) as MolliePayment;
  } catch (error) {
    if (isMollieNotFound(error)) return null;
    throw error;
  }
}

async function fetchSettlementForPayment(
  token: string,
  payment: MolliePayment
): Promise<{ id: string; reference: string; settledAt?: string } | null> {
  const href = payment._links?.settlement?.href;
  if (typeof href !== 'string' || !href) return null;
  const stubId = settlementIdFromHref(href);
  const stub = stubId ? { id: stubId, reference: stubId } : null;
  try {
    const settlement = (await fetchMollie(href, token)) as MollieSettlement;
    return {
      id: settlement.id,
      reference: settlement.reference || settlement.id,
      settledAt: settlement.settledAt,
    };
  } catch (error) {
    if (isMollieNotFound(error) || isMollieForbidden(error)) return stub;
    throw error;
  }
}

function fillFromPayment(row: LookupRow, payment: MolliePayment | null): LookupRow {
  if (!payment) return row;
  const paid = payment.paidAt ?? payment.createdAt;
  const parsedAmount = Number.parseFloat(payment.amount.value);
  return {
    ...row,
    partnerName: row.partnerName ?? payment.details?.consumerName ?? null,
    amount: row.amount ?? (Number.isNaN(parsedAmount) ? null : parsedAmount),
    currency: row.currency ?? payment.amount.currency ?? row.currency,
    odooDate: row.odooDate ?? (paid ? paid.slice(0, 10) : null),
  };
}

export type MollieTokens = {
  paymentToken: string;
  settlementToken: string;
};

async function enrichRows(rows: LookupRow[], tokens: MollieTokens): Promise<LookupRow[]> {
  const ids = [
    ...new Set(rows.map((row) => row.molliePaymentId).filter((id): id is string => Boolean(id))),
  ];
  const byId = new Map<
    string,
    { payment: MolliePayment | null; settlement: { id: string; reference: string; settledAt?: string } | null }
  >();

  await mapPool(ids, 5, async (id) => {
    const payment = await fetchPaymentOrNull(tokens.paymentToken, id);
    const settlement = payment ? await fetchSettlementForPayment(tokens.settlementToken, payment) : null;
    byId.set(id, { payment, settlement });
    return id;
  });

  return rows.map((row) => {
    if (!row.molliePaymentId) {
      return applyMollieToRow(row, null, null);
    }
    const found = byId.get(row.molliePaymentId);
    const payment = found?.payment ?? null;
    const settlement = found?.settlement ?? null;
    return fillFromPayment(
      applyMollieToRow(
        row,
        payment,
        settlement
          ? {
              id: settlement.id,
              reference: settlement.reference,
              settledAt: settlement.settledAt,
            }
          : null
      ),
      payment
    );
  });
}

function pushUnique(target: LookupRow[], row: LookupRow) {
  if (row.odooLineId != null && target.some((existing) => existing.odooLineId === row.odooLineId)) {
    return;
  }
  if (
    row.odooLineId == null &&
    row.molliePaymentId &&
    target.some(
      (existing) =>
        existing.molliePaymentId === row.molliePaymentId &&
        existing.odooOrderName === row.odooOrderName &&
        existing.odooMoveName === row.odooMoveName
    )
  ) {
    return;
  }
  target.push(row);
}

function attachOrderNames(rows: LookupRow[], orders: OdooOrder[]) {
  for (const row of rows) {
    if (row.odooOrderName) continue;
    const haystack = `${row.odooMoveName ?? ''} ${row.partnerName ?? ''}`;
    const match = orders.find((order) => {
      const name = order.name?.trim();
      if (!name) return false;
      return haystack.includes(name);
    });
    if (match?.name) row.odooOrderName = match.name;
  }
}

async function searchTransactions(
  uid: number,
  password: string,
  query: string
): Promise<OdooTransaction[]> {
  const orProvider: unknown[] = [
    '|',
    ['reference', 'ilike', query],
    ['provider_reference', 'ilike', query],
  ];
  const withProvider = await searchReadSafe<OdooTransaction>(
    uid,
    password,
    'payment.transaction',
    orProvider,
    ['id', 'reference', 'provider_reference', 'amount', 'partner_id'],
    50
  );
  if (withProvider.length) return withProvider;
  return searchReadSafe<OdooTransaction>(
    uid,
    password,
    'payment.transaction',
    ['|', ['reference', 'ilike', query], ['acquirer_reference', 'ilike', query]],
    ['id', 'reference', 'acquirer_reference', 'amount', 'partner_id'],
    50
  );
}

function rowFromTransaction(tx: OdooTransaction): LookupRow {
  return emptyRow({
    odooOrderName: tx.reference?.trim() || null,
    partnerName: many2oneName(tx.partner_id),
    amount: typeof tx.amount === 'number' ? tx.amount : null,
    molliePaymentId: extractMolliePaymentId(
      tx.provider_reference,
      tx.acquirer_reference,
      tx.reference
    ),
  });
}

function rowFromOrder(order: OdooOrder): LookupRow {
  return emptyRow({
    odooOrderName: order.name?.trim() || null,
    partnerName: many2oneName(order.partner_id),
    odooDate: order.date_order ? order.date_order.slice(0, 10) : null,
    amount: typeof order.amount_total === 'number' ? order.amount_total : null,
  });
}

function rowFromInvoice(move: OdooInvoice): LookupRow {
  const origin = typeof move.invoice_origin === 'string' ? move.invoice_origin.trim() : '';
  return emptyRow({
    odooMoveName: move.name?.trim() || null,
    odooOrderName: origin || null,
    partnerName: many2oneName(move.partner_id),
    odooDate: move.invoice_date ? move.invoice_date.slice(0, 10) : null,
    amount: typeof move.amount_total === 'number' ? move.amount_total : null,
    molliePaymentId: extractMolliePaymentId(move.name, move.ref, move.invoice_origin),
  });
}

function rowFromPayment(payment: OdooPayment): LookupRow {
  return emptyRow({
    odooMoveName: payment.name?.trim() || null,
    partnerName: many2oneName(payment.partner_id),
    odooDate: payment.date ? payment.date.slice(0, 10) : null,
    amount: typeof payment.amount === 'number' ? payment.amount : null,
    molliePaymentId: extractMolliePaymentId(payment.name, payment.ref, payment.memo),
  });
}

async function searchOpenLines(
  uid: number,
  password: string,
  accountId: number,
  extraDomain: unknown[] = [],
  limit = 50
): Promise<OdooMoveLine[]> {
  const domain: unknown[] = [
    ['account_id', '=', accountId],
    ['parent_state', '=', 'posted'],
    ...extraDomain,
  ];
  return searchReadSafe<OdooMoveLine>(
    uid,
    password,
    'account.move.line',
    domain,
    [...LINE_FIELDS],
    limit,
    'date desc, id desc'
  );
}

async function transactionsForOrders(
  uid: number,
  password: string,
  orders: OdooOrder[]
): Promise<OdooTransaction[]> {
  const txIds = orders.flatMap((order) =>
    Array.isArray(order.transaction_ids) ? order.transaction_ids : []
  );
  if (txIds.length > 0) {
    try {
      return await odooClient.read<OdooTransaction>(
        uid,
        password,
        'payment.transaction',
        txIds,
        ['id', 'reference', 'provider_reference', 'acquirer_reference', 'amount', 'partner_id']
      );
    } catch (error) {
      console.warn('mollie lookup: payment.transaction read failed', error);
    }
  }
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return [];
  return searchReadSafe<OdooTransaction>(
    uid,
    password,
    'payment.transaction',
    [['sale_order_ids', 'in', orderIds]],
    ['id', 'reference', 'provider_reference', 'acquirer_reference', 'amount', 'partner_id'],
    50
  );
}

function mollieIdFromTransaction(tx: OdooTransaction): string | null {
  return extractMolliePaymentId(tx.provider_reference, tx.acquirer_reference, tx.reference);
}

export async function lookupByQuery(params: {
  uid: number;
  password: string;
  tokens: MollieTokens;
  query: string;
}): Promise<LookupRow[]> {
  const { uid, password, tokens, query } = params;
  const account = await findMollieInTransitAccount(uid, password);
  const rows: LookupRow[] = [];

  if (isMolliePaymentId(query)) {
    const lines = account
      ? await searchOpenLines(
          uid,
          password,
          account.id,
          ['|', ['name', 'ilike', query], ['ref', 'ilike', query]],
          50
        )
      : [];
    for (const line of lines) {
      pushUnique(rows, rowFromOdooMoveLine(line));
    }
    if (rows.length === 0) {
      pushUnique(rows, emptyRow({ molliePaymentId: query }));
    } else {
      for (const row of rows) {
        if (!row.molliePaymentId) row.molliePaymentId = query;
      }
    }
    return enrichRows(rows, tokens);
  }

  const [orders, invoices, payments, namedTransactions] = await Promise.all([
    searchReadSafe<OdooOrder>(
      uid,
      password,
      'sale.order',
      ['|', ['name', 'ilike', query], ['partner_id', 'ilike', query]],
      ['id', 'name', 'partner_id', 'date_order', 'amount_total', 'transaction_ids'],
      50,
      'date_order desc'
    ),
    searchReadSafe<OdooInvoice>(
      uid,
      password,
      'account.move',
      [
        '&',
        ['move_type', 'in', ['out_invoice', 'out_refund']],
        '|',
        '|',
        '|',
        ['name', 'ilike', query],
        ['ref', 'ilike', query],
        ['payment_reference', 'ilike', query],
        ['invoice_origin', 'ilike', query],
      ],
      ['id', 'name', 'ref', 'invoice_origin', 'invoice_date', 'amount_total', 'partner_id'],
      50,
      'invoice_date desc'
    ),
    searchReadSafe<OdooPayment>(
      uid,
      password,
      'account.payment',
      [
        '|',
        '|',
        ['name', 'ilike', query],
        ['ref', 'ilike', query],
        ['memo', 'ilike', query],
      ],
      ['id', 'name', 'ref', 'memo', 'date', 'amount', 'partner_id'],
      50,
      'date desc'
    ),
    searchTransactions(uid, password, query),
  ]);
  const orderTransactions = await transactionsForOrders(uid, password, orders);
  const transactions = [...namedTransactions, ...orderTransactions];

  const lineOr: unknown[] = [
    '|',
    '|',
    ['name', 'ilike', query],
    ['ref', 'ilike', query],
    ['partner_id', 'ilike', query],
  ];
  const lines = account ? await searchOpenLines(uid, password, account.id, lineOr, 50) : [];

  const trFromOrders = [
    ...new Set(transactions.map(mollieIdFromTransaction).filter((id): id is string => Boolean(id))),
  ];
  if (account) {
    for (const tr of trFromOrders) {
      const extra = await searchOpenLines(
        uid,
        password,
        account.id,
        ['|', ['name', 'ilike', tr], ['ref', 'ilike', tr]],
        20
      );
      lines.push(...extra);
    }
  }

  for (const line of lines) {
    pushUnique(rows, rowFromOdooMoveLine(line));
  }
  attachOrderNames(rows, orders);
  for (const row of rows) {
    if (row.odooOrderName || !row.molliePaymentId) continue;
    const tx = transactions.find((item) => mollieIdFromTransaction(item) === row.molliePaymentId);
    if (!tx?.reference) continue;
    const order = orders.find(
      (item) => item.name && tx.reference!.toUpperCase().includes(item.name.toUpperCase())
    );
    if (order?.name) row.odooOrderName = order.name;
  }

  const matchedOrderNames = new Set(rows.map((row) => row.odooOrderName).filter(Boolean));
  for (const order of orders) {
    const name = order.name?.trim();
    if (name && matchedOrderNames.has(name)) continue;
    const orderRow = rowFromOrder(order);
    const txForOrder = name
      ? transactions.find((tx) => (tx.reference ?? '').toUpperCase().includes(name.toUpperCase()))
      : undefined;
    if (txForOrder) {
      orderRow.molliePaymentId = mollieIdFromTransaction(txForOrder);
    }
    pushUnique(rows, orderRow);
    if (name) matchedOrderNames.add(name);
  }

  for (const invoice of invoices) {
    const already = rows.some(
      (row) => row.odooMoveName === invoice.name?.trim() || row.odooOrderName === invoice.name?.trim()
    );
    if (!already) pushUnique(rows, rowFromInvoice(invoice));
  }
  for (const payment of payments) {
    const already = rows.some((row) => row.odooMoveName === payment.name?.trim());
    if (!already) pushUnique(rows, rowFromPayment(payment));
  }
  for (const tx of transactions) {
    const mollieId = extractMolliePaymentId(
      tx.provider_reference,
      tx.acquirer_reference,
      tx.reference
    );
    const already = mollieId
      ? rows.some((row) => row.molliePaymentId === mollieId)
      : rows.some((row) => row.odooOrderName === tx.reference);
    if (!already) pushUnique(rows, rowFromTransaction(tx));
  }

  return enrichRows(rows, tokens);
}

export async function listOpenInTransit(params: {
  uid: number;
  password: string;
  tokens: MollieTokens;
}): Promise<{ accountCode: string; accountName: string; truncated: boolean; rows: LookupRow[] }> {
  const { uid, password, tokens } = params;
  const account = await findMollieInTransitAccount(uid, password);
  if (!account) {
    throw new Error('Rekening 580100 (Mollie in transit) niet gevonden in Odoo.');
  }

  const domain: unknown[] = [
    ['account_id', '=', account.id],
    ['parent_state', '=', 'posted'],
    ['amount_residual', '!=', 0],
  ];

  let total = 0;
  try {
    total = await odooClient.call<number>({
      uid,
      password,
      model: 'account.move.line',
      method: 'search_count',
      args: [domain],
    });
  } catch (error) {
    console.warn('mollie lookup: search_count failed', error);
  }

  const lines = await odooClient.searchRead<OdooMoveLine>(
    uid,
    password,
    'account.move.line',
    domain,
    [...LINE_FIELDS],
    IN_TRANSIT_LINE_CAP,
    0,
    'date desc, id desc'
  );

  const truncated = total > IN_TRANSIT_LINE_CAP || (total === 0 && lines.length >= IN_TRANSIT_LINE_CAP);
  const rows = await enrichRows(lines.map(rowFromOdooMoveLine), tokens);
  return {
    accountCode: account.code || '580100',
    accountName: account.name || 'Mollie in transit',
    truncated,
    rows,
  };
}

export function mollieTokensFromEnv(): MollieTokens | null {
  const apiKey = process.env.MOLLIE_API_KEY?.trim();
  const accessToken = process.env.MOLLIE_ACCESS_TOKEN?.trim();
  if (!apiKey && !accessToken) return null;
  const paymentToken = apiKey || accessToken!;
  return {
    paymentToken,
    settlementToken: accessToken || paymentToken,
  };
}
