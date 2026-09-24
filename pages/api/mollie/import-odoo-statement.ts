/**
 * POST: Mollie settlement → Odoo "afschrift" per settlement (gids stap 10-14).
 *
 * Vult aan op `/api/mollie/import-odoo` (dat losse `account.bank.statement.line`-rijen maakt): deze route
 * groepeert de rijen per Mollie settlement, maakt (of hergebruikt) daarvoor één `account.bank.statement`
 * met naam = settlement-referentie en begin/eindsaldo op 0, koppelt alle lijnen van die settlement via
 * `statement_id`, en leest daarna `is_complete`/`is_valid` terug — dat is de geautomatiseerde versie van
 * de "Werk bij" groen/rood-controle uit de gids.
 *
 * Standaard `dryRun: true` (alleen preview, geen Odoo-writes). Pas bij een expliciete `dryRun: false` in
 * de body (na bevestiging op het review-scherm) worden er writes gedaan.
 */
import type { NextApiResponse } from 'next';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import {
  bankLineAmount,
  collectSettlementOdooRows,
  groupSettlementRowsBySettlement,
  settlementGroupToStatementVals,
  settlementOdooRowToBankLineVals,
  type SettlementRowGroup,
} from '@/lib/mollieSettlementShared';
import { createOrReuseStatementAndLinkLines } from '@/lib/accounting/mollieBankStatements';

type ImportBody = {
  from: string;
  to: string;
  journalId?: number;
  /** Standaard true: alleen preview, geen Odoo-writes. */
  dryRun?: boolean;
  /** Sla lijnen/afschriften over die al bestaan (op ref, resp. op naam+journaal). */
  skipDuplicates?: boolean;
  /**
   * Optioneel: alleen deze settlement-id's echt boeken (rest van de preview overslaan). Zonder deze
   * lijst (of leeg) worden bij `dryRun: false` alle gevonden settlementgroepen verwerkt — dat is enkel
   * bedoeld als fallback voor bestaande aanroepen; de UI stuurt altijd een expliciete selectie mee.
   */
  selectedSettlementIds?: string[];
};

export type BookableRowDetail = {
  date: string;
  /** Wat er letterlijk in het `payment_ref`-veld van de banklijn komt te staan. */
  description: string;
  /** Bedrag zoals het op de banklijn komt (negatief voor een kost). */
  amount: number;
  /** Stabiele referentie waarop dubbel-boeken herkend wordt (`account.bank.statement.line.ref`). */
  ref: string;
};

export type SettlementGroupPreview = {
  settlementId: string;
  reference: string;
  /** Aantal kosten-regels (Withheld fees) die hier als nieuwe banklijn aangemaakt worden. */
  rowCount: number;
  /** Som van de kosten-regels (negatief) — géén "moet op 0 sluiten"-saldo. */
  netAmount: number;
  /** Totaal aantal Mollie-rijen voor deze settlement (betaling + omzet + kosten), enkel informatief —
   *  de betaling/omzet-rijen staan al elders in Odoo en worden hier NIET aangemaakt. */
  totalRowCount: number;
  /** Exact wat er per regel geboekt wordt — precies dit (en niets anders) komt in Odoo terecht. */
  bookableRowDetails: BookableRowDetail[];
  latestBookingDate: string;
};

export type SettlementGroupResult = SettlementGroupPreview & {
  statementId: number;
  statementReused: boolean;
  linesCreated: number;
  linesSkipped: number;
  linesLinked: number;
  isComplete: boolean;
  isValid: boolean;
  balanceEnd: number;
  balanceEndReal: number;
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

function toPreview(group: SettlementRowGroup): SettlementGroupPreview {
  return {
    settlementId: group.settlementId,
    reference: group.reference,
    rowCount: group.bookableRows.length,
    netAmount: group.netAmount,
    totalRowCount: group.rows.length,
    bookableRowDetails: group.bookableRows.map((row) => ({
      date: row.boekingsdatum,
      description: row.descriptionOdoo || row.omschrijving,
      amount: bankLineAmount(row),
      ref: row.uniekeImportId,
    })),
    latestBookingDate: group.latestBookingDate,
  };
}

/**
 * Maakt (of hergebruikt) het afschrift voor één settlement-groep en boekt enkel de kosten-regels
 * (`bookableRows`) als nieuwe banklijn. De betaling/omzet-regels worden bewust NIET aangemaakt — die
 * staan al in Odoo (zie uitleg bij `SettlementRowGroup`) en opnieuw boeken zou de omzet dubbel (zelfs
 * driedubbel) tellen.
 */
async function processGroup(params: {
  uid: number;
  odooPass: string;
  journalId: number;
  group: SettlementRowGroup;
  skipDuplicates: boolean;
}): Promise<SettlementGroupResult> {
  const { uid, odooPass, journalId, group, skipDuplicates } = params;
  const reference = group.reference || group.settlementId;

  const linkResult = await createOrReuseStatementAndLinkLines({
    uid,
    odooPass,
    journalId,
    reference,
    statementVals: settlementGroupToStatementVals(group, journalId),
    lines: group.bookableRows.map((row) => ({
      ref: row.uniekeImportId,
      vals: settlementOdooRowToBankLineVals(row, journalId),
    })),
    skipDuplicates,
  });

  return { ...toPreview(group), ...linkResult };
}

export default withAuth(async (req: NextApiRequestWithSession, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  const accessToken = process.env.MOLLIE_ACCESS_TOKEN;
  if (!apiKey && !accessToken) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY of MOLLIE_ACCESS_TOKEN niet geconfigureerd' });
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
  const dryRun = body.dryRun !== false; // default true — expliciete confirm nodig voor writes
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
    const { rows, approach, settlementError } = await collectSettlementOdooRows({
      apiKey: apiKey ?? accessToken!,
      accessToken,
      from,
      to,
    });

    const allGroups = groupSettlementRowsBySettlement(rows);
    // Enkel settlements met minstens 1 kosten-regel: dat is het enige dat deze route boekt (zie
    // SettlementRowGroup-uitleg). Settlements zonder kosten die dag hebben hier niets te doen.
    const groups = allGroups.filter((group) => group.settlementId !== '' && group.bookableRows.length > 0);
    const ungrouped = allGroups.find((group) => group.settlementId === '');

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        journalId,
        approach,
        settlementError: settlementError || undefined,
        groups: groups.map(toPreview),
        ungroupedRowCount: ungrouped?.rows.length ?? 0,
        note:
          'Deze knop boekt enkel de Mollie-kostenregels (Withheld fees) als nieuwe banklijn. De onderliggende betalingen staan al in Odoo (via de kassa/webshop-koppeling) en worden hier niet nog eens aangemaakt — dat zou de omzet dubbel boeken. Het afschrift sluit daardoor voorlopig niet op €0.',
        warning:
          approach === 'payments'
            ? 'Settlements API niet beschikbaar (fallback naar Payments API): rijen hebben geen settlement-referentie, dus er kan geen afschrift per settlement aangemaakt worden. Voeg MOLLIE_ACCESS_TOKEN toe voor volledige settlement-data.'
            : undefined,
      });
    }

    if (approach === 'payments') {
      return res.status(409).json({
        error:
          'Geen settlement-referenties beschikbaar (Payments API-fallback). Afschrift-aanmaak per settlement is niet mogelijk zonder MOLLIE_ACCESS_TOKEN.',
      });
    }

    const uid = await odooClient.authenticate(odooUser, odooPass);
    if (!uid) {
      return res.status(401).json({ error: 'Odoo-authenticatie mislukt (controleer ODOO_USERNAME / ODOO_API_KEY).' });
    }

    const selectedIds = Array.isArray(body.selectedSettlementIds) ? new Set(body.selectedSettlementIds) : null;
    const groupsToProcess = selectedIds ? groups.filter((group) => selectedIds.has(group.settlementId)) : groups;

    const results: SettlementGroupResult[] = [];
    const errors: string[] = [];
    for (const group of groupsToProcess) {
      try {
        results.push(await processGroup({ uid, odooPass, journalId, group, skipDuplicates }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${group.reference || group.settlementId}: ${msg}`);
      }
    }

    return res.status(200).json({
      dryRun: false,
      journalId,
      approach,
      results,
      ungroupedRowCount: ungrouped?.rows.length ?? 0,
      deselectedGroupCount: groups.length - groupsToProcess.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Mollie import-odoo-statement error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: message });
  }
});
