// pages/api/pos-sales.ts

import { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
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

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get credentials from session
    const { uid, password } = req.session.user!;

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
      return res.status(200).json({
        session_id: 0,
        session_name: '',
        total: 0,
        orders: [],
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

export default withAuth(handler);
