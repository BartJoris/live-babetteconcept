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

interface PickingLine {
  id: number;
  product_id: [number, string];
  product_name: string;
  qty_done: number;
  quantity_done: number;
  product_uom_qty: number;
  reserved_availability: number;
}

interface PickingDetails {
  id: number;
  name: string;
  state: string;
  picking_type_id: [number, string];
  move_lines: PickingLine[];
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

    console.log('📦 Fetching picking details for order:', orderId);

    // First, get the order with its products (which we know works)
    const orders = await odooCall<any[]>({
      uid,
      password,
      model: 'sale.order',
      method: 'search_read',
      args: [[['id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'order_line'],
      },
    });

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];
    const orderLineIds = order.order_line || [];

    // Get order line products
    let orderProducts: any[] = [];
    if (orderLineIds.length > 0) {
      orderProducts = await odooCall<any[]>({
        uid,
        password,
        model: 'sale.order.line',
        method: 'read',
        args: [orderLineIds, ['id', 'product_id', 'product_uom_qty', 'price_unit', 'price_total']],
      });
      console.log(`✅ Found ${orderProducts.length} products from order`);
    }

    // Get related stock.picking (delivery) records
    const pickings = await odooCall<any[]>({
      uid,
      password,
      model: 'stock.picking',
      method: 'search_read',
      args: [[['sale_id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'state', 'picking_type_id'],
      },
    });

    console.log(`✅ Found ${pickings.length} picking(s):`, pickings);

    if (pickings.length === 0) {
      return res.status(404).json({ 
        error: 'Geen leveringsorder gevonden' 
      });
    }

    // Build picking details with order products
    const pickingDetails: PickingDetails[] = pickings.map(picking => {
      const lines: PickingLine[] = orderProducts.map(line => ({
        id: line.id,
        product_id: line.product_id,
        product_name: line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[1] : 'Unknown',
        product_uom_qty: line.product_uom_qty || 0,
        qty_done: 0,
        quantity_done: 0,
        reserved_availability: line.product_uom_qty || 0,
      }));

      return {
        id: picking.id,
        name: picking.name,
        state: picking.state,
        picking_type_id: picking.picking_type_id,
        move_lines: lines,
      };
    });

    console.log(`✅ Picking details prepared with ${orderProducts.length} products`);

    return res.status(200).json({
      success: true,
      orderId,
      pickings: pickingDetails,
      message: 'Picking details retrieved'
    });
  } catch (error) {
    console.error('Error fetching picking details:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch picking details' 
    });
  }
}
