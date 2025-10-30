import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

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

interface ProductAvailability {
  id: number;
  name: string;
  product_id: [number, string];
  product_uom_qty: number;
  qty_available: number;
  isAvailable: boolean;
  shortage: number;
  price_unit: number;
  price_total: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    console.log('📦 Checking product availability for order:', orderId);

    // Fetch the order with order lines
    const orders = await odooCall<any[]>({
      uid,
      password,
      model: 'sale.order',
      method: 'search_read',
      args: [[['id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'order_line'],
        limit: 1,
      },
    });

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];
    const orderLineIds = order.order_line || [];

    if (orderLineIds.length === 0) {
      return res.status(200).json({ 
        orderId,
        orderName: order.name,
        products: [],
        allAvailable: true,
        message: 'No products in order'
      });
    }

    // Fetch all order line details with product information
    const orderLines = await odooCall<any[]>({
      uid,
      password,
      model: 'sale.order.line',
      method: 'search_read',
      args: [[['id', 'in', orderLineIds]]],
      kwargs: {
        fields: [
          'id',
          'product_id',
          'product_uom_qty',
          'price_unit',
          'price_total',
        ],
      },
    });

    // Extract product IDs from order lines
    const productIds = orderLines
      .map(line => line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[0] : null)
      .filter((id): id is number => id !== null);

    // Fetch product inventory information
    const products = await odooCall<any[]>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[['id', 'in', productIds]]],
      kwargs: {
        fields: ['id', 'name', 'qty_available'],
      },
    });

    // Create a map of product ID to available quantity
    const productQtyMap: Record<number, number> = {};
    products.forEach(product => {
      productQtyMap[product.id] = product.qty_available || 0;
    });

    // Build availability details for each order line
    const productAvailability: ProductAvailability[] = orderLines.map(line => {
      const productId = line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[0] : null;
      const productName = line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[1] : 'Unknown';
      const qtyNeeded = line.product_uom_qty || 0;
      const qtyAvailable = productId ? (productQtyMap[productId] || 0) : 0;
      const shortage = Math.max(0, qtyNeeded - qtyAvailable);

      return {
        id: line.id,
        name: productName,
        product_id: line.product_id,
        product_uom_qty: qtyNeeded,
        qty_available: qtyAvailable,
        isAvailable: qtyAvailable >= qtyNeeded,
        shortage,
        price_unit: line.price_unit || 0,
        price_total: line.price_total || 0,
      };
    });

    const allAvailable = productAvailability.every(p => p.isAvailable);

    console.log(`✅ Availability check completed:`, {
      orderId,
      totalProducts: productAvailability.length,
      allAvailable,
      availability: productAvailability.map(p => ({
        name: p.name,
        needed: p.product_uom_qty,
        available: p.qty_available,
        isAvailable: p.isAvailable
      }))
    });

    return res.status(200).json({
      success: true,
      orderId,
      orderName: order.name,
      products: productAvailability,
      allAvailable,
      message: allAvailable 
        ? 'All products are available in inventory'
        : 'Some products have insufficient inventory'
    });
  } catch (error) {
    console.error('Error checking product availability:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to check product availability' 
    });
  }
}
