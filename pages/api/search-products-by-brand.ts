import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];
  if (kwargs) executeArgs.push(kwargs);

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'object', method: 'execute_kw', args: executeArgs },
    id: Date.now(),
  };

  const response = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brandName, uid, password } = req.body as { brandName: string; uid: string; password: string };

    if (!brandName || !uid || !password) {
      return res.status(400).json({ error: 'Missing required parameters: brandName, uid, password' });
    }

    const uidNum = parseInt(uid);

    // Search for products whose name starts with the brand name
    const templates = await callOdoo(
      uidNum, password,
      'product.template',
      'search_read',
      [[['name', 'ilike', `${brandName} -`]]],
      { fields: ['id', 'name', 'description', 'image_1920'], limit: 500 }
    ) as Array<{ id: number; name: string; description: string; image_1920: string | false }>;

    const products = templates.map(t => ({
      template_id: t.id,
      reference: t.description || String(t.id),
      name: t.name,
      hasImage: !!t.image_1920,
    }));

    return res.status(200).json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error) {
    console.error('Error searching products by brand:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
