/**
 * Mollie settlement CSV export — klassiek (`format` weggelaten of `classic`), volledige Odoo (`format=odoo`),
 * of compacte bankregels (`format=odoo_bank` of `odoo-bank`).
 *
 * Odoo 19.1: import via Boekhouding → Bank; of rechtstreeks via `POST /api/mollie/import-odoo`.
 */
import { withAuth } from '@/lib/middleware/withAuth';
import {
  escapeCSV,
  fetchInvoiceReference,
  fetchSettlementsForPeriod,
  fetchSettlementPayments,
  fetchAllPaidPayments,
  collectSettlementOdooRows,
  buildCSVOdoo,
  buildCSVOdooBank,
  type MolliePayment,
  type MollieSettlement,
} from '@/lib/mollieSettlementShared';

/** Klassieke export: dashboard-achtige labels (o.a. bancontact → mistercash). */
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

function formatSettlementDate(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapMethod(method?: string): string {
  if (!method) return '';
  return METHOD_MAP[method] || method;
}

/** 13 kolommen — zelfde leveringspatroon als vóór de API-ruwe export. */
interface CSVRowClassic {
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

function buildCSVClassic(rows: CSVRowClassic[]): string {
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

function paymentToRowClassic(payment: MolliePayment, settlementRef: string): CSVRowClassic {
  const refundedValue = parseFloat(payment.amountRefunded?.value || '0');
  return {
    datum: payment.paidAt
      ? formatSettlementDate(payment.paidAt)
      : formatSettlementDate(payment.createdAt),
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

function costToRowClassic(
  cost: NonNullable<NonNullable<MollieSettlement['periods']>[string][string]['costs']>[number],
  settlement: MollieSettlement,
  settledAtFormatted: string,
  invoiceReference?: string
): CSVRowClassic {
  const grossValue = parseFloat(cost.amountGross.value);
  const description = invoiceReference
    ? `Withheld fees ${invoiceReference}`
    : `Withheld fees - ${cost.description}`;
  return {
    datum: settledAtFormatted,
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

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  const accessToken = process.env.MOLLIE_ACCESS_TOKEN;

  if (!apiKey && !accessToken) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY of MOLLIE_ACCESS_TOKEN niet geconfigureerd' });
  }

  const { from: fromStr, to: toStr, format: formatParam } = req.query;
  if (!fromStr || !toStr || typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return res.status(400).json({ error: 'Parameters "from" en "to" zijn verplicht (YYYY-MM-DD)' });
  }

  const fmt =
    typeof formatParam === 'string' ? formatParam.toLowerCase().replace(/-/g, '_') : '';
  const isOdooDetail = fmt === 'odoo' || fmt === 'extended';
  const isOdooBank = fmt === 'odoo_bank';
  const needsOdooRows = isOdooDetail || isOdooBank;

  const from = new Date(fromStr + 'T00:00:00.000Z');
  const to = new Date(toStr + 'T23:59:59.999Z');

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Ongeldige datumnotatie.' });
  }

  try {
    let csvRowsClassic: CSVRowClassic[] = [];
    let approach = 'settlements';
    let settlementError = '';

    const settlementToken = accessToken || apiKey!;

    if (needsOdooRows) {
      const { rows, approach: ap, settlementError: se } = await collectSettlementOdooRows({
        apiKey: apiKey!,
        accessToken,
        from,
        to,
      });
      approach = ap;
      settlementError = se;

      const csv = isOdooBank ? buildCSVOdooBank(rows) : buildCSVOdoo(rows);
      const filename = isOdooBank
        ? `mollie-settlements-${fromStr}-tot-${toStr}-odoo-bank.csv`
        : `mollie-settlements-${fromStr}-tot-${toStr}-odoo.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Transaction-Count', String(rows.length));
      res.setHeader('X-Approach', approach);
      res.setHeader('X-Export-Format', isOdooBank ? 'odoo_bank' : 'odoo');
      if (settlementError) {
        res.setHeader('X-Settlement-Error', 'true');
      }
      res.status(200).send(csv);
      return;
    }

    try {
      const settlements = await fetchSettlementsForPeriod(settlementToken, from, to);

      for (const settlement of settlements) {
        const payments = await fetchSettlementPayments(settlementToken, settlement.id);
        const ref = settlement.reference || settlement.id;

        for (const payment of payments) {
          csvRowsClassic.push(paymentToRowClassic(payment, ref));
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
                  csvRowsClassic.push(costToRowClassic(cost, settlement, settledAt, invoiceRef));
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

      const payments = await fetchAllPaidPayments(apiKey!, from, to);
      csvRowsClassic = [];
      for (const payment of payments) {
        csvRowsClassic.push(paymentToRowClassic(payment, ''));
      }
    }

    csvRowsClassic.sort((a, b) => b.datum.localeCompare(a.datum));
    const csv = buildCSVClassic(csvRowsClassic);
    const filename = `mollie-settlements-${fromStr}-tot-${toStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Transaction-Count', String(csvRowsClassic.length));
    res.setHeader('X-Approach', approach);
    res.setHeader('X-Export-Format', 'classic');
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
