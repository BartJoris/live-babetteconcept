import type { PosOrderLineRow, PosOrderRow } from '@/lib/posSalesForRange';

export type YearlyCompareMonthRow = {
  omzet: number;
  marge?: number;
};

export type MonthlyComparePeriodRow = {
  omzet: number[];
  marge?: number[];
  days: number;
};

export type DailySalesRow = {
  date: string;
  total_amount: number;
  order_count: number;
  margin?: number;
  morning_amount: number;
  afternoon_amount: number;
  morning_orders: number;
  afternoon_orders: number;
  morning_margin?: number;
  afternoon_margin?: number;
};

export type MonthlyInsights = {
  total_revenue: number;
  total_orders: number;
  average_daily_revenue: number;
  average_order_value: number;
  daily_sales: DailySalesRow[];
  total_morning_revenue: number;
  total_afternoon_revenue: number;
  total_morning_orders: number;
  total_afternoon_orders: number;
};

function getTimeSlot(dateTimeStr: string): 'morning' | 'afternoon' | 'other' {
  const timeStr = dateTimeStr.includes(' ') ? dateTimeStr.split(' ')[1] : '12:00:00';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  const morningStart = 9 * 60;
  const morningEnd = 13 * 60;
  const afternoonEnd = 19 * 60;

  if (totalMinutes >= morningStart && totalMinutes < morningEnd) {
    return 'morning';
  }
  if (totalMinutes >= morningEnd && totalMinutes < afternoonEnd) {
    return 'afternoon';
  }
  return 'other';
}

export function aggregateYearlyCompare(
  orders: PosOrderRow[],
  lines: PosOrderLineRow[],
): { monthly: Record<string, YearlyCompareMonthRow>; marginAvailable: boolean } {
  const orderIdToDate: Record<number, string> = {};
  orders.forEach((order) => {
    orderIdToDate[order.id] = order.date_order;
  });

  const monthly: Record<string, { omzet: number; marge: number }> = {};
  let marginAvailable = false;

  for (const order of orders) {
    const dateStr = order.date_order;
    const month = dateStr.slice(5, 7);
    if (!monthly[month]) {
      monthly[month] = { omzet: 0, marge: 0 };
    }
    monthly[month].omzet += order.amount_total ?? 0;
  }

  for (const line of lines) {
    const orderId = line.order_id?.[0];
    const dateStr = orderIdToDate[orderId];
    if (!dateStr) continue;

    const month = dateStr.slice(5, 7);
    if (!monthly[month]) {
      monthly[month] = { omzet: 0, marge: 0 };
    }
    if (typeof line.margin === 'number') {
      marginAvailable = true;
      monthly[month].marge += line.margin;
    }
  }

  const out: Record<string, YearlyCompareMonthRow> = {};
  for (const [m, v] of Object.entries(monthly)) {
    out[m] = marginAvailable ? { omzet: v.omzet, marge: v.marge } : { omzet: v.omzet };
  }

  return { monthly: out, marginAvailable };
}

export function aggregateMonthlyDaily(
  orders: PosOrderRow[],
  lines: PosOrderLineRow[],
  year: number,
  month: number,
): MonthlyComparePeriodRow & { marginAvailable: boolean } {
  const days = new Date(year, month, 0).getDate();
  const orderIdToDate: Record<number, string> = {};
  orders.forEach((order) => {
    orderIdToDate[order.id] = order.date_order;
  });

  const omzet = Array<number>(days).fill(0);
  const marge = Array<number>(days).fill(0);
  let marginFound = false;

  for (const order of orders) {
    const dateStr = order.date_order;
    const y = parseInt(dateStr.slice(0, 4), 10);
    const m = parseInt(dateStr.slice(5, 7), 10);
    if (y !== year || m !== month) continue;
    const day = parseInt(dateStr.slice(8, 10), 10) - 1;
    if (day < 0 || day >= days) continue;
    omzet[day] += order.amount_total ?? 0;
  }

  for (const line of lines) {
    const orderId = line.order_id?.[0];
    const dateStr = orderIdToDate[orderId];
    if (!dateStr) continue;

    const day = parseInt(dateStr.slice(8, 10), 10) - 1;
    if (day < 0 || day >= days) continue;

    if (typeof line.margin === 'number') {
      marginFound = true;
      marge[day] += line.margin;
    }
  }

  return {
    omzet,
    days,
    marginAvailable: marginFound,
    ...(marginFound ? { marge } : {}),
  };
}

function datePartFromDateOrder(dateTimeStr: string): string {
  if (dateTimeStr.includes('T')) {
    return dateTimeStr.split('T')[0];
  }
  if (dateTimeStr.includes(' ')) {
    return dateTimeStr.split(' ')[0];
  }
  return dateTimeStr;
}

export function buildMonthlyInsights(
  orders: PosOrderRow[],
  lines: PosOrderLineRow[],
): { insights: MonthlyInsights; marginAvailable: boolean } | { error: string } {
  if (orders.length > 0 && typeof orders[0].amount_total !== 'number') {
    return {
      error:
        'Het veld amount_total is niet beschikbaar op pos.order. Vraag je Odoo-beheerder om dit veld te controleren.',
    };
  }

  const orderIdToDateTime: Record<number, string> = {};
  orders.forEach((order) => {
    orderIdToDateTime[order.id] = order.date_order;
  });

  const dailyData: Record<
    string,
    {
      total: number;
      orderIds: Set<number>;
      margin?: number;
      morning: { total: number; orderIds: Set<number>; margin?: number };
      afternoon: { total: number; orderIds: Set<number>; margin?: number };
    }
  > = {};

  let marginAvailable = false;

  for (const order of orders) {
    const dateTimeStr = order.date_order;
    const datePart = datePartFromDateOrder(dateTimeStr);

    if (!dailyData[datePart]) {
      dailyData[datePart] = {
        total: 0,
        orderIds: new Set(),
        margin: 0,
        morning: { total: 0, orderIds: new Set(), margin: 0 },
        afternoon: { total: 0, orderIds: new Set(), margin: 0 },
      };
    }

    const amount = order.amount_total ?? 0;
    dailyData[datePart].total += amount;
    dailyData[datePart].orderIds.add(order.id);

    const timeSlot = getTimeSlot(dateTimeStr);
    if (timeSlot === 'morning') {
      dailyData[datePart].morning.total += amount;
      dailyData[datePart].morning.orderIds.add(order.id);
    } else if (timeSlot === 'afternoon') {
      dailyData[datePart].afternoon.total += amount;
      dailyData[datePart].afternoon.orderIds.add(order.id);
    } else {
      dailyData[datePart].morning.total += amount;
      dailyData[datePart].morning.orderIds.add(order.id);
    }
  }

  for (const line of lines) {
    const orderId = line.order_id?.[0];
    const dateTimeStr = orderIdToDateTime[orderId];
    if (!dateTimeStr) continue;

    const datePart = datePartFromDateOrder(dateTimeStr);

    if (!dailyData[datePart]) {
      dailyData[datePart] = {
        total: 0,
        orderIds: new Set(),
        margin: 0,
        morning: { total: 0, orderIds: new Set(), margin: 0 },
        afternoon: { total: 0, orderIds: new Set(), margin: 0 },
      };
    }

    const marginVal = line.margin ?? 0;
    if (typeof line.margin === 'number') {
      marginAvailable = true;
      dailyData[datePart].margin = (dailyData[datePart].margin ?? 0) + marginVal;
    }

    const timeSlot = getTimeSlot(dateTimeStr);
    if (timeSlot === 'morning') {
      if (typeof line.margin === 'number') {
        dailyData[datePart].morning.margin =
          (dailyData[datePart].morning.margin ?? 0) + marginVal;
      }
    } else if (timeSlot === 'afternoon') {
      if (typeof line.margin === 'number') {
        dailyData[datePart].afternoon.margin =
          (dailyData[datePart].afternoon.margin ?? 0) + marginVal;
      }
    } else {
      if (typeof line.margin === 'number') {
        dailyData[datePart].morning.margin =
          (dailyData[datePart].morning.margin ?? 0) + marginVal;
      }
    }
  }

  const dailySales: DailySalesRow[] = Object.entries(dailyData)
    .map(([date, data]) => ({
      date,
      total_amount: data.total,
      order_count: data.orderIds.size,
      morning_amount: data.morning.total,
      afternoon_amount: data.afternoon.total,
      morning_orders: data.morning.orderIds.size,
      afternoon_orders: data.afternoon.orderIds.size,
      ...(marginAvailable && typeof data.margin === 'number' ? { margin: data.margin } : {}),
      ...(marginAvailable && typeof data.morning.margin === 'number'
        ? { morning_margin: data.morning.margin }
        : {}),
      ...(marginAvailable && typeof data.afternoon.margin === 'number'
        ? { afternoon_margin: data.afternoon.margin }
        : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalRevenue = dailySales.reduce((sum, day) => sum + day.total_amount, 0);
  const totalOrders = dailySales.reduce((sum, day) => sum + day.order_count, 0);
  const totalMorningRevenue = dailySales.reduce((sum, day) => sum + day.morning_amount, 0);
  const totalAfternoonRevenue = dailySales.reduce((sum, day) => sum + day.afternoon_amount, 0);
  const totalMorningOrders = dailySales.reduce((sum, day) => sum + day.morning_orders, 0);
  const totalAfternoonOrders = dailySales.reduce((sum, day) => sum + day.afternoon_orders, 0);
  const averageDailyRevenue = dailySales.length > 0 ? totalRevenue / dailySales.length : 0;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return {
    insights: {
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      average_daily_revenue: averageDailyRevenue,
      average_order_value: averageOrderValue,
      daily_sales: dailySales,
      total_morning_revenue: totalMorningRevenue,
      total_afternoon_revenue: totalAfternoonRevenue,
      total_morning_orders: totalMorningOrders,
      total_afternoon_orders: totalAfternoonOrders,
    },
    marginAvailable,
  };
}
