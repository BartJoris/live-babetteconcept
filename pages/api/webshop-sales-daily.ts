import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

const ORDER_PAGE_SIZE = 5000;
const ORDER_ID_IN_CHUNK = 2000;
const LINE_PAGE_SIZE = 5000;

const bodySchema = z.object({
  years: z.array(z.number().int()).min(1),
});

type SaleOrder = {
  id: number;
  date_order: string;
  amount_total: number;
};

type SaleOrderLine = {
  id: number;
  order_id: [number, string];
  margin?: number;
};

export type WebshopDailyRow = {
  omzet: number;
  marge: number;
};

function datePartFromDateOrder(dateTimeStr: string): string {
  if (dateTimeStr.includes('T')) return dateTimeStr.split('T')[0];
  if (dateTimeStr.includes(' ')) return dateTimeStr.split(' ')[0];
  return dateTimeStr;
}

async function fetchWebshopOrdersForYear(
  uid: number,
  password: string,
  year: number,
): Promise<SaleOrder[]> {
  const start = `${year}-01-01 00:00:00`;
  const end = `${year}-12-31 23:59:59`;
  const domain: unknown[] = [
    ['date_order', '>=', start],
    ['date_order', '<=', end],
    ['website_id', '!=', false],
    ['state', 'in', ['sale', 'done']],
  ];

  const all: SaleOrder[] = [];
  let offset = 0;
  while (true) {
    const batch = await odooClient.searchRead<SaleOrder>(
      uid,
      password,
      'sale.order',
      domain,
      ['id', 'date_order', 'amount_total'],
      ORDER_PAGE_SIZE,
      offset,
    );
    all.push(...batch);
    if (batch.length < ORDER_PAGE_SIZE) break;
    offset += ORDER_PAGE_SIZE;
  }
  return all;
}

async function fetchSaleOrderLinesWithFields(
  uid: number,
  password: string,
  orderIds: number[],
  fields: string[],
): Promise<SaleOrderLine[]> {
  const all: SaleOrderLine[] = [];

  for (let i = 0; i < orderIds.length; i += ORDER_ID_IN_CHUNK) {
    const chunk = orderIds.slice(i, i + ORDER_ID_IN_CHUNK);
    let offset = 0;
    while (true) {
      const batch = await odooClient.searchRead<SaleOrderLine>(
        uid,
        password,
        'sale.order.line',
        [['order_id', 'in', chunk]],
        fields,
        LINE_PAGE_SIZE,
        offset,
      );
      all.push(...batch);
      if (batch.length < LINE_PAGE_SIZE) break;
      offset += LINE_PAGE_SIZE;
    }
  }

  return all;
}

async function fetchSaleOrderLines(
  uid: number,
  password: string,
  orderIds: number[],
): Promise<{ lines: SaleOrderLine[]; marginAvailable: boolean }> {
  if (orderIds.length === 0) return { lines: [], marginAvailable: false };

  try {
    const lines = await fetchSaleOrderLinesWithFields(uid, password, orderIds, [
      'id',
      'order_id',
      'margin',
    ]);
    const marginAvailable = lines.some((line) => typeof line.margin === 'number');
    return { lines, marginAvailable };
  } catch (error) {
    // sale.order.line.margin ontbreekt soms; omzet blijft bruikbaar zonder winst.
    console.warn('webshop-sales-daily: margin field unavailable, continuing without marge', error);
    return { lines: [], marginAvailable: false };
  }
}

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { years } = parsed.data;
  const { uid, password } = req.session.user!;

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const daily: Record<string, WebshopDailyRow> = {};
    let marginAvailable = false;

    for (const year of years) {
      const orders = await fetchWebshopOrdersForYear(uid, password, year);
      const orderIdToDate: Record<number, string> = {};

      for (const order of orders) {
        const datePart = datePartFromDateOrder(order.date_order);
        orderIdToDate[order.id] = datePart;
        if (!daily[datePart]) daily[datePart] = { omzet: 0, marge: 0 };
        daily[datePart].omzet += order.amount_total ?? 0;
      }

      const { lines, marginAvailable: ma } = await fetchSaleOrderLines(
        uid,
        password,
        orders.map((o) => o.id),
      );
      if (ma) marginAvailable = true;

      for (const line of lines) {
        const orderId = line.order_id?.[0];
        const datePart = orderIdToDate[orderId];
        if (!datePart || typeof line.margin !== 'number') continue;
        if (!daily[datePart]) daily[datePart] = { omzet: 0, marge: 0 };
        daily[datePart].marge += line.margin;
      }
    }

    return res.status(200).json({ daily, marginAvailable });
  } catch (error) {
    console.error('webshop-sales-daily error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to load webshop daily sales', message });
  }
});
