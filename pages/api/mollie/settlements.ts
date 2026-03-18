import type { NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';

interface MolliePayment {
  id: string;
  mode: string;
  createdAt: string;
  status: string;
  paidAt?: string;
  description: string;
  amount: { currency: string; value: string };
  settlementAmount?: { currency: string; value: string };
  amountRefunded?: { currency: string; value: string };
  method?: string;
  details?: {
    consumerName?: string;
    consumerAccount?: string;
    consumerBic?: string;
    [key: string]: unknown;
  };
  _links?: {
    settlement?: { href: string; type: string };
    [key: string]: unknown;
  };
}

interface MollieListResponse {
  count: number;
  _embedded: { payments: MolliePayment[] };
  _links: {
    next?: { href: string };
    self: { href: string };
  };
}

interface MollieSettlement {
  id: string;
  reference: string;
  createdAt: string;
  settledAt?: string;
  status: string;
  amount: { currency: string; value: string };
  invoiceId?: string;
  periods?: Record<string, Record<string, {
    revenue?: Array<{ description: string; method: string; count: number; amountNet: { currency: string; value: string }; amountVat: { currency: string; value: string }; amountGross: { currency: string; value: string } }>;
    costs?: Array<{ description: string; method: string | null; count: number; amountNet: { currency: string; value: string }; amountVat: { currency: string; value: string }; amountGross: { currency: string; value: string } }>;
  }>>;
}

interface MollieInvoice {
  resource: string;
  id: string;
  reference: string;
}

interface MollieSettlementListResponse {
  count: number;
  _embedded: { settlements: MollieSettlement[] };
  _links: { next?: { href: string }; self: { href: string } };
}

const METHOD_MAP: Record<string, string> = {
  bancontact: 'mistercash',
  ideal: 'ideal',
  creditcard: 'creditcard',
  paypal: 'paypal',
  banktransfer: 'banktransfer',
  directdebit: 'directdebit',
  applepay: 'applepay',
  googlepay: 'googlepay',
  kbc: 'kbc',
  belfius: 'belfius',
  eps: 'eps',
  sofort: 'sofort',
  giftcard: 'giftcard',
  przelewy24: 'przelewy24',
  pointofsale: 'pointofsale',
};

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(' ')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatSettlementDate(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapMethod(method?: string): string {
  if (!method) return '';
  return METHOD_MAP[method] || method;
}

async function fetchMollie(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mollie API ${response.status}: ${text}`);
  }
  return response.json();
}

async function fetchSettlementsForPeriod(
  token: string,
  fromDate: Date,
  toDate: Date
): Promise<MollieSettlement[]> {
  const settlements: MollieSettlement[] = [];
  const fromMonth = fromDate.getUTCMonth() + 1;
  const fromYear = fromDate.getUTCFullYear();
  const toMonth = toDate.getUTCMonth() + 1;
  const toYear = toDate.getUTCFullYear();

  let year = fromYear;
  let month = fromMonth;

  while (year < toYear || (year === toYear && month <= toMonth)) {
    let url: string | null =
      `https://api.mollie.com/v2/settlements?limit=250&year=${year}&month=${month}`;

    while (url) {
      const data: MollieSettlementListResponse = await fetchMollie(url, token);
      for (const s of data._embedded.settlements) {
        if (!settlements.find((existing) => existing.id === s.id)) {
          settlements.push(s);
        }
      }
      url = data._links.next?.href || null;
    }

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return settlements;
}

async function fetchSettlementPayments(
  token: string,
  settlementId: string
): Promise<MolliePayment[]> {
  const payments: MolliePayment[] = [];
  let url: string | null =
    `https://api.mollie.com/v2/settlements/${settlementId}/payments?limit=250`;

  while (url) {
    const data: MollieListResponse = await fetchMollie(url, token);
    payments.push(...data._embedded.payments);
    url = data._links.next?.href || null;
  }

  return payments;
}

async function fetchAllPaidPayments(
  apiKey: string,
  from: Date,
  to: Date
): Promise<MolliePayment[]> {
  const payments: MolliePayment[] = [];
  let url: string | null =
    'https://api.mollie.com/v2/payments?limit=250&sort=desc';

  while (url) {
    const data: MollieListResponse = await fetchMollie(url, apiKey);
    let passedStartDate = false;

    for (const payment of data._embedded.payments) {
      const createdAt = new Date(payment.createdAt);
      if (createdAt < from) {
        passedStartDate = true;
        break;
      }
      if (createdAt <= to && payment.status === 'paid') {
        payments.push(payment);
      }
    }

    if (passedStartDate) break;
    url = data._links.next?.href || null;
  }

  return payments;
}

interface CSVRow {
  datum: string;
  betaalmethode: string;
  valuta: string;
  bedrag: string;
  status: string;
  id: string;
  omschrijving: string;
  naamConsument: string;
  rekeningConsument: string;
  bicConsument: string;
  uitbetalingsvaluta: string;
  uitbetalingsbedrag: string;
  uitbetalingsreferentie: string;
  teruggestortBedrag: string;
}

function buildCSV(rows: CSVRow[]): string {
  const headers = [
    'Datum',
    'Betaalmethode',
    'Valuta',
    'Bedrag',
    'Status',
    'ID',
    'Omschrijving',
    'Naam consument',
    'Rekening consument',
    'BIC consument',
    'Uitbetalingsvaluta',
    'Uitbetalingsbedrag',
    'Uitbetalingsreferentie',
    'Teruggestort bedrag',
  ];

  const csvRows = rows.map((r) =>
    [
      r.datum,
      r.betaalmethode,
      r.valuta,
      r.bedrag,
      r.status,
      r.id,
      r.omschrijving,
      r.naamConsument,
      r.rekeningConsument,
      r.bicConsument,
      r.uitbetalingsvaluta,
      r.uitbetalingsbedrag,
      r.uitbetalingsreferentie,
      r.teruggestortBedrag,
    ]
      .map(escapeCSV)
      .join(',')
  );

  return '\uFEFF' + [headers.map(escapeCSV).join(','), ...csvRows].join('\r\n');
}

function paymentToRow(
  payment: MolliePayment,
  settlementRef: string
): CSVRow {
  const refundedValue = parseFloat(payment.amountRefunded?.value || '0');
  return {
    datum: payment.paidAt ? formatSettlementDate(payment.paidAt) : formatSettlementDate(payment.createdAt),
    betaalmethode: mapMethod(payment.method),
    valuta: payment.amount.currency,
    bedrag: payment.amount.value,
    status: 'paidout',
    id: payment.id,
    omschrijving: payment.description || '',
    naamConsument: payment.details?.consumerName || '',
    rekeningConsument: payment.details?.consumerAccount || '',
    bicConsument: payment.details?.consumerBic || '',
    uitbetalingsvaluta: payment.settlementAmount?.currency || payment.amount.currency,
    uitbetalingsbedrag: payment.settlementAmount?.value || payment.amount.value,
    uitbetalingsreferentie: settlementRef,
    teruggestortBedrag: refundedValue > 0 ? payment.amountRefunded!.value : '',
  };
}

function costToRow(
  cost: NonNullable<NonNullable<MollieSettlement['periods']>[string][string]['costs']>[number],
  settlement: MollieSettlement,
  settledAt: string,
  invoiceReference?: string
): CSVRow {
  const grossValue = parseFloat(cost.amountGross.value);
  const description = invoiceReference
    ? `Withheld fees ${invoiceReference}`
    : `Withheld fees - ${cost.description}`;
  return {
    datum: settledAt,
    betaalmethode: '',
    valuta: cost.amountGross.currency,
    bedrag: (-Math.abs(grossValue)).toFixed(2),
    status: '',
    id: '',
    omschrijving: description,
    naamConsument: '',
    rekeningConsument: '',
    bicConsument: '',
    uitbetalingsvaluta: cost.amountGross.currency,
    uitbetalingsbedrag: (-Math.abs(grossValue)).toFixed(2),
    uitbetalingsreferentie: settlement.reference || settlement.id,
    teruggestortBedrag: '',
  };
}

async function fetchInvoiceReference(
  token: string,
  invoiceId: string
): Promise<string | undefined> {
  try {
    const invoice: MollieInvoice = await fetchMollie(
      `https://api.mollie.com/v2/invoices/${invoiceId}`,
      token
    );
    return invoice.reference;
  } catch {
    return undefined;
  }
}

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  const accessToken = process.env.MOLLIE_ACCESS_TOKEN;

  if (!apiKey && !accessToken) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY of MOLLIE_ACCESS_TOKEN niet geconfigureerd' });
  }

  const { from: fromStr, to: toStr } = req.query;
  if (!fromStr || !toStr || typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return res.status(400).json({ error: 'Parameters "from" en "to" zijn verplicht (YYYY-MM-DD)' });
  }

  const from = new Date(fromStr + 'T00:00:00.000Z');
  const to = new Date(toStr + 'T23:59:59.999Z');

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Ongeldige datumnotatie.' });
  }

  try {
    let csvRows: CSVRow[] = [];
    let approach = 'settlements';
    let settlementError = '';

    // Prefer access token for settlements (requires settlements.read scope)
    const settlementToken = accessToken || apiKey!;

    try {
      const settlements = await fetchSettlementsForPeriod(settlementToken, from, to);

      for (const settlement of settlements) {
        const payments = await fetchSettlementPayments(settlementToken, settlement.id);
        const ref = settlement.reference || settlement.id;

        for (const payment of payments) {
          csvRows.push(paymentToRow(payment, ref));
        }

        if (settlement.periods) {
          const settledAt = settlement.settledAt
            ? formatSettlementDate(settlement.settledAt)
            : formatSettlementDate(settlement.createdAt);

          let invoiceRef: string | undefined;
          if (settlement.invoiceId) {
            invoiceRef = await fetchInvoiceReference(settlementToken, settlement.invoiceId);
          }

          for (const yearKey of Object.keys(settlement.periods)) {
            for (const monthKey of Object.keys(settlement.periods[yearKey])) {
              const period = settlement.periods[yearKey][monthKey];
              if (period.costs) {
                for (const cost of period.costs) {
                  csvRows.push(costToRow(cost, settlement, settledAt, invoiceRef));
                }
              }
            }
          }
        }
      }
    } catch (err) {
      approach = 'payments';
      settlementError = err instanceof Error ? err.message : 'Onbekende fout';
      console.warn('Settlements API niet beschikbaar, fallback naar Payments API:', settlementError);
      csvRows = [];

      const payments = await fetchAllPaidPayments(apiKey!, from, to);

      for (const payment of payments) {
        csvRows.push(paymentToRow(payment, ''));
      }
    }

    csvRows.sort((a, b) => b.datum.localeCompare(a.datum));

    const csv = buildCSV(csvRows);
    const filename = `mollie-settlements-${fromStr}-tot-${toStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Transaction-Count', String(csvRows.length));
    res.setHeader('X-Approach', approach);
    if (settlementError) {
      res.setHeader('X-Settlement-Error', 'true');
    }
    res.status(200).send(csv);
  } catch (error) {
    console.error('Mollie settlements export error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    res.status(500).json({ error: `Fout bij ophalen settlements: ${message}` });
  }
});
