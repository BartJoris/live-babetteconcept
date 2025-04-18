// pages/api/test-odoo.ts

import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'common',
      method: 'authenticate',
      args: [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}],
    },
    id: new Date().getTime(),
  };

  try {
    const response = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    if (json.result) {
      res.status(200).json({ success: true, uid: json.result });
    } else {
      res.status(401).json({ success: false, error: json.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
