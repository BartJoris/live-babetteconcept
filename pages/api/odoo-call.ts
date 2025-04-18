import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = 'babetteconcept';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { model, method, args, uid, password } = req.body;

  if (!uid || !password || !model || !method || !args) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [ODOO_DB, uid, password, model, method, args],
    },
    id: Date.now(),
  };

  try {
    const odooRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await odooRes.json();

    if (json.error) {
      console.error('Odoo error:', json.error);
      return res.status(500).json({ error: json.error });
    }

    return res.status(200).json({ result: json.result });
  } catch (error) {
    console.error('Odoo call failed:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
