import { odooClient } from '@/lib/odooClient';

const ORDER_PAGE_SIZE = 5000;
const ORDER_ID_IN_CHUNK = 2000;
const LINE_PAGE_SIZE = 5000;

export type PosOrderRow = {
  id: number;
  date_order: string;
};

export type PosOrderLineRow = {
  id: number;
  margin?: number;
  order_id: [number, string];
  price_subtotal_incl?: number;
};

function toStartDateTime(dateYmd: string): string {
  return dateYmd.includes(' ') ? dateYmd : `${dateYmd} 00:00:00`;
}

function toEndDateTime(dateYmd: string): string {
  if (dateYmd.includes(' ')) return dateYmd;
  return `${dateYmd} 23:59:59`;
}

const DEFAULT_ORDER_FIELDS = ['id', 'date_order'] as const;

export async function fetchPosOrdersInDateRange<T extends Record<string, unknown> = PosOrderRow>(
  uid: number,
  password: string,
  startDateYmd: string,
  endDateYmd: string,
  orderFields: string[] = [...DEFAULT_ORDER_FIELDS],
): Promise<T[]> {
  const start = toStartDateTime(startDateYmd);
  const end = toEndDateTime(endDateYmd);
  const domain: unknown[] = [['date_order', '>=', start], ['date_order', '<=', end]];
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const batch = await odooClient.searchRead<T>(
      uid,
      password,
      'pos.order',
      domain,
      orderFields,
      ORDER_PAGE_SIZE,
      offset,
    );
    all.push(...batch);
    if (batch.length < ORDER_PAGE_SIZE) break;
    offset += ORDER_PAGE_SIZE;
  }

  return all;
}

const DEFAULT_LINE_FIELDS = ['id', 'margin', 'order_id', 'price_subtotal_incl'] as const;

export type FetchPosOrdersAndLinesOptions = {
  orderFields?: string[];
  lineFields?: string[];
};

export async function fetchPosLinesForOrderIds<T extends Record<string, unknown> = PosOrderLineRow>(
  uid: number,
  password: string,
  orderIds: number[],
  fields: string[] = [...DEFAULT_LINE_FIELDS],
): Promise<T[]> {
  if (orderIds.length === 0) return [];

  const all: T[] = [];

  for (let i = 0; i < orderIds.length; i += ORDER_ID_IN_CHUNK) {
    const chunk = orderIds.slice(i, i + ORDER_ID_IN_CHUNK);
    let offset = 0;

    while (true) {
      const batch = await odooClient.searchRead<T>(
        uid,
        password,
        'pos.order.line',
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

export async function fetchPosOrdersAndLinesForDateRange<
  TLine extends Record<string, unknown> = PosOrderLineRow,
  TOrder extends Record<string, unknown> = PosOrderRow,
>(
  uid: number,
  password: string,
  startDateYmd: string,
  endDateYmd: string,
  options?: FetchPosOrdersAndLinesOptions,
): Promise<{ orders: TOrder[]; lines: TLine[] }> {
  const orderFields = options?.orderFields ?? [...DEFAULT_ORDER_FIELDS];
  const lineFields = options?.lineFields ?? [...DEFAULT_LINE_FIELDS];
  const orders = await fetchPosOrdersInDateRange<TOrder>(uid, password, startDateYmd, endDateYmd, orderFields);
  const orderIds = orders.map((o) => o.id as number);
  const lines = await fetchPosLinesForOrderIds<TLine>(uid, password, orderIds, lineFields);
  return { orders, lines };
}
