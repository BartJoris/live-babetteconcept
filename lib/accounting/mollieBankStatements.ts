/**
 * Gedeelde Odoo-writes voor "Mollie-rij → afschrift" (gids stap 10-14), gebruikt door zowel
 * `/api/mollie/import-odoo-statement` (settlement betalingen/omzet/kosten) als
 * `/api/mollie/import-odoo-capital` (Balances API: Invoice Compensation + Mollie Capital-aflossingen).
 * Beide routes maken losse `account.bank.statement.line`-rijen, groeperen ze per settlement-referentie
 * in één `account.bank.statement` (aanmaken of hergebruiken), en lezen `is_complete`/`is_valid` terug.
 */
import { odooClient } from '@/lib/odooClient';

export interface BankLineSpec {
  /** Stabiele referentie (`account.bank.statement.line.ref`) om duplicaten te herkennen. */
  ref: string;
  vals: Record<string, unknown>;
}

export interface StatementLinkResult {
  statementId: number;
  statementReused: boolean;
  linesCreated: number;
  linesSkipped: number;
  linesLinked: number;
  isComplete: boolean;
  isValid: boolean;
  balanceEnd: number;
  balanceEndReal: number;
}

interface OdooStatementLineRefRow {
  id: number;
  ref: string | false;
}

interface OdooStatementReadRow {
  id: number;
  balance_end: number;
  balance_end_real: number;
  is_complete: boolean;
  is_valid: boolean;
}

/**
 * Maakt de opgegeven banklijnen aan (skip als `ref` al bestaat op dit journaal), maakt of hergebruikt
 * daarna één `account.bank.statement` met `name = reference`, koppelt alle lijnen (bestaand + nieuw) via
 * `statement_id`, en leest tot slot `is_complete`/`is_valid`/`balance_end(_real)` terug.
 */
export async function createOrReuseStatementAndLinkLines(params: {
  uid: number;
  odooPass: string;
  journalId: number;
  reference: string;
  statementVals: Record<string, unknown>;
  lines: BankLineSpec[];
  skipDuplicates: boolean;
}): Promise<StatementLinkResult> {
  const { uid, odooPass, journalId, reference, statementVals, lines, skipDuplicates } = params;
  const refs = lines.map((line) => line.ref).filter(Boolean);

  let existingLineRefs = new Set<string>();
  if (skipDuplicates && refs.length > 0) {
    const existingLines = await odooClient.searchRead<OdooStatementLineRefRow>(
      uid,
      odooPass,
      'account.bank.statement.line',
      [
        ['journal_id', '=', journalId],
        ['ref', 'in', refs],
      ],
      ['id', 'ref']
    );
    existingLineRefs = new Set(
      existingLines
        .map((line) => (typeof line.ref === 'string' ? line.ref : null))
        .filter((ref): ref is string => Boolean(ref))
    );
  }

  let linesCreated = 0;
  let linesSkipped = 0;
  for (const line of lines) {
    if (existingLineRefs.has(line.ref)) {
      linesSkipped += 1;
      continue;
    }
    await odooClient.create(uid, odooPass, 'account.bank.statement.line', line.vals);
    linesCreated += 1;
  }

  const allLineIds =
    refs.length > 0
      ? await odooClient.search(uid, odooPass, 'account.bank.statement.line', [
          ['journal_id', '=', journalId],
          ['ref', 'in', refs],
        ])
      : [];

  let statementId: number | null = null;
  let statementReused = false;
  if (skipDuplicates) {
    const existingStatements = await odooClient.search(
      uid,
      odooPass,
      'account.bank.statement',
      [
        ['journal_id', '=', journalId],
        ['name', '=', reference],
      ],
      1
    );
    if (existingStatements.length > 0) {
      statementId = existingStatements[0];
      statementReused = true;
    }
  }
  if (statementId == null) {
    statementId = await odooClient.create(uid, odooPass, 'account.bank.statement', statementVals);
  }

  let linesLinked = 0;
  if (allLineIds.length > 0) {
    await odooClient.write(uid, odooPass, 'account.bank.statement.line', allLineIds, {
      statement_id: statementId,
    });
    linesLinked = allLineIds.length;
  }

  const [statementRead] = await odooClient.read<OdooStatementReadRow>(
    uid,
    odooPass,
    'account.bank.statement',
    [statementId],
    ['balance_end', 'balance_end_real', 'is_complete', 'is_valid']
  );

  return {
    statementId,
    statementReused,
    linesCreated,
    linesSkipped,
    linesLinked,
    isComplete: Boolean(statementRead?.is_complete),
    isValid: Boolean(statementRead?.is_valid),
    balanceEnd: statementRead?.balance_end ?? NaN,
    balanceEndReal: statementRead?.balance_end_real ?? NaN,
  };
}
