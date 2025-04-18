import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = 'babetteconcept';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'common',
      method: 'authenticate',
      args: [ODOO_DB, username, password, {}],
    },
    id: Date.now(),
  };

  try {
    const odooRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json: { result?: number } = await odooRes.json();
    return res.status(200).json({ uid: json.result ?? null });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
