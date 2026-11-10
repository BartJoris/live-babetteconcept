const BRUSSELS_TZ = 'Europe/Brussels';

export type PosDayOrder = {
  timestamp: string;
  total: number;
};

export type PosDayBucket<T extends PosDayOrder> = {
  ymd: string;
  label: string;
  total: number;
  orders: T[];
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdFromParts(parts: Intl.DateTimeFormatPart[]): string {
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/** Calendar YYYY-MM-DD in Europe/Brussels for an absolute instant. */
export function brusselsYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUSSELS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ymdFromParts(parts);
}

export function brusselsTodayYmd(now = new Date()): string {
  return brusselsYmd(now);
}

/**
 * Odoo `date_order` is a naive UTC datetime (`YYYY-MM-DD HH:mm:ss`).
 * Same interpretation as the dashboard (`timestamp + 'Z'`).
 */
export function brusselsYmdFromOdooDateOrder(dateOrder: string): string {
  const trimmed = dateOrder.trim();
  const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const utcIso = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return brusselsYmd(new Date(utcIso));
}

export function isOdooDateOnBrusselsDay(dateOrder: string, ymd: string): boolean {
  return brusselsYmdFromOdooDateOrder(dateOrder) === ymd;
}

export function addCalendarDays(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function dayLabelForYmd(ymd: string, todayYmd: string): string {
  if (ymd === todayYmd) return 'Vandaag';
  if (ymd === addCalendarDays(todayYmd, -1)) return 'Gisteren';
  if (ymd === addCalendarDays(todayYmd, -2)) return 'Eergisteren';
  const [, month, day] = ymd.split('-');
  return `${day}/${month}`;
}

/** Newest calendar day first; orders within a day newest first. */
export function groupOrdersByDay<T extends PosDayOrder>(
  orders: T[],
  todayYmd: string,
): PosDayBucket<T>[] {
  const byDay = new Map<string, T[]>();
  for (const order of orders) {
    const ymd = brusselsYmdFromOdooDateOrder(order.timestamp);
    const list = byDay.get(ymd);
    if (list) list.push(order);
    else byDay.set(ymd, [order]);
  }

  const ymds = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  return ymds.map((ymd) => {
    const dayOrders = byDay.get(ymd) ?? [];
    dayOrders.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return {
      ymd,
      label: dayLabelForYmd(ymd, todayYmd),
      total: dayOrders.reduce((sum, order) => sum + order.total, 0),
      orders: dayOrders,
    };
  });
}
