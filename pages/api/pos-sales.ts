import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { uid, password, sessionId } = req.body;

  if (!uid || !password) {
    return res.status(400).json({ error: 'Missing uid or password' });
  }

  const payload = (model: string, method: string, args: unknown[]) => ({
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [ODOO_DB, uid, password, model, method, args],
    },
    id: Date.now(),
  });

  try {
    if (!sessionId) {
      const sessionRes = await fetch(ODOO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload('pos.session', 'search_read', [
          [['state', '=', 'opened']],
          ['id', 'name'],
          0, 10,
        ])),
      });
      const sessions = (await sessionRes.json()).result ?? [];

      const totals = [];

      for (const session of sessions) {
        const ordersRes = await fetch(ODOO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload('pos.order', 'search_read', [
            [['session_id', '=', session.id]],
            ['amount_total'],
            0, 10000,
          ])),
        });

        const orders = (await ordersRes.json()).result ?? [];
        const total = orders.reduce((sum: number, o: any) => sum + o.amount_total, 0);

        totals.push({ id: session.id, name: session.name, total });
      }

      return res.status(200).json({ sessions: totals });
    }

    const session = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload('pos.session', 'read', [[sessionId], ['name']])),
    }).then(r => r.json()).then(j => j.result?.[0]);

    const orders = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload('pos.order', 'search_read', [
        [['session_id', '=', sessionId]],
        ['id', 'amount_total', 'date_order', 'partner_id'],
        0, 10000,
      ])),
    }).then(r => r.json()).then(j => j.result ?? []);

    const mappedOrders = orders.map((o: any) => ({
      id: o.id,
      total: o.amount_total,
      timestamp: o.date_order,
      partner: o.partner_id?.[1] ?? null,
    }));

    const total = mappedOrders.reduce((sum, o) => sum + o.total, 0);

    return res.status(200).json({
      session_id: sessionId,
      session_name: session.name,
      total,
      orders: mappedOrders,
    });

  } catch (err) {
    console.error('❌ Error in pos-sales handler:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}