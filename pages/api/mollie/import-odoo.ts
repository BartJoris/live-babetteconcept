/**
 * POST: Mollie settlementregels → Odoo `account.bank.statement.line` (JSON-RPC).
 * Vereist ODOO_USERNAME + ODOO_API_KEY en een bankjournaal met suspense-account.
 *
 * Journal-id = cijfer in Boekhouding-URL `.../accounting/<id>/reconciliation` (bv. duplicaat Mollie: id 12 op
 * https://mollie-babetteconcept.odoo.com/odoo/accounting/12/reconciliation ). Zet ODOO_MOLLIE_BANK_JOURNAL_ID=12
 * en laat ODOO_URL/ODOO_DB naar diezelfde Odoo-database wijzen.
 */
import type { NextApiResponse } from 'next';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import {
  collectSettlementOdooRows,
  settlementOdooRowToBankLineVals,
} from '@/lib/mollieSettlementShared';

type ImportBody = {
  from: string;
  to: string;
  /** Odoo `account.journal` id (type bank). Zo niet meegegeven: env ODOO_MOLLIE_BANK_JOURNAL_ID */
  journalId?: number;
  dryRun?: boolean;
  /** Zoek bestaande regels op ref / move_id.ref = Unieke_import_ID en sla die over */
  skipDuplicates?: boolean;
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

  const { from: fromStr, to: toStr, dryRun, skipDuplicates } = body;
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
    const uid = await odooClient.authenticate(odooUser, odooPass);
    if (!uid) {
      return res.status(401).json({ error: 'Odoo-authenticatie mislukt (controleer ODOO_USERNAME / ODOO_API_KEY).' });
    }

    const { rows, approach, settlementError } = await collectSettlementOdooRows({
      apiKey: apiKey ?? accessToken!,
      accessToken,
      from,
      to,
    });

    if (dryRun) {
      const preview = rows.slice(0, 5).map((r) => settlementOdooRowToBankLineVals(r, journalId));
      return res.status(200).json({
        dryRun: true,
        rowCount: rows.length,
        approach,
        settlementError: settlementError || undefined,
        journalId,
        sampleVals: preview,
      });
    }

    const createdIds: number[] = [];
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        if (skipDuplicates) {
          const existing = await odooClient.search(
            uid,
            odooPass,
            'account.bank.statement.line',
            [
              ['journal_id', '=', journalId],
              '|',
              ['ref', '=', row.uniekeImportId],
              ['move_id.ref', '=', row.uniekeImportId],
            ],
            1
          );
          if (existing.length > 0) {
            skipped += 1;
            continue;
          }
        }

        const vals = settlementOdooRowToBankLineVals(row, journalId);
        const newId = await odooClient.create(uid, odooPass, 'account.bank.statement.line', vals);
        createdIds.push(newId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${row.uniekeImportId}: ${msg}`);
      }
    }

    return res.status(200).json({
      created: createdIds.length,
      skipped,
      failed: errors.length,
      odooLineIds: createdIds,
      approach,
      settlementError: settlementError || undefined,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      errorsTruncated: errors.length > 20 ? errors.length - 20 : 0,
    });
  } catch (error) {
    console.error('Mollie import-odoo error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: message });
  }
});
