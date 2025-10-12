import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!; // Should point to the JSON-RPC endpoint, e.g. https://your-odoo/jsonrpc
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!; // Odoo user (email/login)
const ODOO_API_KEY = process.env.ODOO_API_KEY!; // Odoo API key for that user
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || ODOO_API_KEY; // allow using ODOO_PASSWORD alias
const N8N_API_KEY = process.env.N8N_API_KEY!; // API key used by n8n to access this endpoint

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Simple API key protection for n8n
    const apiKey = (req.headers['x-api-key'] as string) || (req.query.key as string) || '';
    // Debug logs for local dev: presence only
    console.log('pos-session-total: hasN8nKeyEnv=', Boolean(N8N_API_KEY), 'hasHeader=', Boolean(apiKey));
    if (!N8N_API_KEY || apiKey !== N8N_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1) Authenticate to Odoo to obtain uid
    const authPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
      },
      id: Date.now(),
    };

    const authRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authPayload),
    });

    const authJson: { result?: number; error?: unknown } = await authRes.json();
    const uid = authJson.result;
    if (!uid) {
      return res.status(401).json({ error: 'Odoo authentication failed' });
    }

    // 2) Find latest active POS session
    const sessionPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          ODOO_PASSWORD,
          'pos.session',
          'search_read',
          [[['state', 'in', ['opening_control', 'opened', 'closing_control']]]],
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
    const sessionJson: { result?: PosSession[] } = await sessionRes.json();
    const session = (sessionJson.result || [])[0];

    if (!session) {
      // Fallback: sum today's orders (Europe/Brussels) excluding cancelled
      const now = new Date();
      const brussels = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Brussels',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(now); // e.g. 2025-08-10 15:04:05
      const ymd = brussels.split(' ')[0];
      const dayStart = `${ymd} 00:00:00`;
      const dayEnd = `${ymd} 23:59:59`;

      const todayOrdersPayload = {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            ODOO_DB,
            uid,
            ODOO_PASSWORD,
            'pos.order',
            'search_read',
            [[['date_order', '>=', dayStart], ['date_order', '<=', dayEnd], ['state', '!=', 'cancel']]],
            ['id', 'amount_total', 'date_order', 'partner_id'],
          ],
        },
        id: Date.now(),
      };

      const todayRes = await fetch(ODOO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todayOrdersPayload),
      });
      const todayJson: { result?: PosOrder[] } = await todayRes.json();
      const todayOrders = todayJson.result || [];
      const todayTotal = todayOrders.reduce((sum, o) => sum + (o.amount_total || 0), 0);

      return res.status(200).json({
        session_id: 0,
        session_name: 'today',
        total: todayTotal,
        orders_count: todayOrders.length,
      });
    }

    // 3) Fetch orders for that session and sum totals
    const orderPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          ODOO_PASSWORD,
          'pos.order',
          'search_read',
          [[['session_id', '=', session.id], ['state', '!=', 'cancel']]],
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
    const orderJson: { result?: PosOrder[] } = await orderRes.json();
    const orders = orderJson.result || [];
    const total = orders.reduce((sum, o) => sum + (o.amount_total || 0), 0);

    return res.status(200).json({
      session_id: session.id,
      session_name: session.name,
      total,
      orders_count: orders.length,
    });
  } catch (error) {
    console.error('❌ API error (pos-session-total):', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}


