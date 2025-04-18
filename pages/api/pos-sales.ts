// pages/api/pos-sales.ts

import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;

// 🔐 Authenticate with Odoo
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

  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  return json.result;
}

// 🧠 General Odoo RPC call
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

  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const uid = await authenticate();
    if (!uid) return res.status(401).json({ error: 'Authenticatie mislukt' });

    // 🔍 Zoek de meest recente geopende sessie
    const sessions = await callOdoo(
      'pos.session',
      'search_read',
      [
        [['state', '=', 'opened']],
        ['id', 'name'],
        0,
        1,
        'id desc'
      ],
      uid
    );

    if (!sessions.length) {
      return res.status(200).json({ session_id: null, orders: [], total: 0 });
    }

    const session = sessions[0];

    // 📦 Haal de orders op van deze sessie
    const orders = await callOdoo(
      'pos.order',
      'search_read',
      [
        [['session_id', '=', session.id]],
        ['id', 'amount_total', 'date_order', 'partner_id'],
      ],
      uid
    );

    const mappedOrders = orders.map((order: any) => ({
      id: order.id,
      total: order.amount_total,
      timestamp: order.date_order,
      partner: order.partner_id?.[1] || null,
    }));

    const total = mappedOrders.reduce((sum, o) => sum + o.total, 0);

    return res.status(200).json({
      session_id: session.id,
      session_name: session.name,
      total,
      orders: mappedOrders,
    });
  } catch (err: any) {
    console.error('❌ Fout in /api/pos-sales:', err.message || err);
    return res.status(500).json({ error: err.message || 'Interne serverfout' });
  }
}
