/**
 * POST: Mollie "Withheld fees" + "Invoice Compensation" + "Terugbetaling Mollie Capital" → Odoo, per
 * settlement-afschrift. Automatiseert wat de boekhouder nu handmatig doet: settlement-PDF's/dashboard
 * aflezen, een Excel opbouwen (`mollie_capital_lines.xlsx`, kolommen Date/Category/MOL-NL
 * Reference/Description/Amount/Settlement Report) en die via Odoo's bank-importwizard binnenbrengen.
 *
 * Bronnen:
 * - Withheld fees: Settlements API (`periods[].costs`) — al beschikbaar via `collectSettlementOdooRows`.
 * - Invoice Compensation + Capital-aflossingen: Balances API (`lib/mollieBalanceTransactions.ts`),
 *   vereist een token met `balances.read` (MOLLIE_ACCESS_TOKEN — een profiel-API-key werkt hier niet).
 *
 * Standaard `dryRun: true`. Pas bij een expliciete `dryRun: false` (na bevestiging op het
 * review-scherm) worden er writes gedaan — zelfde patroon als `/api/mollie/import-odoo-statement`.
 */
import type { NextApiResponse } from 'next';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import {
  collectSettlementOdooRows,
  fetchInvoiceReference,
  fetchSettlementsForPeriod,
} from '@/lib/mollieSettlementShared';
import { fetchMollieBalanceTransactions } from '@/lib/mollieBalanceTransactions';
import {
  buildMollieCapitalLedger,
  groupLedgerRowsBySettlement,
  ledgerRowToBankLineVals,
  summarizeLedgerByCategory,
  type MollieLedgerCategorySummary,
  type MollieLedgerRow,
  type MollieLedgerSettlementGroup,
  type SettlementDateRef,
} from '@/lib/accounting/mollieCapitalLedger';
import { createOrReuseStatementAndLinkLines } from '@/lib/accounting/mollieBankStatements';

type ImportBody = {
  from: string;
  to: string;
  journalId?: number;
  dryRun?: boolean;
  skipDuplicates?: boolean;
  /** Optioneel: alleen deze settlement-referenties echt boeken bij `dryRun: false`. Zonder lijst worden
   *  alle opgeloste groepen verwerkt (fallback voor bestaande aanroepen). */
  selectedSettlementReferences?: string[];
};

export type LedgerGroupPreview = {
  settlementReference: string;
  rowCount: number;
  netAmount: number;
  rows: MollieLedgerRow[];
};

export type LedgerGroupResult = {
  settlementReference: string;
  statementId: number;
  statementReused: boolean;
  linesCreated: number;
  linesSkipped: number;
  linesLinked: number;
  isComplete: boolean;
  isValid: boolean;
};

function parseJournalId(body: ImportBody): number | null {
  if (typeof body.journalId === 'number' && Number.isFinite(body.journalId) && body.journalId > 0) {
    return Math.floor(body.journalId);
  }
  const envId = process.env.ODOO_MOLLIE_BANK_JOURNAL_ID;
  if (!envId) return null;
  const n = Number.parseInt(envId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toPreview(group: MollieLedgerSettlementGroup): LedgerGroupPreview {
  return {
    settlementReference: group.settlementReference,
    rowCount: group.rows.length,
    netAmount: group.netAmount,
    rows: group.rows,
  };
}

async function buildLedger(params: {
  accessToken: string;
  apiKey: string | undefined;
  from: Date;
  to: Date;
}): Promise<{ rows: MollieLedgerRow[]; unresolvedInvoiceIds: string[] }> {
  const { accessToken, apiKey, from, to } = params;

  const [{ rows: settlementRows }, settlements, { transactions, truncated }] = await Promise.all([
    collectSettlementOdooRows({ apiKey: apiKey ?? accessToken, accessToken, from, to }),
    fetchSettlementsForPeriod(accessToken, from, to),
    fetchMollieBalanceTransactions(accessToken, from),
  ]);

  if (truncated) {
    console.warn('Mollie balance transactions pagination truncated (MAX_PAGES bereikt) voor periode', from, to);
  }

  const settlementDateRefs: SettlementDateRef[] = settlements.map((settlement) => ({
    id: settlement.id,
    reference: settlement.reference || settlement.id,
    dateIso: (settlement.settledAt ?? settlement.createdAt).slice(0, 10),
  }));

  const invoiceIds = [
    ...new Set(
      transactions
        .filter((tx) => tx.type === 'invoice-compensation')
        .map((tx) => (typeof tx.context?.invoiceId === 'string' ? tx.context.invoiceId : null))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const invoiceReferenceByInvoiceId = new Map<string, string>();
  const unresolvedInvoiceIds: string[] = [];
  for (const invoiceId of invoiceIds) {
    const reference = await fetchInvoiceReference(accessToken, invoiceId);
    if (reference) invoiceReferenceByInvoiceId.set(invoiceId, reference);
    else unresolvedInvoiceIds.push(invoiceId);
  }

  const rows = buildMollieCapitalLedger({
    withheldFeesSettlementRows: settlementRows,
    balanceTransactions: transactions,
    invoiceReferenceByInvoiceId,
    settlements: settlementDateRefs,
  });

  return { rows, unresolvedInvoiceIds };
}

export default withAuth(async (req: NextApiRequestWithSession, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  const accessToken = process.env.MOLLIE_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({
      error:
        'MOLLIE_ACCESS_TOKEN niet geconfigureerd of zonder balances.read-scope. Deze route heeft de Balances API nodig (Invoice Compensation + Mollie Capital); een gewone profiel-API-key (MOLLIE_API_KEY) werkt hier niet. Maak een Advanced access token aan in Mollie → Developers → API access tokens, met balances.read + settlements.read.',
    });
  }

  const odooUser = process.env.ODOO_USERNAME;
  const odooPass = process.env.ODOO_API_KEY;
  if (!odooUser || !odooPass) {
    return res.status(500).json({
      error: 'ODOO_USERNAME en ODOO_API_KEY zijn verplicht voor server-side Odoo-import.',
    });
  }

  let body: ImportBody;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Ongeldige JSON body' });
  }

  const { from: fromStr, to: toStr } = body;
  const dryRun = body.dryRun !== false;
  const skipDuplicates = body.skipDuplicates !== false;
  if (!fromStr || !toStr || typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return res.status(400).json({ error: 'Body moet "from" en "to" bevatten (YYYY-MM-DD)' });
  }

  const journalId = parseJournalId(body);
  if (!journalId) {
    return res.status(400).json({
      error:
        'journalId ontbreekt. Geef journalId in de body mee of zet ODOO_MOLLIE_BANK_JOURNAL_ID in .env (Odoo bankjournaal).',
    });
  }

  const from = new Date(fromStr + 'T00:00:00.000Z');
  const to = new Date(toStr + 'T23:59:59.999Z');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Ongeldige datumnotatie.' });
  }

  try {
    const { rows, unresolvedInvoiceIds } = await buildLedger({ accessToken, apiKey, from, to });
    const allGroups = groupLedgerRowsBySettlement(rows);
    const resolvedGroups = allGroups.filter((group) => group.settlementReference !== '');
    const unresolvedGroup = allGroups.find((group) => group.settlementReference === '');

    const summary: MollieLedgerCategorySummary[] = summarizeLedgerByCategory(rows);

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        journalId,
        summary,
        groups: resolvedGroups.map(toPreview),
        unresolvedRowCount: unresolvedGroup?.rows.length ?? 0,
        unresolvedInvoiceIds: unresolvedInvoiceIds.length > 0 ? unresolvedInvoiceIds : undefined,
      });
    }

    const uid = await odooClient.authenticate(odooUser, odooPass);
    if (!uid) {
      return res.status(401).json({ error: 'Odoo-authenticatie mislukt (controleer ODOO_USERNAME / ODOO_API_KEY).' });
    }

    const selectedRefs = Array.isArray(body.selectedSettlementReferences)
      ? new Set(body.selectedSettlementReferences)
      : null;
    const groupsToProcess = selectedRefs
      ? resolvedGroups.filter((group) => selectedRefs.has(group.settlementReference))
      : resolvedGroups;

    const results: LedgerGroupResult[] = [];
    const errors: string[] = [];
    for (const group of groupsToProcess) {
      try {
        const linkResult = await createOrReuseStatementAndLinkLines({
          uid,
          odooPass,
          journalId,
          reference: group.settlementReference,
          statementVals: {
            journal_id: journalId,
            name: group.settlementReference,
            balance_start: 0,
            balance_end_real: 0,
          },
          lines: group.rows.map((row) => ({
            ref: row.uniqueId,
            vals: ledgerRowToBankLineVals(row, journalId),
          })),
          skipDuplicates,
        });
        results.push({ settlementReference: group.settlementReference, ...linkResult });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${group.settlementReference}: ${msg}`);
      }
    }

    return res.status(200).json({
      dryRun: false,
      journalId,
      results,
      deselectedGroupCount: resolvedGroups.length - groupsToProcess.length,
      unresolvedRowCount: unresolvedGroup?.rows.length ?? 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Mollie import-odoo-capital error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: message });
  }
});
