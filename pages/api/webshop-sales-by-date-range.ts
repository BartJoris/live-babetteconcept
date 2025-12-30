import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

type SaleOrderLine = {
  id: number;
  product_id: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal?: number;
  discount?: number;
  order_id: [number, string];
};

type SaleOrder = {
  id: number;
  date_order: string;
  name: string;
};

type Product = {
  id: number;
  barcode: string | false;
  name: string;
  display_name: string;
  qty_available: number | null;
  list_price: number | null;
};

type SalesRow = {
  productId: number | null;
  barcode: string;
  name: string;
  variant: string | null;
  qty: number;
  salePrice: number | null;
  purchasePrice: null;
  qtyAvailable: number | null;
  found: true;
  note?: string;
  orderId: number;
  orderDate: string;
};

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const { uid, password } = req.session.user!;

    // Format dates for Odoo (YYYY-MM-DD HH:MM:SS)
    const startDateTime = `${startDate} 00:00:00`;
    const endDateTime = `${endDate} 23:59:59`;

    // 1. Haal alle webshop orders op voor de date range
    // Filter op website_id != false om alleen e-commerce orders te krijgen
    // En alleen bevestigde orders (sale, done) - geen draft of cancelled
    const orders = await odooClient.searchRead<SaleOrder>(
      uid,
      password,
      'sale.order',
      [
        ['date_order', '>=', startDateTime], 
        ['date_order', '<=', endDateTime],
        ['website_id', '!=', false], // Alleen webshop orders
        ['state', 'in', ['sale', 'done']], // Alleen bevestigde orders
      ],
      ['id', 'date_order', 'name'],
      10000,
      0
    );

    if (orders.length === 0) {
      return res.status(200).json({ rows: [] });
    }

    const orderIds = orders.map(o => o.id);
    const orderMap = new Map(orders.map(o => [o.id, o]));

    // 2. Haal alle order lines op voor deze orders
    const orderLines = await odooClient.searchRead<SaleOrderLine>(
      uid,
      password,
      'sale.order.line',
      [['order_id', 'in', orderIds]],
      ['id', 'product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'discount', 'order_id'],
      10000,
      0
    );

    if (orderLines.length === 0) {
      return res.status(200).json({ rows: [] });
    }

    // 3. Haal alle unieke product IDs op
    const productIds = Array.from(
      new Set(
        orderLines
          .map(line => line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[0] : null)
          .filter((id): id is number => id !== null)
      )
    );

    if (productIds.length === 0) {
      return res.status(200).json({ rows: [] });
    }

    // 4. Haal product informatie op (inclusief barcode en voorraad)
    const products = await odooClient.searchRead<Product>(
      uid,
      password,
      'product.product',
      [['id', 'in', productIds]],
      ['id', 'barcode', 'name', 'display_name', 'qty_available', 'list_price'],
      productIds.length,
      0
    );

    // Maak een map van product ID naar product info
    const productMap = new Map(products.map(p => [p.id, p]));

    // 5. Converteer order lines naar SalesRow formaat
    const rows: SalesRow[] = orderLines
      .filter((line): line is SaleOrderLine & { product_id: [number, string] } => 
        line.product_id !== false && typeof line.product_id !== 'boolean'
      )
      .map(line => {
        const productId = line.product_id[0];
        const product = productMap.get(productId);
        const order = orderMap.get(line.order_id[0]);

        const barcode = product?.barcode && typeof product.barcode === 'string'
          ? product.barcode 
          : null;

        return {
          productId: productId,
          barcode: barcode || '',
          name: product?.name || line.product_id[1] || 'Onbekend product',
          variant: product?.display_name || null,
          qty: line.product_uom_qty || 0,
          salePrice: line.price_unit || null,
          purchasePrice: null,
          qtyAvailable: product?.qty_available ?? null,
          found: true as const,
          note: `Order: ${order?.name || line.order_id[1]} - ${order?.date_order || ''}`,
          orderId: line.order_id[0],
          orderDate: order?.date_order || '',
        };
      })
      .filter(row => row.barcode && row.barcode !== '');

    return res.status(200).json({ rows });
  } catch (error) {
    console.error('Error fetching webshop sales:', error);
    return res.status(500).json({
      error: 'Failed to fetch webshop sales',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

