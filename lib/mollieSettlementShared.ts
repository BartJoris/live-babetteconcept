/**
 * Gedeelde Mollie settlement-fetch + Odoo-exportrijen (CSV en JSON-RPC).
 */

export interface MolliePayment {
  id: string;
  mode: string;
  createdAt: string;
  status: string;
  paidAt?: string;
  description: string;
  amount: { currency: string; value: string };
  settlementAmount?: { currency: string; value: string };
  amountRefunded?: { currency: string; value: string };
  method?: string;
  details?: {
    consumerName?: string;
    consumerAccount?: string;
    consumerBic?: string;
    [key: string]: unknown;
  };
  _links?: {
    settlement?: { href: string; type: string };
    [key: string]: unknown;
  };
}

interface MollieListResponse {
  count: number;
  _embedded: { payments: MolliePayment[] };
  _links: {
    next?: { href: string };
    self: { href: string };
  };
}

export interface MollieSettlement {
  id: string;
  reference: string;
  createdAt: string;
  settledAt?: string;
  status: string;
  amount: { currency: string; value: string };
  invoiceId?: string;
  periods?: Record<
    string,
    Record<
      string,
      {
        revenue?: Array<{
          description: string;
          method: string;
          count: number;
          amountNet: { currency: string; value: string };
          amountVat: { currency: string; value: string };
          amountGross: { currency: string; value: string };
        }>;
        costs?: Array<{
          description: string;
          method: string | null;
          count: number;
          amountNet: { currency: string; value: string };
          amountVat: { currency: string; value: string };
          amountGross: { currency: string; value: string };
        }>;
      }
    >
  >;
}

interface MollieSettlementListResponse {
  count: number;
  _embedded: { settlements: MollieSettlement[] };
  _links: { next?: { href: string }; self: { href: string } };
}

interface MollieInvoice {
  resource: string;
  id: string;
  reference: string;
}

export function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(' ')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function fetchMollie(url: string, token: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mollie API ${response.status}: ${text}`);
  }
  return response.json();
}

export async function fetchInvoiceReference(
  token: string,
  invoiceId: string
): Promise<string | undefined> {
  try {
    const invoice: MollieInvoice = await fetchMollie(
      `https://api.mollie.com/v2/invoices/${invoiceId}`,
      token
    );
    return invoice.reference;
  } catch {
    return undefined;
  }
}

export async function fetchSettlementsForPeriod(
  token: string,
  fromDate: Date,
  toDate: Date
): Promise<MollieSettlement[]> {
  const settlements: MollieSettlement[] = [];
  const fromMonth = fromDate.getUTCMonth() + 1;
  const fromYear = fromDate.getUTCFullYear();
  const toMonth = toDate.getUTCMonth() + 1;
  const toYear = toDate.getUTCFullYear();

  let year = fromYear;
  let month = fromMonth;

  while (year < toYear || (year === toYear && month <= toMonth)) {
    let url: string | null =
      `https://api.mollie.com/v2/settlements?limit=250&year=${year}&month=${month}`;

    while (url) {
      const data: MollieSettlementListResponse = await fetchMollie(url, token);
      for (const s of data._embedded.settlements) {
        if (!settlements.find((existing) => existing.id === s.id)) {
          settlements.push(s);
        }
      }
      url = data._links.next?.href || null;
    }

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return settlements;
}

export async function fetchSettlementPayments(
  token: string,
  settlementId: string
): Promise<MolliePayment[]> {
  const payments: MolliePayment[] = [];
  let url: string | null =
    `https://api.mollie.com/v2/settlements/${settlementId}/payments?limit=250`;

  while (url) {
    const data: MollieListResponse = await fetchMollie(url, token);
    payments.push(...data._embedded.payments);
    url = data._links.next?.href || null;
  }

  return payments;
}

export async function fetchAllPaidPayments(
  apiKey: string,
  from: Date,
  to: Date
): Promise<MolliePayment[]> {
  const payments: MolliePayment[] = [];
  let url: string | null = 'https://api.mollie.com/v2/payments?limit=250&sort=desc';

  while (url) {
    const data: MollieListResponse = await fetchMollie(url, apiKey);
    let passedStartDate = false;

    for (const payment of data._embedded.payments) {
      const createdAt = new Date(payment.createdAt);
      if (createdAt < from) {
        passedStartDate = true;
        break;
      }
      if (createdAt <= to && payment.status === 'paid') {
        payments.push(payment);
      }
    }

    if (passedStartDate) break;
    url = data._links.next?.href || null;
  }

  return payments;
}

export function bookingDateFromIso(iso: string): string {
  const trimmed = iso.trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (m) return m[1];
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return '';
}

export function formatDdMmYyyyFromIso(iso: string): string {
  const ymd = bookingDateFromIso(iso);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function buildOdooDescription(
  omschrijving: string,
  uitbetalingsbedrag: string,
  uitbetalingsreferentie: string
): string {
  return [omschrijving, uitbetalingsbedrag, uitbetalingsreferentie].filter(Boolean).join(' - ');
}

export function normalizeAmountForOdoo(value: string): string {
  const n = Number.parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return value;
  return n.toFixed(2);
}

type PeriodRevenue = NonNullable<
  NonNullable<MollieSettlement['periods']>[string][string]['revenue']
>[number];

/** Zelfde structuur als Odoo CSV-export (format=odoo). */
export interface SettlementOdooRow {
  datum: string;
  betaalmethode: string;
  valuta: string;
  bedrag: string;
  status: string;
  id: string;
  omschrijving: string;
  naamConsument: string;
  rekeningConsument: string;
  bicConsument: string;
  uitbetalingsvaluta: string;
  uitbetalingsbedrag: string;
  uitbetalingsreferentie: string;
  teruggestortBedrag: string;
  descriptionOdoo: string;
  datumDdMmYyyy: string;
  settlementId: string;
  boekingsdatum: string;
  regeltype: 'betaling' | 'omzet' | 'kosten';
  uniekeImportId: string;
  mollieInvoiceId: string;
  mollieModus: string;
}

export function paymentToOdooRow(
  payment: MolliePayment,
  settlementRef: string,
  settlementId: string,
  mollieInvoiceId: string
): SettlementOdooRow {
  const datum = payment.paidAt ?? payment.createdAt;
  const uitbetalingsbedrag = payment.settlementAmount?.value ?? payment.amount.value;
  return {
    datum,
    betaalmethode: payment.method ?? '',
    valuta: payment.amount.currency,
    bedrag: payment.amount.value,
    status: payment.status,
    id: payment.id,
    omschrijving: payment.description ?? '',
    naamConsument: payment.details?.consumerName ?? '',
    rekeningConsument: payment.details?.consumerAccount ?? '',
    bicConsument: payment.details?.consumerBic ?? '',
    uitbetalingsvaluta: payment.settlementAmount?.currency ?? payment.amount.currency,
    uitbetalingsbedrag,
    uitbetalingsreferentie: settlementRef,
    teruggestortBedrag: payment.amountRefunded?.value ?? '0.00',
    descriptionOdoo: buildOdooDescription(
      payment.description ?? '',
      uitbetalingsbedrag,
      settlementRef
    ),
    datumDdMmYyyy: formatDdMmYyyyFromIso(datum),
    settlementId,
    boekingsdatum: bookingDateFromIso(datum),
    regeltype: 'betaling',
    uniekeImportId: payment.id,
    mollieInvoiceId,
    mollieModus: payment.mode ?? '',
  };
}

export function revenueToOdooRow(
  rev: PeriodRevenue,
  settlement: MollieSettlement,
  settledAtIso: string,
  periodKey: string,
  revIndex: number,
  mollieInvoiceId: string
): SettlementOdooRow {
  const ref = settlement.reference || settlement.id;
  const uniekeImportId = `${settlement.id}:rev:${periodKey}:${revIndex}`;
  return {
    datum: settledAtIso,
    betaalmethode: rev.method ?? '',
    valuta: rev.amountGross.currency,
    bedrag: rev.amountGross.value,
    status: '',
    id: '',
    omschrijving: rev.description,
    naamConsument: '',
    rekeningConsument: '',
    bicConsument: '',
    uitbetalingsvaluta: rev.amountGross.currency,
    uitbetalingsbedrag: rev.amountGross.value,
    uitbetalingsreferentie: ref,
    teruggestortBedrag: '',
    descriptionOdoo: buildOdooDescription(rev.description, rev.amountGross.value, ref),
    datumDdMmYyyy: formatDdMmYyyyFromIso(settledAtIso),
    settlementId: settlement.id,
    boekingsdatum: bookingDateFromIso(settledAtIso),
    regeltype: 'omzet',
    uniekeImportId,
    mollieInvoiceId,
    mollieModus: '',
  };
}

export function costToOdooRow(
  cost: NonNullable<NonNullable<MollieSettlement['periods']>[string][string]['costs']>[number],
  settlement: MollieSettlement,
  settledAtIso: string,
  periodKey: string,
  costIndex: number,
  mollieInvoiceId: string
): SettlementOdooRow {
  const ref = settlement.reference || settlement.id;
  const uniekeImportId = `${settlement.id}:cost:${periodKey}:${costIndex}`;
  // Mollie levert `amountGross` als positieve grootte (een kost, geen bedrag-met-teken). Voor de
  // banklijn/CSV moet dit een AFTREKKING zijn (negatief) — zo staat het ook in Mollie's eigen export
  // en in `costToRowClassic` hierboven. Zonder deze `-Math.abs(...)` boekt de kost als extra omzet
  // i.p.v. als kost.
  const negativeAmount = (-Math.abs(Number.parseFloat(cost.amountGross.value))).toFixed(2);
  return {
    datum: settledAtIso,
    betaalmethode: cost.method ?? '',
    valuta: cost.amountGross.currency,
    bedrag: negativeAmount,
    status: '',
    id: '',
    omschrijving: cost.description,
    naamConsument: '',
    rekeningConsument: '',
    bicConsument: '',
    uitbetalingsvaluta: cost.amountGross.currency,
    uitbetalingsbedrag: negativeAmount,
    uitbetalingsreferentie: ref,
    teruggestortBedrag: '0.00',
    descriptionOdoo: buildOdooDescription(cost.description, negativeAmount, ref),
    datumDdMmYyyy: formatDdMmYyyyFromIso(settledAtIso),
    settlementId: settlement.id,
    boekingsdatum: bookingDateFromIso(settledAtIso),
    regeltype: 'kosten',
    uniekeImportId,
    mollieInvoiceId,
    mollieModus: '',
  };
}

export function sortSettlementOdooRows(rows: SettlementOdooRow[]): void {
  const regelRank = (t: SettlementOdooRow['regeltype']) =>
    t === 'betaling' ? 0 : t === 'omzet' ? 1 : 2;
  rows.sort((a, b) => {
    const byDate = a.boekingsdatum.localeCompare(b.boekingsdatum);
    if (byDate !== 0) return byDate;
    const tr = regelRank(a.regeltype) - regelRank(b.regeltype);
    if (tr !== 0) return tr;
    return a.uniekeImportId.localeCompare(b.uniekeImportId);
  });
}

export async function collectSettlementOdooRows(params: {
  apiKey: string;
  accessToken: string | undefined;
  from: Date;
  to: Date;
}): Promise<{
  rows: SettlementOdooRow[];
  approach: 'settlements' | 'payments';
  settlementError: string;
}> {
  const { apiKey, accessToken, from, to } = params;
  const settlementToken = accessToken || apiKey;
  let rows: SettlementOdooRow[] = [];
  let approach: 'settlements' | 'payments' = 'settlements';
  let settlementError = '';

  try {
    const settlements = await fetchSettlementsForPeriod(settlementToken, from, to);

    for (const settlement of settlements) {
      const payments = await fetchSettlementPayments(settlementToken, settlement.id);
      const ref = settlement.reference || settlement.id;
      const invoiceId = settlement.invoiceId ?? '';

      for (const payment of payments) {
        rows.push(paymentToOdooRow(payment, ref, settlement.id, invoiceId));
      }

      if (settlement.periods) {
        const settledAtIso = settlement.settledAt ?? settlement.createdAt;
        for (const yearKey of Object.keys(settlement.periods)) {
          for (const monthKey of Object.keys(settlement.periods[yearKey])) {
            const period = settlement.periods[yearKey][monthKey];
            const periodKey = `${yearKey}-${monthKey}`;
            if (period.revenue) {
              period.revenue.forEach((rev, revIndex) => {
                rows.push(revenueToOdooRow(rev, settlement, settledAtIso, periodKey, revIndex, invoiceId));
              });
            }
            if (period.costs) {
              period.costs.forEach((cost, costIndex) => {
                rows.push(costToOdooRow(cost, settlement, settledAtIso, periodKey, costIndex, invoiceId));
              });
            }
          }
        }
      }
    }
  } catch (err) {
    approach = 'payments';
    settlementError = err instanceof Error ? err.message : 'Onbekende fout';
    console.warn('Settlements API niet beschikbaar, fallback naar Payments API:', settlementError);

    const payments = await fetchAllPaidPayments(apiKey, from, to);
    rows = [];
    for (const payment of payments) {
      rows.push(paymentToOdooRow(payment, '', '', ''));
    }
  }

  sortSettlementOdooRows(rows);
  return { rows, approach, settlementError };
}

export function buildCSVOdoo(rows: SettlementOdooRow[]): string {
  const headers = [
    'Datum',
    'Betaalmethode',
    'Valuta',
    'Bedrag',
    'Status',
    'ID',
    'Omschrijving',
    'Naam consument',
    'Rekening consument',
    'BIC consument',
    'Uitbetalingsvaluta',
    'Uitbetalingsbedrag',
    'Uitbetalingsreferentie',
    'Teruggestort bedrag',
    'Description',
    'Datum_DDMMYYYY',
    'Settlement_ID',
    'Boekingsdatum',
    'Regeltype',
    'Unieke_import_ID',
    'Mollie_invoice_ID',
    'Mollie_modus',
  ];

  const csvRows = rows.map((r) =>
    [
      r.datum,
      r.betaalmethode,
      r.valuta,
      r.bedrag,
      r.status,
      r.id,
      r.omschrijving,
      r.naamConsument,
      r.rekeningConsument,
      r.bicConsument,
      r.uitbetalingsvaluta,
      r.uitbetalingsbedrag,
      r.uitbetalingsreferentie,
      r.teruggestortBedrag,
      r.descriptionOdoo,
      r.datumDdMmYyyy,
      r.settlementId,
      r.boekingsdatum,
      r.regeltype,
      r.uniekeImportId,
      r.mollieInvoiceId,
      r.mollieModus,
    ]
      .map(escapeCSV)
      .join(',')
  );

  return '\uFEFF' + [headers.map(escapeCSV).join(','), ...csvRows].join('\r\n');
}

export function buildCSVOdooBank(rows: SettlementOdooRow[]): string {
  const headers = ['date', 'amount', 'payment_ref', 'ref'];
  const csvRows = rows.map((r) =>
    [
      r.boekingsdatum,
      normalizeAmountForOdoo(r.uitbetalingsbedrag),
      r.descriptionOdoo,
      r.uniekeImportId,
    ]
      .map(escapeCSV)
      .join(',')
  );
  return '\uFEFF' + [headers.map(escapeCSV).join(','), ...csvRows].join('\r\n');
}

/** `account.bank.statement.line` create-vals (Odoo 17+); journaal moet suspense-account hebben. */
export function settlementOdooRowToBankLineVals(
  row: SettlementOdooRow,
  journalId: number
): Record<string, unknown> {
  const amount = Number.parseFloat(String(row.uitbetalingsbedrag).replace(',', '.'));
  const paymentRef = row.descriptionOdoo.slice(0, 512);
  const ref = row.uniekeImportId.slice(0, 255);
  return {
    journal_id: journalId,
    date: row.boekingsdatum,
    amount: Number.isFinite(amount) ? amount : 0,
    payment_ref: paymentRef || row.uniekeImportId,
    ref: ref || undefined,
  };
}

/** Bedrag dat `settlementOdooRowToBankLineVals` op de banklijn zou zetten (voor optellingen/preview). */
export function bankLineAmount(row: SettlementOdooRow): number {
  const amount = Number.parseFloat(String(row.uitbetalingsbedrag).replace(',', '.'));
  return Number.isFinite(amount) ? amount : 0;
}

/** Marge waarbinnen een afschrift als "sluitend" (begin- en eindsaldo effectief op 0) telt. */
export const STATEMENT_BALANCE_TOLERANCE_EUR = 0.01;

export function isNetAmountBalanced(
  netAmount: number,
  tolerance = STATEMENT_BALANCE_TOLERANCE_EUR
): boolean {
  return Math.abs(netAmount) <= tolerance;
}

/**
 * Eén Mollie-settlement met al zijn regels (betaling/omzet/kosten), zoals stap 10-11 in de gids:
 * "maak het afschrift aan door de referentie te plakken in dat veld" + begin/eindsaldo op nul.
 *
 * BELANGRIJK — ontdekt tegen een echte settlement: de individuele `betaling`-rijen (uit
 * `fetchSettlementPayments`) en de `omzet`-rijen (uit `settlement.periods[].revenue`) mogen NIET als
 * nieuwe banklijn geboekt worden. De betalingen zelf komen al automatisch in Odoo terecht (via de
 * POS/Mollie-koppeling of de webshop) — die opnieuw aanmaken boekt de omzet dubbel. De `omzet`-rijen
 * zijn zelf ook al een optelsom van (een deel van) diezelfde betalingen — een derde keer dezelfde
 * omzet. Alleen `kosten`-rijen (Withheld fees) bestaan nog nergens anders in Odoo en mogen dus wél
 * als nieuwe banklijn aangemaakt worden — zie `bookableRows`.
 */
export interface SettlementRowGroup {
  /** Mollie settlement id (`stl_...`), of `''` als de rijen niet aan een settlement toe te wijzen zijn
   *  (fallback via Payments API — zie `approach: 'payments'` in `collectSettlementOdooRows`). */
  settlementId: string;
  /** Settlement-referentie (bv. `14086537.2609.18`) — dit is wat in het Odoo `name`-veld van het
   *  afschrift moet staan. Valt terug op `settlementId` als er geen referentie is. */
  reference: string;
  /** Alle rijen van deze settlement (betaling + omzet + kosten) — enkel informatief, niet alles
   *  hiervan wordt geboekt. Gebruik `bookableRows` voor wat er echt als banklijn aangemaakt wordt. */
  rows: SettlementOdooRow[];
  /** Enkel de `kosten`-rijen — dit zijn de enige rijen die hier veilig als nieuwe banklijn aangemaakt
   *  mogen worden (zie uitleg hierboven). */
  bookableRows: SettlementOdooRow[];
  /** Som van de bedragen van `bookableRows` (de kosten) — een negatief bedrag, geen "moet op 0
   *  sluiten"-saldo. Het afschrift zelf sluit pas op 0 als ook de al-bestaande betalingen erop
   *  gekoppeld worden (nog niet geautomatiseerd). */
  netAmount: number;
  /** Meest recente boekingsdatum in de groep (voor het `date`-veld van het afschrift). */
  latestBookingDate: string;
}

/**
 * Groepeert settlement-rijen per Mollie settlement (stap 10-11: één afschrift per settlement).
 * Rijen zonder `settlementId` (Payments API-fallback, geen settlement-referentie beschikbaar) komen
 * in één groep met `settlementId: ''` terecht — daarvoor kan geen afschrift aangemaakt worden.
 */
export function groupSettlementRowsBySettlement(rows: SettlementOdooRow[]): SettlementRowGroup[] {
  const groups = new Map<string, SettlementOdooRow[]>();
  for (const row of rows) {
    const key = row.settlementId || '';
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const result: SettlementRowGroup[] = [];
  for (const [settlementId, groupRows] of groups) {
    const bookableRows = groupRows.filter((row) => row.regeltype === 'kosten');
    const netAmount = bookableRows.reduce((sum, row) => sum + bankLineAmount(row), 0);
    const reference = groupRows.find((row) => row.uitbetalingsreferentie)?.uitbetalingsreferentie
      || settlementId;
    const latestBookingDate = groupRows.reduce(
      (latest, row) => (row.boekingsdatum > latest ? row.boekingsdatum : latest),
      groupRows[0]?.boekingsdatum ?? ''
    );
    result.push({
      settlementId,
      reference,
      rows: groupRows,
      bookableRows,
      netAmount: Math.round(netAmount * 100) / 100,
      latestBookingDate,
    });
  }

  result.sort((a, b) => b.latestBookingDate.localeCompare(a.latestBookingDate));
  return result;
}

/**
 * `account.bank.statement` create-vals voor één settlement-groep (stap 10-11): naam = settlement-
 * referentie, begin- en eindsaldo op nul (deze afschriften documenteren enkel de settlement-batch,
 * ze representeren geen doorlopend banksaldo).
 */
export function settlementGroupToStatementVals(
  group: SettlementRowGroup,
  journalId: number
): Record<string, unknown> {
  return {
    journal_id: journalId,
    name: group.reference || group.settlementId,
    date: group.latestBookingDate || undefined,
    balance_start: 0,
    balance_end_real: 0,
  };
}
