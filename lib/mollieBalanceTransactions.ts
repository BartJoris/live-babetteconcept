/**
 * Mollie Balances API — voor gegevens die niet in de Settlements API zitten: Invoice Compensation en
 * Mollie Capital-aflossingen (zie `lib/accounting/mollieCapitalLedger.ts`). Vereist een advanced access
 * token / OAuth-token met de `balances.read`-scope (MOLLIE_ACCESS_TOKEN) — een gewone profiel-API-key
 * (MOLLIE_API_KEY) werkt hier niet, dit is een organisatie-niveau endpoint.
 *
 * De `from`-query-parameter van deze API is een paginatie-cursor (transactie-id), geen datum. We
 * pagineren daarom vanaf de nieuwste transactie en stoppen zodra we voorbij `from` (de gevraagde
 * periode-startdatum) zijn.
 */
import { fetchMollie } from '@/lib/mollieSettlementShared';

export interface MollieMoneyAmount {
  currency: string;
  value: string;
}

export interface MollieDeductionDetails {
  fees?: MollieMoneyAmount | null;
  commissions?: MollieMoneyAmount | null;
  repayments?: MollieMoneyAmount | null;
  rollingReserve?: MollieMoneyAmount | null;
}

export interface MollieBalanceTransaction {
  resource: 'balance-transaction';
  id: string;
  type: string;
  resultAmount: MollieMoneyAmount;
  initialAmount: MollieMoneyAmount;
  deductions?: MollieMoneyAmount | null;
  deductionDetails?: MollieDeductionDetails | null;
  createdAt: string;
  context?: Record<string, unknown> | null;
}

interface MollieBalanceTransactionListResponse {
  _embedded: { balance_transactions: MollieBalanceTransaction[] };
  _links: { next?: { href: string }; self: { href: string } };
}

/**
 * Grotere pagina's bleken NIET sneller in de praktijk: Mollie's antwoordtijd schaalt mee met de
 * paginagrootte (waarschijnlijk `deductionDetails` per item berekend), dus minder-maar-grotere
 * requests wint hier niets en liep zelfs tegen `REQUEST_TIMEOUT_MS` aan bij 250. 50 is gemeten
 * (~38s voor een volledige septembermaand, 241 transacties) en past ruim binnen de 60s-functielimiet.
 */
const BALANCE_TRANSACTIONS_PAGE_SIZE = 50;
/** Veiligheidslimiet: 60 pagina's × 50 = 3000 transacties, ruim genoeg voor een kwartaal. */
const MAX_PAGES = 60;
const REQUEST_TIMEOUT_MS = 25_000;

async function fetchMollieWithTimeout(url: string, token: string): Promise<MollieBalanceTransactionListResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return (await fetchMollie(url, token, controller.signal)) as MollieBalanceTransactionListResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Haalt balance-transactions op vanaf `from` (inclusief) tot nu, nieuwste eerst uit de API maar hier
 * teruggegeven oudste-eerst. Stopt zodra de oudste transactie op de huidige pagina vóór `from` ligt, of
 * bij `MAX_PAGES` (dan is `truncated: true` in het resultaat — de periode is dan te groot geweest).
 */
export async function fetchMollieBalanceTransactions(
  token: string,
  from: Date,
  balanceId = 'primary'
): Promise<{ transactions: MollieBalanceTransaction[]; truncated: boolean }> {
  const transactions: MollieBalanceTransaction[] = [];
  let url: string | null =
    `https://api.mollie.com/v2/balances/${balanceId}/transactions?limit=${BALANCE_TRANSACTIONS_PAGE_SIZE}`;
  let pages = 0;
  let stop = false;
  let truncated = false;

  while (url && !stop) {
    if (pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const data = await fetchMollieWithTimeout(url, token);
    pages += 1;
    const list = data._embedded?.balance_transactions ?? [];
    for (const tx of list) {
      if (new Date(tx.createdAt) < from) {
        stop = true;
        break;
      }
      transactions.push(tx);
    }
    url = stop ? null : (data._links?.next?.href ?? null);
  }

  return { transactions, truncated };
}
