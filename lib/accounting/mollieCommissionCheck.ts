/**
 * Maandelijkse Mollie-commissiecontrole (gids stap 16): "Som van de commissies stemt overeen met
 * de maandelijkse commissiefactuur." Vergelijkt de som van de `kosten`-rijen uit de Mollie
 * settlement-data (zie `lib/mollieSettlementShared.ts`) per maand met de Mollie-leveranciersfacturen
 * (`account.move`, `move_type=in_invoice`, partner Mollie) voor diezelfde maand.
 *
 * Puur informatief/read-only: dit boekt niets, het geeft alleen aan waar het bedrag niet overeenkomt
 * zodat de admin dat kan nakijken (en zelf beslissen wat te doen) — vergelijkbaar met hoe
 * `lib/accounting/posSessionReconciliation.ts` niets afletteren, enkel signaleert.
 */
import { bankLineAmount, type SettlementOdooRow } from '@/lib/mollieSettlementShared';

/** Marge waarbinnen een maand als "overeenkomend" telt (afronding/kleine verschillen). */
export const COMMISSION_CHECK_TOLERANCE_EUR = 0.02;

export interface MollieCommissionBill {
  id: number;
  name: string | null;
  date: string | null;
  amountTotal: number;
  ref: string | null;
}

export interface MollieCommissionMonthCheck {
  /** YYYY-MM */
  month: string;
  settlementCostsTotal: number;
  billsTotal: number;
  difference: number;
  matched: boolean;
  bills: MollieCommissionBill[];
}

export function monthKeyFromIso(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const match = /^(\d{4}-\d{2})/.exec(dateStr.trim());
  return match ? match[1] : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Vergelijkt per maand de som van de Mollie "kosten"-settlementrijen met de Mollie-leveranciers-
 * facturen van die maand. Elke maand die in minstens één van beide bronnen voorkomt, krijgt een
 * resultaat (ook als er geen facturen zijn — dan is `billsTotal: 0` en `matched: false` zodra er
 * kosten zijn, wat betekent: nog geen commissiefactuur voor deze maand geboekt).
 */
export function computeMollieCommissionCheck(
  settlementRows: SettlementOdooRow[],
  bills: MollieCommissionBill[],
  tolerance = COMMISSION_CHECK_TOLERANCE_EUR
): MollieCommissionMonthCheck[] {
  const costsByMonth = new Map<string, number>();
  for (const row of settlementRows) {
    if (row.regeltype !== 'kosten') continue;
    const month = monthKeyFromIso(row.boekingsdatum);
    if (!month) continue;
    costsByMonth.set(month, (costsByMonth.get(month) ?? 0) + Math.abs(bankLineAmount(row)));
  }

  const billsByMonth = new Map<string, MollieCommissionBill[]>();
  for (const bill of bills) {
    const month = monthKeyFromIso(bill.date);
    if (!month) continue;
    const list = billsByMonth.get(month) ?? [];
    list.push(bill);
    billsByMonth.set(month, list);
  }

  const months = new Set([...costsByMonth.keys(), ...billsByMonth.keys()]);
  const results: MollieCommissionMonthCheck[] = [];
  for (const month of months) {
    const settlementCostsTotal = round2(costsByMonth.get(month) ?? 0);
    const monthBills = billsByMonth.get(month) ?? [];
    const billsTotal = round2(monthBills.reduce((sum, bill) => sum + bill.amountTotal, 0));
    const difference = round2(settlementCostsTotal - billsTotal);
    results.push({
      month,
      settlementCostsTotal,
      billsTotal,
      difference,
      matched: Math.abs(difference) <= tolerance,
      bills: monthBills,
    });
  }

  results.sort((a, b) => b.month.localeCompare(a.month));
  return results;
}
