import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

const ODOO_URL = process.env.ODOO_URL || 'https://babette.odoo.com/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babette';

type MonthData = {
  revenue: number;
  orders: number;
  items: number;
  avgOrderValue: number;
};

type YearlyData = {
  [month: string]: MonthData;
};

type EcommerceData = {
  [year: string]: YearlyData;
};

type TopProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

type CustomerInsight = {
  total_customers: number;
  new_customers: number;
  returning_customers: number;
  avg_orders_per_customer: number;
};

type PaymentMethod = {
  name: string;
  count: number;
  total: number;
};

type Website = {
  id: number;
  name: string;
};

type CancelledOrder = {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  partner_name: string | null;
  products: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
};

type ReturnInsight = {
  total_cancelled: number;
  total_cancelled_revenue: number;
  return_rate: number;
  monthly_returns: Record<string, { count: number; revenue: number }>;
  cancelled_orders: CancelledOrder[];
  top_returned_products: Array<{ name: string; count: number; total_quantity: number }>;
};

type InsightsData = {
  compareData: EcommerceData;
  topProducts: TopProduct[];
  customerInsights: CustomerInsight;
  paymentMethods: PaymentMethod[];
  yearlyGrowth: Record<string, number>;
  websites: Website[];
  returnInsights: ReturnInsight;
};

async function odooCall<T>(params: {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}): Promise<T> {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [
        ODOO_DB,
        params.uid,
        params.password,
        params.model,
        params.method,
        params.args,
        params.kwargs || {},
      ],
    },
    id: Date.now(),
  };

  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  
  if (json.error) {
    throw new Error(json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<InsightsData | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { years, websiteId } = req.body;
  const { uid, password } = req.session.user || {};

  if (!uid || !password || !years || !Array.isArray(years)) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // First, fetch all available websites
    const websites = await odooCall<Website[]>({
      uid,
      password,
      model: 'website',
      method: 'search_read',
      args: [[]],
      kwargs: {
        fields: ['id', 'name'],
        limit: 100,
      },
    });

    const compareData: EcommerceData = {};
    const productSales: Record<string, { quantity: number; revenue: number }> = {};
    const customerOrderCounts: Record<number, number> = {};
    const paymentMethodData: Record<string, { count: number; total: number }> = {};
    
    let totalCustomers = 0;
    let newCustomers = 0;
    let returningCustomers = 0;
    let totalCancelled = 0;
    let totalCancelledRevenue = 0;
    const monthlyReturns: Record<string, { count: number; revenue: number }> = {};
    const allCancelledOrders: CancelledOrder[] = [];
    const returnedProductCounts: Record<string, { count: number; total_quantity: number }> = {};

    // Fetch data for each year
    for (const year of years) {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31 23:59:59`;

      // Build domain filter
      const orderDomain: any[] = [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
        ['website_id', '!=', false], // Only ecommerce orders
      ];

      // Add website filter if specified
      if (websiteId && websiteId !== 'all') {
        orderDomain.push(['website_id', '=', parseInt(websiteId)]);
      }

      // Fetch all ecommerce orders for the year (including cancelled for return analysis)
      const allOrders = await odooCall<{
        id: number;
        name: string;
        date_order: string;
        amount_total: number;
        partner_id: [number, string] | false;
        payment_term_id: [number, string] | false;
        state: string;
        website_id: [number, string] | false;
      }[]>({
        uid,
        password,
        model: 'sale.order',
        method: 'search_read',
        args: [orderDomain],
        kwargs: {
          fields: ['id', 'name', 'date_order', 'amount_total', 'partner_id', 'payment_term_id', 'state', 'website_id'],
          limit: 50000,
        },
      });

      // Separate confirmed and cancelled orders
      const orders = allOrders.filter(o => ['sale', 'done'].includes(o.state));
      const cancelledOrders = allOrders.filter(o => o.state === 'cancel');

      if (orders.length === 0) {
        compareData[year] = {};
        continue;
      }

      const orderIds = orders.map(o => o.id);

      // Fetch order lines for these orders
      const orderLines = await odooCall<{
        id: number;
        order_id: [number, string];
        product_id: [number, string] | false;
        product_uom_qty: number;
        price_subtotal: number;
        price_total: number;
      }[]>({
        uid,
        password,
        model: 'sale.order.line',
        method: 'search_read',
        args: [
          [['order_id', 'in', orderIds]],
        ],
        kwargs: {
          fields: ['id', 'order_id', 'product_id', 'product_uom_qty', 'price_subtotal', 'price_total'],
          limit: 100000,
        },
      });

      // Build order lookup
      const orderLookup: Record<number, typeof orders[0]> = {};
      orders.forEach(order => {
        orderLookup[order.id] = order;
      });

      // Group by month
      const monthly: YearlyData = {};
      const monthlyOrders: Record<string, number> = {};
      const monthlyItems: Record<string, number> = {};

      orders.forEach(order => {
        const month = order.date_order.slice(5, 7); // Extract MM from YYYY-MM-DD
        
        if (!monthly[month]) {
          monthly[month] = { revenue: 0, orders: 0, items: 0, avgOrderValue: 0 };
          monthlyOrders[month] = 0;
          monthlyItems[month] = 0;
        }

        monthly[month].revenue += order.amount_total;
        monthlyOrders[month]++;

        // Track customers
        if (order.partner_id && typeof order.partner_id !== 'boolean') {
          const customerId = order.partner_id[0];
          customerOrderCounts[customerId] = (customerOrderCounts[customerId] || 0) + 1;
        }

        // Track payment methods
        const paymentMethod = order.payment_term_id && typeof order.payment_term_id !== 'boolean' 
          ? order.payment_term_id[1] 
          : 'Onbekend';
        
        if (!paymentMethodData[paymentMethod]) {
          paymentMethodData[paymentMethod] = { count: 0, total: 0 };
        }
        paymentMethodData[paymentMethod].count++;
        paymentMethodData[paymentMethod].total += order.amount_total;
      });

      // Process order lines
      orderLines.forEach(line => {
        const order = orderLookup[line.order_id[0]];
        if (!order) return;

        const month = order.date_order.slice(5, 7);
        if (monthlyItems[month] !== undefined) {
          monthlyItems[month] += line.product_uom_qty;
        }

        // Track product sales
        if (line.product_id && typeof line.product_id !== 'boolean') {
          const productName = line.product_id[1];
          if (!productSales[productName]) {
            productSales[productName] = { quantity: 0, revenue: 0 };
          }
          productSales[productName].quantity += line.product_uom_qty;
          productSales[productName].revenue += line.price_total;
        }
      });

      // Calculate averages
      Object.keys(monthly).forEach(month => {
        monthly[month].orders = monthlyOrders[month];
        monthly[month].items = monthlyItems[month];
        monthly[month].avgOrderValue = monthly[month].orders > 0 
          ? monthly[month].revenue / monthly[month].orders 
          : 0;
      });

      compareData[year] = monthly;

      // Track cancelled orders and fetch their line items
      if (cancelledOrders.length > 0) {
        const cancelledOrderIds = cancelledOrders.map(o => o.id);
        
        // Fetch order lines for cancelled orders
        const cancelledOrderLines = await odooCall<{
          id: number;
          order_id: [number, string];
          product_id: [number, string] | false;
          product_uom_qty: number;
          price_total: number;
        }[]>({
          uid,
          password,
          model: 'sale.order.line',
          method: 'search_read',
          args: [
            [['order_id', 'in', cancelledOrderIds]],
          ],
          kwargs: {
            fields: ['id', 'order_id', 'product_id', 'product_uom_qty', 'price_total'],
            limit: 50000,
          },
        });

        // Group lines by order
        const linesByOrder: Record<number, typeof cancelledOrderLines> = {};
        cancelledOrderLines.forEach(line => {
          const orderId = line.order_id[0];
          if (!linesByOrder[orderId]) {
            linesByOrder[orderId] = [];
          }
          linesByOrder[orderId].push(line);
          
          // Track returned products
          if (line.product_id && typeof line.product_id !== 'boolean') {
            const productName = line.product_id[1];
            if (!returnedProductCounts[productName]) {
              returnedProductCounts[productName] = { count: 0, total_quantity: 0 };
            }
            returnedProductCounts[productName].count++;
            returnedProductCounts[productName].total_quantity += line.product_uom_qty;
          }
        });

        cancelledOrders.forEach(order => {
          const month = order.date_order.slice(5, 7);
          const yearMonth = `${year}-${month}`;
          
          if (!monthlyReturns[yearMonth]) {
            monthlyReturns[yearMonth] = { count: 0, revenue: 0 };
          }
          
          monthlyReturns[yearMonth].count++;
          monthlyReturns[yearMonth].revenue += order.amount_total;
          totalCancelled++;
          totalCancelledRevenue += order.amount_total;

          // Build cancelled order detail
          const orderLines = linesByOrder[order.id] || [];
          allCancelledOrders.push({
            id: order.id,
            name: order.name,
            date_order: order.date_order,
            amount_total: order.amount_total,
            partner_name: order.partner_id && typeof order.partner_id !== 'boolean' ? order.partner_id[1] : null,
            products: orderLines.map(line => ({
              name: line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[1] : 'Onbekend product',
              quantity: line.product_uom_qty,
              price: line.price_total,
            })),
          });
        });
      }
    }

    // Calculate customer insights
    totalCustomers = Object.keys(customerOrderCounts).length;
    newCustomers = Object.values(customerOrderCounts).filter(count => count === 1).length;
    returningCustomers = totalCustomers - newCustomers;
    const avgOrdersPerCustomer = totalCustomers > 0 
      ? Object.values(customerOrderCounts).reduce((sum, count) => sum + count, 0) / totalCustomers 
      : 0;

    // Prepare top products
    const topProducts: TopProduct[] = Object.entries(productSales)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);

    // Prepare payment methods
    const paymentMethods: PaymentMethod[] = Object.entries(paymentMethodData)
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: data.total,
      }))
      .sort((a, b) => b.total - a.total);

    // Calculate yearly growth
    const yearlyGrowth: Record<string, number> = {};
    const sortedYears = years.sort((a: number, b: number) => a - b);
    for (let i = 1; i < sortedYears.length; i++) {
      const currentYear = sortedYears[i];
      const previousYear = sortedYears[i - 1];
      
      const currentTotal = Object.values(compareData[currentYear] || {}).reduce(
        (sum, month) => sum + month.revenue, 
        0
      );
      const previousTotal = Object.values(compareData[previousYear] || {}).reduce(
        (sum, month) => sum + month.revenue, 
        0
      );

      if (previousTotal > 0) {
        yearlyGrowth[currentYear] = ((currentTotal - previousTotal) / previousTotal) * 100;
      }
    }

    // Calculate return rate
    const totalOrders = Object.values(compareData).reduce(
      (sum, yearData) => sum + Object.values(yearData).reduce((s, m) => s + m.orders, 0),
      0
    );
    const returnRate = totalOrders > 0 ? (totalCancelled / (totalOrders + totalCancelled)) * 100 : 0;

    // Sort cancelled orders by date (most recent first)
    allCancelledOrders.sort((a, b) => b.date_order.localeCompare(a.date_order));

    // Prepare top returned products
    const topReturnedProducts = Object.entries(returnedProductCounts)
      .map(([name, data]) => ({
        name,
        count: data.count,
        total_quantity: data.total_quantity,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const result: InsightsData = {
      compareData,
      topProducts,
      customerInsights: {
        total_customers: totalCustomers,
        new_customers: newCustomers,
        returning_customers: returningCustomers,
        avg_orders_per_customer: avgOrdersPerCustomer,
      },
      paymentMethods,
      yearlyGrowth,
      websites,
      returnInsights: {
        total_cancelled: totalCancelled,
        total_cancelled_revenue: totalCancelledRevenue,
        return_rate: returnRate,
        monthly_returns: monthlyReturns,
        cancelled_orders: allCancelledOrders,
        top_returned_products: topReturnedProducts,
      },
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching ecommerce insights:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch ecommerce insights' 
    });
  }
});

