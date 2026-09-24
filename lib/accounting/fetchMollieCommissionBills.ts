import { odooClient } from '@/lib/odooClient';
import type { MollieCommissionBill } from '@/lib/accounting/mollieCommissionCheck';

interface OdooMollieBillRecord {
  id: number;
  name?: string | false;
  date?: string | false;
  amount_total?: number;
  ref?: string | false;
}

/** Mollie-leveranciersfacturen (commissie) voor een periode, gebruikt door de maandcontrole (stap 16). */
export async function fetchMollieCommissionBills(
  uid: number,
  password: string,
  dateFrom: string,
  dateTo: string
): Promise<MollieCommissionBill[]> {
  const rows = await odooClient.searchRead<OdooMollieBillRecord>(
    uid,
    password,
    'account.move',
    [
      ['move_type', '=', 'in_invoice'],
      ['partner_id.name', 'ilike', 'mollie'],
      ['date', '>=', dateFrom],
      ['date', '<=', dateTo],
    ],
    ['id', 'name', 'date', 'amount_total', 'ref'],
    1000,
    0,
    'date desc, id desc'
  );

  return rows.map((row) => ({
    id: row.id,
    name: typeof row.name === 'string' ? row.name : null,
    date: typeof row.date === 'string' ? row.date : null,
    amountTotal: typeof row.amount_total === 'number' ? row.amount_total : 0,
    ref: typeof row.ref === 'string' ? row.ref : null,
  }));
}
