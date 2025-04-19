import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("➡️ API /api/order-lines aangeroepen");

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const orderId = Number(req.query.id);
  const { uid, password } = req.body;

  console.log("📦 Ophalen orderlijnen van:", orderId, "met uid:", uid);

  if (!orderId || !uid || !password) {
    console.log("❌ Ontbrekende parameters");
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [
        ODOO_DB,
        uid,
        password,
        'pos.order.line',
        'search_read',
        [[['order_id', '=', orderId]]],
        { fields: ['product_id', 'qty', 'price_unit'] },
      ],
    },
    id: Date.now(),
  };

  try {
    const response = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    console.log("⬅️ Ruwe Odoo-response:", raw);

    const json = JSON.parse(raw);

    if (json.error) {
      console.error('Odoo error:', json.error);
      return res.status(500).json({ error: json.error });
    }

    const lines = json.result.map((line: any) => ({
      product_name: line.product_id?.[1] ?? 'Onbekend',
      qty: line.qty,
      price_unit: line.price_unit,
    }));

    return res.status(200).json({ lines });
  } catch (err) {
    console.error('❌ Fetch error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
