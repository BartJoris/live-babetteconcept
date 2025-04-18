// pages/api/order-lines.ts

import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;

// Auth
async function authenticate(): Promise<number | null> {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'common',
      method: 'authenticate',
      args: [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}],
    },
    id: Date.now(),
  };

  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  return json.result;
}

// Odoo call
async function callOdoo(
  model: string,
  method: string,
  args: any[],
  uid: number
): Promise<any> {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args],
    },
    id: Date.now(),
  };

  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

// Handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const orderId = parseInt(req.query.id as string);

  if (!orderId) {
    return res.status(400).json({ error: 'order ID ontbreekt of ongeldig' });
  }

  try {
    const uid = await authenticate();
    if (!uid) {
      return res.status(401).json({ error: 'Authenticatie mislukt' });
    }

    const lines = await callOdoo(
      'pos.order.line',
      'search_read',
      [
        [['order_id', '=', orderId]],
        ['product_id', 'qty', 'price_unit'],
      ],
      uid
    );

    const formatted = lines.map((line: any) => ({
      product_name: line.product_id[1],
      qty: line.qty,
      price_unit: line.price_unit,
    }));

    return res.status(200).json({ lines: formatted });
  } catch (err: any) {
    console.error('❌ Fout in /api/order-lines:', err.message || err);
    return res.status(500).json({ error: err.message || 'Interne serverfout' });
  }
}
