import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

type PendingOrder = {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  partner_id: [number, string] | false;
  partner_name: string;
  partner_email: string | null;
  partner_phone: string | null;
  partner_street: string | null;
  partner_city: string | null;
  partner_zip: string | null;
  partner_country: string | null;
  state: string;
  website_id: [number, string] | false;
  picking_state: string | null;
  order_line: Array<{
    product_id: [number, string];
    product_uom_qty: number;
    price_unit: number;
    price_total: number;
  }>;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;

    // Fetch recent e-commerce orders (sent, sale, done - no drafts or cancelled)
    // Shows last 10 orders so you can easily download documents
    const orders = await odooCall<any[]>({
      uid,
      password,
      model: 'sale.order',
      method: 'search_read',
      args: [
        [
          ['state', 'in', ['sent', 'sale', 'done']], // Exclude draft and cancel
          ['website_id', '!=', false], // Only e-commerce orders
        ],
      ],
      kwargs: {
        fields: [
          'id',
          'name',
          'date_order',
          'amount_total',
          'partner_id',
          'state',
          'website_id',
        ],
        order: 'date_order desc',
        limit: 10, // Last 10 orders
      },
    });

    // Fetch partner details and order lines
    const enrichedOrders: PendingOrder[] = [];

    for (const order of orders) {
      // Get partner details
      const partnerId = order.partner_id && typeof order.partner_id !== 'boolean' ? order.partner_id[0] : null;
      let partnerDetails: any = {};

      if (partnerId) {
        const partners = await odooCall<any[]>({
          uid,
          password,
          model: 'res.partner',
          method: 'search_read',
          args: [[['id', '=', partnerId]]],
          kwargs: {
            fields: ['name', 'email', 'phone', 'street', 'city', 'zip', 'country_id'],
            limit: 1,
          },
        });

        if (partners.length > 0) {
          partnerDetails = partners[0];
        }
      }

      // Get order lines
      const orderLines = await odooCall<any[]>({
        uid,
        password,
        model: 'sale.order.line',
        method: 'search_read',
        args: [[['order_id', '=', order.id]]],
        kwargs: {
          fields: ['product_id', 'product_uom_qty', 'price_unit', 'price_total'],
        },
      });

      // Get picking/delivery state to know if delivery needs confirmation
      let pickingState = null;
      try {
        const pickings = await odooCall<any[]>({
          uid,
          password,
          model: 'stock.picking',
          method: 'search_read',
          args: [[['sale_id', '=', order.id]]],
          kwargs: {
            fields: ['state'],
            limit: 1,
          },
        });
        if (pickings.length > 0) {
          pickingState = pickings[0].state;
        }
      } catch {
        // If picking fetch fails, just continue without it
        console.log(`Could not fetch picking state for order ${order.id}`);
      }

      enrichedOrders.push({
        id: order.id,
        name: order.name,
        date_order: order.date_order,
        amount_total: order.amount_total,
        partner_id: order.partner_id,
        partner_name: partnerDetails.name || 'Onbekend',
        partner_email: partnerDetails.email || null,
        partner_phone: partnerDetails.phone || null,
        partner_street: partnerDetails.street || null,
        partner_city: partnerDetails.city || null,
        partner_zip: partnerDetails.zip || null,
        partner_country: partnerDetails.country_id && typeof partnerDetails.country_id !== 'boolean' 
          ? partnerDetails.country_id[1] 
          : null,
        state: order.state,
        website_id: order.website_id,
        picking_state: pickingState,
        order_line: orderLines.map((line: any) => ({
          product_id: line.product_id,
          product_uom_qty: line.product_uom_qty,
          price_unit: line.price_unit,
          price_total: line.price_total,
        })),
      });
    }

    return res.status(200).json({ orders: enrichedOrders });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch pending orders' 
    });
  }
}

