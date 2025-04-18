// pages/api/order-lines.ts

import { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = 'babetteconcept';
const API_KEY = process.env.ODOO_API_KEY || '';

type OrderLineRaw = {
  id: number;
  order_id: [number, string];
  product_id: [number, string];
  qty: number;
  price_unit: number;
};

type OrderLineFormatted = {
  product_name: string;
  qty: number;
  price_unit: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!API_KEY) {
    return res.status(401).json({ error: 'No API key' });
  }

  const orderId = parseInt(req.query.id as string, 10);
  if (!orderId || isNaN(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          API_KEY,
          'pos.order.line',
          'search_read',
          [[['order_id', '=', orderId]]],
          ['id', 'order_id', 'product_id', 'qty', 'price_unit'],
        ],
      },
      id: Date.now(),
    };

    const response = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json: { result: OrderLineRaw[] } = await response.json();

    const lines: OrderLineFormatted[] = json.result.map((line) => ({
      product_name: line.product_id?.[1] || 'Onbekend',
      qty: line.qty,
      price_unit: line.price_unit,
    }));

    return res.status(200).json({ lines });
  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
