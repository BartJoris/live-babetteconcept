// pages/api/pos-sales-widget.ts
// iOS widget endpoint — Basic Auth with Odoo credentials (widgets cannot use session cookies).
// Rate-limited to reduce brute-force risk.

import type { NextApiRequest, NextApiResponse } from 'next';
import { odooClient } from '@/lib/odooClient';
import { rateLimitApi } from '@/lib/middleware/rateLimiter';

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

function getBasicAuthCredentials(req: NextApiRequest): { username: string; password: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const separator = credentials.indexOf(':');
    if (separator <= 0) return null;

    const username = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);
    if (!username || !password) return null;

    return { username, password };
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await rateLimitApi(req, res);
  if (!allowed) return;

  try {
    const credentials = getBasicAuthCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized - Basic Auth required' });
    }

    const { username, password } = credentials;

    const uid = await odooClient.authenticate(username, password);
    if (!uid) {
      return res.status(401).json({ error: 'Invalid Odoo credentials' });
    }

    const sessions = await odooClient.searchRead<PosSession>(
      uid,
      password,
      'pos.session',
      [['state', '=', 'opened']],
      ['id', 'name'],
      1,
      0,
      'id desc'
    );

    if (!sessions.length) {
      const closedSessions = await odooClient.searchRead<PosSession>(
        uid,
        password,
        'pos.session',
        [['state', '=', 'closed']],
        ['id', 'name'],
        1,
        0,
        'id desc'
      );

      if (!closedSessions.length) {
        return res.status(200).json({
          session_id: 0,
          session_name: 'No session',
          total: 0,
          orders: [],
        });
      }

      const session = closedSessions[0];
      const orders = await odooClient.searchRead<PosOrder>(
        uid,
        password,
        'pos.order',
        [['session_id', '=', session.id]],
        ['id', 'amount_total', 'date_order', 'partner_id']
      );

      const mappedOrders = orders.map((o) => ({
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
    }

    const session = sessions[0];

    const orders = await odooClient.searchRead<PosOrder>(
      uid,
      password,
      'pos.order',
      [['session_id', '=', session.id]],
      ['id', 'amount_total', 'date_order', 'partner_id']
    );

    const mappedOrders = orders.map((o) => ({
      id: o.id,
      total: o.amount_total,
      timestamp: o.date_order,
      partner: o.partner_id?.[1] || null,
    }));

    const total = mappedOrders.reduce(
      (sum, o) => sum + o.total,
      0
    );

    return res.status(200).json({
      session_id: session.id,
      session_name: session.name,
      total,
      orders: mappedOrders,
    });
  } catch (error) {
    console.error('❌ Widget API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
