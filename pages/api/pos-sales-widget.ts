// pages/api/pos-sales-widget.ts
// API endpoint for iOS widget - uses Basic Auth with Odoo credentials

import { NextApiRequest, NextApiResponse } from 'next';
import { odooClient } from '@/lib/odooClient';

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
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    if (!username || !password) {
      return null;
    }
    
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

  try {
    // Get Odoo credentials from Basic Auth
    const credentials = getBasicAuthCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized - Basic Auth required' });
    }

    const { username, password } = credentials;

    // Authenticate with Odoo using the same method as the login endpoint
    const uid = await odooClient.authenticate(username, password);
    if (!uid) {
      return res.status(401).json({ error: 'Invalid Odoo credentials' });
    }

    // Search for open POS sessions
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
      // Try to get the last closed session
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
        (sum: number, o: { amount_total: number }) => sum + o.amount_total,
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

    // Get orders for the session
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
      (sum: number, o: { amount_total: number }) => sum + o.amount_total,
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

