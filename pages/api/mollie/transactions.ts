import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';

interface MolliePayment {
  id: string;
  mode: string;
  createdAt: string;
  status: string;
  description: string;
  amount: { currency: string; value: string };
  amountRefunded?: { currency: string; value: string };
  amountCaptured?: { currency: string; value: string };
  method?: string;
  metadata?: Record<string, unknown>;
  profileId: string;
  settlementAmount?: { currency: string; value: string };
  orderId?: string;
  customerId?: string;
  paidAt?: string;
  canceledAt?: string;
  expiredAt?: string;
  failedAt?: string;
}

interface MollieListResponse {
  count: number;
  _embedded: { payments: MolliePayment[] };
  _links: {
    next?: { href: string };
    previous?: { href: string };
    self: { href: string };
  };
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatPaymentsAsCSV(payments: MolliePayment[]): string {
  const headers = [
    'ID',
    'Datum',
    'Betaald op',
    'Status',
    'Beschrijving',
    'Bedrag',
    'Valuta',
    'Terugbetaald',
    'Betaalmethode',
    'Order ID',
    'Klant ID',
    'Modus',
  ];

  const rows = payments.map((p) => [
    p.id,
    p.createdAt,
    p.paidAt || '',
    p.status,
    p.description || '',
    p.amount.value,
    p.amount.currency,
    p.amountRefunded?.value || '0.00',
    p.method || '',
    p.orderId || '',
    p.customerId || '',
    p.mode,
  ]);

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return '\uFEFF' + csvLines.join('\r\n');
}

async function fetchAllPayments(
  apiKey: string,
  from: Date,
  to: Date,
  statusFilter?: string
): Promise<MolliePayment[]> {
  const payments: MolliePayment[] = [];
  let url: string | null =
    'https://api.mollie.com/v2/payments?limit=250&sort=desc';

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mollie API error ${response.status}: ${errorText}`
      );
    }

    const data: MollieListResponse = await response.json();
    let passedStartDate = false;

    for (const payment of data._embedded.payments) {
      const createdAt = new Date(payment.createdAt);

      if (createdAt < from) {
        passedStartDate = true;
        break;
      }

      if (createdAt <= to) {
        if (!statusFilter || payment.status === statusFilter) {
          payments.push(payment);
        }
      }
    }

    if (passedStartDate) break;

    url = data._links.next?.href || null;
  }

  return payments;
}

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY niet geconfigureerd' });
  }

  const { from: fromStr, to: toStr, status: statusFilter } = req.query;

  if (!fromStr || !toStr || typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return res.status(400).json({ error: 'Parameters "from" en "to" zijn verplicht (YYYY-MM-DD)' });
  }

  const from = new Date(fromStr + 'T00:00:00.000Z');
  const to = new Date(toStr + 'T23:59:59.999Z');

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Ongeldige datumnotatie. Gebruik YYYY-MM-DD.' });
  }

  if (from > to) {
    return res.status(400).json({ error: 'Startdatum moet voor einddatum liggen.' });
  }

  const isTestKey = apiKey.startsWith('test_');

  try {
    const payments = await fetchAllPayments(
      apiKey, from, to,
      typeof statusFilter === 'string' ? statusFilter : undefined
    );

    const csv = formatPaymentsAsCSV(payments);
    const filename = `mollie-transacties-${fromStr}-tot-${toStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Transaction-Count', String(payments.length));
    res.setHeader('X-Is-Test-Mode', String(isTestKey));
    res.status(200).send(csv);
  } catch (error) {
    console.error('Mollie export error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    res.status(500).json({ error: `Fout bij ophalen transacties: ${message}` });
  }
});
