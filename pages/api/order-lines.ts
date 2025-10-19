import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

type RawLine = {
  product_id?: [number, string];
  qty: number;
  price_unit: number;
};

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  console.log("➡️ API /api/order-lines aangeroepen");

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const orderId = Number(req.query.id);

  console.log("📦 Ophalen orderlijnen van:", orderId);

  if (!orderId) {
    console.log("❌ Ontbrekende order ID");
    return res.status(400).json({ error: 'Missing order ID' });
  }

  try {
    // Get credentials from session
    const { uid, password } = req.session.user!;

    // Fetch order lines
    const lines = await odooClient.searchRead<RawLine>(
      uid,
      password,
      'pos.order.line',
      [['order_id', '=', orderId]],
      ['product_id', 'qty', 'price_unit']
    );

    const mappedLines = lines.map((line) => ({
      product_name: line.product_id?.[1] ?? 'Onbekend',
      qty: line.qty,
      price_unit: line.price_unit,
    }));

    return res.status(200).json({ lines: mappedLines });
  } catch (err) {
    console.error('❌ Fetch error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withAuth(handler);
