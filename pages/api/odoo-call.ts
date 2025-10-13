import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { uid, password, model, method, args, kwargs } = req.body;

  if (!uid || !password || !model || !method || !args) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const executeArgs = [ODOO_DB, uid, password, model, method, args];
  if (kwargs) executeArgs.push(kwargs);

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: executeArgs,
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
    const json = JSON.parse(raw);

    if (json.error) {
      console.error('Odoo error:', json.error);
      return res.status(500).json({ success: false, error: json.error });
    }

    return res.status(200).json({ success: true, result: json.result });
  } catch (err) {
    console.error('❌ Fout bij Odoo request:', err);
    return res.status(500).json({ error: 'Odoo request failed' });
  }
}
