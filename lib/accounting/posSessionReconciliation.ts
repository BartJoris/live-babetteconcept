/**
 * POS-sessies afletteren op rekening 550001 "Outstanding Receipts" (gids stap 17-19):
 * "Opvolgen Openstaande ontvangsten via Controle - Boekingsregels - 550001 ... Samen aanduiden en
 * Afletteren. 1 kassasessie = 1x pos_session_id." Deze module boekt/afletteren niets — ze groepeert de
 * openstaande regels per kassasessie en signaleert waar debet en credit niet aan elkaar gelijk zijn,
 * zodat de admin dat gericht in Odoo kan nakijken en zelf afletteren.
 */

/** Marge waarbinnen een sessie als afgeletterd (debet = credit) telt. */
export const POS_SESSION_BALANCE_TOLERANCE_EUR = 0.01;

export interface OutstandingReceiptLine {
  id: number;
  date: string | null;
  name: string | null;
  debit: number;
  credit: number;
  moveId: number | null;
  moveName: string | null;
  partnerName: string | null;
}

export interface PosSessionReceiptGroup {
  /** `null` = regels zonder herkenbaar `pos_session_id=` patroon (niet aan een kassasessie te koppelen). */
  posSessionId: number | null;
  lines: OutstandingReceiptLine[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
}

/** Leest `pos_session_id=1412` uit een boekingsregelnaam zoals Odoo POS die zelf genereert. */
export function extractPosSessionId(name: string | null | undefined): number | null {
  if (!name) return null;
  const match = /pos_session_id=(\d+)/.exec(name);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Groepeert openstaande `account.move.line`-regels op rekening 550001 per kassasessie. Regels zonder
 * herkenbaar `pos_session_id` (bv. manuele boekingen zoals "Handmatig: Voeg kassabetalingen samen" of
 * individuele Mollie-terugbetalingen aan een klant) komen in een groep met `posSessionId: null`, altijd
 * onderaan gesorteerd — die moeten stuk voor stuk nagekeken worden, niet per sessie.
 */
export function groupOutstandingReceiptsByPosSession(
  lines: OutstandingReceiptLine[],
  tolerance = POS_SESSION_BALANCE_TOLERANCE_EUR
): PosSessionReceiptGroup[] {
  const groups = new Map<number | null, OutstandingReceiptLine[]>();
  for (const line of lines) {
    const posSessionId = extractPosSessionId(line.name);
    const existing = groups.get(posSessionId);
    if (existing) existing.push(line);
    else groups.set(posSessionId, [line]);
  }

  const result: PosSessionReceiptGroup[] = [];
  for (const [posSessionId, groupLines] of groups) {
    const totalDebit = round2(groupLines.reduce((sum, line) => sum + line.debit, 0));
    const totalCredit = round2(groupLines.reduce((sum, line) => sum + line.credit, 0));
    const difference = round2(totalDebit - totalCredit);
    result.push({
      posSessionId,
      lines: groupLines,
      totalDebit,
      totalCredit,
      difference,
      balanced: posSessionId != null && Math.abs(difference) <= tolerance,
    });
  }

  result.sort((a, b) => {
    if (a.posSessionId == null) return 1;
    if (b.posSessionId == null) return -1;
    // Grootste verschil eerst — dat is waar de admin het eerst naar moet kijken.
    const diffCmp = Math.abs(b.difference) - Math.abs(a.difference);
    if (diffCmp !== 0) return diffCmp;
    return b.posSessionId - a.posSessionId;
  });
  return result;
}
