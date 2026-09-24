import { odooClient } from '@/lib/odooClient';
import { many2oneName } from '@/lib/accounting/insights';
import type { OutstandingReceiptLine } from '@/lib/accounting/posSessionReconciliation';

const OUTSTANDING_RECEIPTS_ACCOUNT_CODE = '550001';
const PAGE_SIZE = 500;

interface OdooOutstandingReceiptRecord {
  id: number;
  date?: string | false;
  name?: string | false;
  debit?: number;
  credit?: number;
  move_id?: unknown;
  partner_id?: unknown;
}

/** Openstaande regels op rekening 550001 "Outstanding Receipts" (gids stap 17). */
export async function fetchOutstandingReceipts(
  uid: number,
  password: string,
  dateFrom?: string,
  dateTo?: string
): Promise<OutstandingReceiptLine[]> {
  const domain: unknown[] = [
    ['account_id.code', '=', OUTSTANDING_RECEIPTS_ACCOUNT_CODE],
    ['reconciled', '=', false],
  ];
  if (dateFrom) domain.push(['date', '>=', dateFrom]);
  if (dateTo) domain.push(['date', '<=', dateTo]);

  const rows = await odooClient.searchRead<OdooOutstandingReceiptRecord>(
    uid,
    password,
    'account.move.line',
    domain,
    ['id', 'date', 'name', 'debit', 'credit', 'move_id', 'partner_id'],
    PAGE_SIZE,
    0,
    'date desc, id desc'
  );

  return rows.map((row) => {
    const moveId = Array.isArray(row.move_id) ? (row.move_id[0] as number) : null;
    return {
      id: row.id,
      date: typeof row.date === 'string' ? row.date : null,
      name: typeof row.name === 'string' ? row.name : null,
      debit: typeof row.debit === 'number' ? row.debit : 0,
      credit: typeof row.credit === 'number' ? row.credit : 0,
      moveId,
      moveName: many2oneName(row.move_id),
      partnerName: many2oneName(row.partner_id),
    };
  });
}
