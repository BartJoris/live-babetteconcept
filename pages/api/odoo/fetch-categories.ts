import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';

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

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password } = req.session.user || {};

  if (!uid || !password) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    console.log('🔍 Fetching product categories...');

    const categories = await callOdoo(
      uid,
      password,
      'product.category',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'complete_name', 'display_name'] }
    ) as Array<{ id: number; name: string; complete_name?: string; display_name?: string }>;

    console.log(`✅ Found ${categories.length} categories`);

    return res.status(200).json({
      success: true,
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.complete_name || cat.display_name || cat.name,
      })),
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch categories',
    });
  }
}

export default withAuth(handler);

