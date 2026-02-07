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

interface SearchRequest {
  reference: string;
  uid: string;
  password: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reference, uid, password } = req.body as SearchRequest;

    if (!reference || !uid || !password) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Search for product template by default_code (internal reference)
    // Try exact match first
    let templateIds = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search',
      [[['default_code', '=', reference.toUpperCase()]]],
      { limit: 1 }
    );

    // If not found, try case-insensitive search
    if (!templateIds || templateIds.length === 0) {
      templateIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[['default_code', 'ilike', reference]]],
        { limit: 1 }
      );
    }

    // If still not found, search in product variants
    if (!templateIds || templateIds.length === 0) {
      const variantIds = await callOdoo(
        parseInt(uid),
        password,
        'product.product',
        'search',
        [[['default_code', 'ilike', reference]]],
        { limit: 1 }
      );

      if (variantIds && variantIds.length > 0) {
        // Get template ID from variant
        const variant = await callOdoo(
          parseInt(uid),
          password,
          'product.product',
          'read',
          [variantIds, ['product_tmpl_id']]
        );

        if (variant && variant[0]?.product_tmpl_id) {
          templateIds = [variant[0].product_tmpl_id[0]];
        }
      }
    }

    if (templateIds && templateIds.length > 0) {
      // Get template details
      const template = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'read',
        [templateIds, ['name', 'default_code']]
      );

      return res.status(200).json({
        success: true,
        found: true,
        templateId: templateIds[0],
        name: template[0]?.name || reference,
        reference: template[0]?.default_code || reference,
      });
    }

    return res.status(200).json({
      success: true,
      found: false,
      templateId: null,
      name: reference,
      reference,
    });

  } catch (error) {
    console.error('Error searching product:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search product',
    });
  }
}
