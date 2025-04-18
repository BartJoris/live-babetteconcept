// pages/api/pos-sales.ts

import { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = 'babetteconcept';
const API_KEY = process.env.ODOO_API_KEY || '';

type PosSession = {
  id: number;
  name: string;
};

type PosOrder = {
  id: number;
  amount_total: number;
  date_order: string;
  session_id: [number, string];
  partner_id?: [number, string];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!API_KEY) {
    return res.status(401).json({ error: 'No API key' });
  }

  try {
    const sessionPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          API_KEY,
          'pos.session',
          'search_read',
          [[['state', '=', 'opened']]],
          ['id', 'name'],
          0,
          1,
          'id desc',
        ],
      },
      id: Date.now(),
    };

    const sessionRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionPayload),
    });

    const sessionJson: { result: PosSession[] } = await sessionRes.json();
    const session = sessionJson.result[0];

    if (!session) {
      return res.status(200).json({
        session_id: 0,
        session_name: '',
        total: 0,
        orders: [],
      });
    }

    const orderPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          API_KEY,
          'pos.order',
          'search_read',
          [[['session_id', '=', session.id]]],
          ['id', 'amount_total', 'date_order', 'partner_id'],
        ],
      },
      id: Date.now(),
    };

    const orderRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    const orderJson: { result: PosOrder[] } = await orderRes.json();

    const mappedOrders = orderJson.result.map((o) => ({
      id: o.id,
      total: o.amount_total,
      timestamp: o.date_order,
      partner: o.partner_id?.[1] || null,
    }));

    const total = mappedOrders.reduce(
      (sum: number, o: { total: number }) => sum + o.total,
      0
    );

    return res.status(200).json({
      session_id: session.id,
      session_name: session.name,
      total,
      orders: mappedOrders,
    });
  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
