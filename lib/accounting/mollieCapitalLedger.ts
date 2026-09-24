/**
 * "Mollie Ledger Lines" — de handmatige Excel die de boekhouder nu per settlement samenstelt uit het
 * Mollie-dashboard (kolommen: Date, Category, MOL-NL Reference, Description, Amount, Settlement Report,
 * Source File) en via Odoo's bank-import-wizard binnenbrengt. Deze module bouwt dezelfde drie
 * categorieën automatisch:
 *
 * - `withheld_fees`  — zit al in de Settlements API (`periods[].costs`, zie `mollieSettlementShared.ts`).
 * - `invoice_compensation` en `capital_repayment` — bestaan niet in de Settlements API, enkel in de
 *   Balances API (`lib/mollieBalanceTransactions.ts`): resp. transacties met `type: "invoice-compensation"`
 *   en de opgetelde `deductionDetails.repayments` per dag (Mollie Capital-aflossing, ingehouden per
 *   betaling — geen los `loan`/`repayment`-type bij dit account).
 *
 * Alle rijen worden per Settlement Report (dagelijks afschrift, `transferFrequency: revenue-day`)
 * gegroepeerd zodat ze bij dezelfde afschriften terechtkomen als de rest van die dag
 * (`lib/accounting/mollieBankStatements.ts`).
 */
import type { SettlementOdooRow } from '@/lib/mollieSettlementShared';
import type { MollieBalanceTransaction } from '@/lib/mollieBalanceTransactions';

export type MollieLedgerCategory = 'withheld_fees' | 'invoice_compensation' | 'capital_repayment';

export interface MollieLedgerRow {
  /** YYYY-MM-DD */
  date: string;
  category: MollieLedgerCategory;
  /** MOL-NL-factuurreferentie, leeg bij Capital-aflossingen (die hebben er geen). */
  reference: string;
  description: string;
  amount: number;
  /** Settlement-referentie waaraan dit hoort (afschriftnaam), leeg als nog niet af te leiden. */
  settlementReference: string;
  settlementId: string;
  /** Stabiel over meerdere runs, voor duplicaat-detectie in Odoo. */
  uniqueId: string;
}

export interface SettlementDateRef {
  id: string;
  reference: string;
  /** YYYY-MM-DD, afgeleid van `settledAt` of `createdAt`. */
  dateIso: string;
}

export function ledgerCategoryLabel(category: MollieLedgerCategory): string {
  switch (category) {
    case 'withheld_fees':
      return 'Withheld fees (Mollie)';
    case 'invoice_compensation':
      return 'Invoice Compensation';
    case 'capital_repayment':
      return 'Terugbetaling Mollie Capital';
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toAmount(value: string | undefined | null): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** Settlement met het kleinste `dateIso` dat op of na `dateIso` valt (eerste uitbetaling die deze dag meeneemt). */
export function resolveSettlementForDate(
  dateIso: string,
  settlementsSortedAsc: SettlementDateRef[]
): SettlementDateRef | null {
  for (const settlement of settlementsSortedAsc) {
    if (settlement.dateIso >= dateIso) return settlement;
  }
  return null;
}

export function sortSettlementDateRefsAsc(settlements: SettlementDateRef[]): SettlementDateRef[] {
  return [...settlements].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

/**
 * `withheld_fees`-rijen zijn de 'kosten'-rijen die we al via de Settlements API hebben (geen extra
 * Balances-call nodig, en al correct per settlement gegroepeerd).
 */
export function withheldFeesRowsFromSettlementRows(rows: SettlementOdooRow[]): MollieLedgerRow[] {
  return rows
    .filter((row) => row.regeltype === 'kosten')
    .map((row) => ({
      date: row.boekingsdatum,
      category: 'withheld_fees' as const,
      reference: row.mollieInvoiceId,
      description: row.descriptionOdoo || row.omschrijving,
      amount: round2(Number.parseFloat(String(row.uitbetalingsbedrag).replace(',', '.')) || 0),
      settlementReference: row.uitbetalingsreferentie || row.settlementId,
      settlementId: row.settlementId,
      uniqueId: row.uniekeImportId,
    }));
}

/**
 * `invoice_compensation`-rijen: één rij per `type: "invoice-compensation"` balance-transaction.
 * `invoiceReferenceByInvoiceId` komt van `fetchInvoiceReference` (Mollie `inv_...` → `MOL-NL-R...`),
 * dezelfde functie die de klassieke CSV-export al gebruikt voor kostenregels.
 */
export function buildInvoiceCompensationRows(
  transactions: MollieBalanceTransaction[],
  invoiceReferenceByInvoiceId: Map<string, string>,
  settlementsSortedAsc: SettlementDateRef[]
): MollieLedgerRow[] {
  const rows: MollieLedgerRow[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'invoice-compensation') continue;
    const date = dateOnly(tx.createdAt);
    const invoiceId = typeof tx.context?.invoiceId === 'string' ? tx.context.invoiceId : null;
    const reference = (invoiceId && invoiceReferenceByInvoiceId.get(invoiceId)) || invoiceId || '';
    const settlement = resolveSettlementForDate(date, settlementsSortedAsc);
    rows.push({
      date,
      category: 'invoice_compensation',
      reference,
      description: reference ? `Invoice Compensation ${reference}` : 'Invoice Compensation',
      amount: round2(toAmount(tx.resultAmount?.value)),
      settlementReference: settlement?.reference ?? '',
      settlementId: settlement?.id ?? '',
      uniqueId: tx.id,
    });
  }
  return rows;
}

/**
 * `payment.id → settlement` opzoektabel, afgeleid van de al-opgehaalde 'betaling'-rijen
 * (`withheldFeesRowsFromSettlementRows`s buurman: elke `paymentToOdooRow` heeft `uniekeImportId =
 * payment.id` en `settlementId`). Nodig omdat een betaling soms met een paar dagen vertraging
 * afgerekend wordt — de datum van de betaling zegt dus NIET welk afschrift de bijhorende Capital-
 * aflossing bevat. Alleen zo weten we zeker in welk afschrift de aflossing terechtkomt.
 *
 * `settlementsById` levert de échte settle-datum (niet de betaaldatum) zodat de resulterende
 * Capital-regel net als in Mollie's eigen "Uitbetaling Verslag" op de settlementdatum geboekt wordt.
 */
export function buildPaymentSettlementMap(
  rows: SettlementOdooRow[],
  settlementsById: Map<string, SettlementDateRef>
): Map<string, SettlementDateRef> {
  const map = new Map<string, SettlementDateRef>();
  for (const row of rows) {
    if (row.regeltype !== 'betaling' || !row.settlementId) continue;
    const settlement = settlementsById.get(row.settlementId) ?? {
      id: row.settlementId,
      reference: row.uitbetalingsreferentie || row.settlementId,
      dateIso: row.boekingsdatum,
    };
    map.set(row.uniekeImportId, settlement);
  }
  return map;
}

/**
 * `capital_repayment`-rijen: som van `deductionDetails.repayments`, gegroepeerd per **afschrift**
 * waarin de onderliggende betaling effectief werd meegenomen (via `paymentSettlementMap`) — niet per
 * transactiedatum. Een betaling van dag N kan pas dagen later afgerekend worden (in de praktijk tot een
 * paar dagen vertraging); de aflossing moet bij dát latere afschrift staan, exact zoals in Mollie's
 * eigen "Uitbetaling Verslag".
 *
 * Er wordt **niet** op datum gegokt naar "het waarschijnlijke afschrift" — dat bleek bij een vertraagde
 * betaling het verkeerde afschrift op te leveren (aflossing van 4 dagen eerder ten onrechte aan een
 * tussenliggend afschrift toegekend). Betalingen die (nog) niet in `paymentSettlementMap` staan (net
 * gebeurd, nog niet afgerekend, of settlement-lijst viel buiten de opgehaalde periode) komen daarom in
 * één "nog niet toe te wijzen"-rij per dag terecht (`settlementReference: ''`) — de route/UI slaat die
 * bewust over bij het echt boeken, tot ze wél een afschrift hebben.
 */
export function buildCapitalRepaymentRows(
  transactions: MollieBalanceTransaction[],
  paymentSettlementMap: Map<string, SettlementDateRef>,
  tolerance = 0.005
): MollieLedgerRow[] {
  interface Bucket {
    total: number;
    settlement: SettlementDateRef | null;
    date: string;
  }
  const buckets = new Map<string, Bucket>();

  for (const tx of transactions) {
    const repayment = tx.deductionDetails?.repayments?.value;
    if (!repayment) continue;
    const date = dateOnly(tx.createdAt);
    const paymentId = typeof tx.context?.paymentId === 'string' ? tx.context.paymentId : null;
    const settlement = paymentId ? paymentSettlementMap.get(paymentId) ?? null : null;
    const key = settlement ? `settlement:${settlement.reference}` : `unresolved:${date}`;

    const bucket = buckets.get(key) ?? { total: 0, settlement, date };
    bucket.total += toAmount(repayment);
    buckets.set(key, bucket);
  }

  const rows: MollieLedgerRow[] = [];
  for (const bucket of buckets.values()) {
    if (Math.abs(bucket.total) <= tolerance) continue;
    const settlementReference = bucket.settlement?.reference ?? '';
    rows.push({
      date: bucket.settlement?.dateIso ?? bucket.date,
      category: 'capital_repayment',
      reference: '',
      description: settlementReference
        ? 'Terugbetaling voor Mollie Capital'
        : 'Terugbetaling voor Mollie Capital (nog niet afgerekend — geen afschrift bekend)',
      amount: round2(bucket.total),
      settlementReference,
      settlementId: bucket.settlement?.id ?? '',
      uniqueId: settlementReference
        ? `capital-repayment:${settlementReference}`
        : `capital-repayment:unresolved:${bucket.date}`,
    });
  }
  return rows;
}

export function buildMollieCapitalLedger(params: {
  withheldFeesSettlementRows: SettlementOdooRow[];
  balanceTransactions: MollieBalanceTransaction[];
  invoiceReferenceByInvoiceId: Map<string, string>;
  settlements: SettlementDateRef[];
}): MollieLedgerRow[] {
  const settlementsSortedAsc = sortSettlementDateRefsAsc(params.settlements);
  const settlementsById = new Map(params.settlements.map((settlement) => [settlement.id, settlement]));
  const paymentSettlementMap = buildPaymentSettlementMap(params.withheldFeesSettlementRows, settlementsById);
  const rows = [
    ...withheldFeesRowsFromSettlementRows(params.withheldFeesSettlementRows),
    ...buildInvoiceCompensationRows(
      params.balanceTransactions,
      params.invoiceReferenceByInvoiceId,
      settlementsSortedAsc
    ),
    ...buildCapitalRepaymentRows(params.balanceTransactions, paymentSettlementMap),
  ];
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
  return rows;
}

export interface MollieLedgerCategorySummary {
  category: MollieLedgerCategory;
  count: number;
  total: number;
}

export function summarizeLedgerByCategory(rows: MollieLedgerRow[]): MollieLedgerCategorySummary[] {
  const byCategory = new Map<MollieLedgerCategory, { count: number; total: number }>();
  for (const row of rows) {
    const entry = byCategory.get(row.category) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += row.amount;
    byCategory.set(row.category, entry);
  }
  return [...byCategory.entries()]
    .map(([category, { count, total }]) => ({ category, count, total: round2(total) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export interface MollieLedgerSettlementGroup {
  settlementReference: string;
  settlementId: string;
  rows: MollieLedgerRow[];
  netAmount: number;
}

/** Groepeert per settlement-referentie; rijen zonder resolveerbare settlement komen onder `''` (nog niet uitbetaald). */
export function groupLedgerRowsBySettlement(rows: MollieLedgerRow[]): MollieLedgerSettlementGroup[] {
  const groups = new Map<string, MollieLedgerRow[]>();
  for (const row of rows) {
    const key = row.settlementReference;
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const result: MollieLedgerSettlementGroup[] = [];
  for (const [settlementReference, groupRows] of groups) {
    result.push({
      settlementReference,
      settlementId: groupRows.find((row) => row.settlementId)?.settlementId ?? '',
      rows: groupRows,
      netAmount: round2(groupRows.reduce((sum, row) => sum + row.amount, 0)),
    });
  }
  result.sort((a, b) => b.settlementReference.localeCompare(a.settlementReference));
  return result;
}

/** `account.bank.statement.line` create-vals voor één ledgerrij. */
export function ledgerRowToBankLineVals(row: MollieLedgerRow, journalId: number): Record<string, unknown> {
  return {
    journal_id: journalId,
    date: row.date,
    amount: row.amount,
    payment_ref: row.description.slice(0, 512),
    ref: row.uniqueId.slice(0, 255),
  };
}
