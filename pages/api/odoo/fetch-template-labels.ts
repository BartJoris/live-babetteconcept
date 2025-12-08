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
    console.log('🔍 Fetching product template labels (tags)...');

    // Try different possible model names for product tags
    const possibleModels = ['product.tag', 'product.template.tag', 'base.tag'];
    let productTags: Array<{ id: number; name: string }> = [];
    let usedModel = '';

    for (const modelName of possibleModels) {
      try {
        productTags = await callOdoo(
          uid,
          password,
          modelName,
          'search_read',
          [[]], // Empty domain = fetch all
          { fields: ['id', 'name'] }
        ) as Array<{ id: number; name: string }>;
        usedModel = modelName;
        console.log(`✅ Fetched ${productTags.length} product tags from model: ${modelName}`);
        break; // Success, exit loop
      } catch {
        console.log(`Model ${modelName} failed or not accessible, trying next...`);
        continue;
      }
    }

    if (productTags.length === 0 && usedModel === '') {
      return res.status(500).json({
        success: false,
        error: 'Could not find product tag model',
      });
    }

    return res.status(200).json({
      success: true,
      labels: productTags.map(tag => ({
        id: tag.id,
        name: tag.name,
      })),
      model: usedModel,
    });
  } catch (error) {
    console.error('Error fetching template labels:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch template labels',
    });
  }
}

export default withAuth(handler);

