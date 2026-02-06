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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reference, uid, password, includeDescription } = req.body;

    if (!reference || !uid || !password) {
      return res.status(400).json({ error: 'Missing required fields: reference, uid, password' });
    }

    // Strategy 1: Search template by default_code (exact match)
    let templateId: number | null = null;
    let matchedField: string | null = null;
    let description: string | null = null;
    
    // Fields to fetch - include description if requested
    const fields = includeDescription 
      ? ['id', 'name', 'default_code', 'description']
      : ['id', 'name', 'default_code'];
    
    try {
      const result = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search_read',
        [[['default_code', '=', reference]]],
        { fields, limit: 1 }
      );

      if (result && result.length > 0) {
        templateId = result[0].id;
        matchedField = 'default_code';
        description = result[0].description || null;
      } else {
        // Strategy 2: Search by description (internal notes) - this is where we store the normalized reference
        // Format can be: "reference" or "reference|productName" (e.g., "egas-blossom|26s063")
        const result2 = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'search_read',
          [[['description', '=', reference]]],
          { fields, limit: 1 }
        );

        if (result2 && result2.length > 0) {
          templateId = result2[0].id;
          matchedField = 'description';
          description = result2[0].description || null;
        } else {
          // Strategy 2b: Also try searching if reference is part of description (for "reference|productName" format)
          const result2b = await callOdoo(
            parseInt(uid),
            password,
            'product.template',
            'search_read',
            [[['description', 'ilike', `%${reference}%`]]],
            { fields, limit: 1 }
          );

          if (result2b && result2b.length > 0) {
            // Check if the description contains the reference (could be "reference|productName" format)
            const desc = result2b[0].description || '';
            if (desc.includes(reference)) {
              templateId = result2b[0].id;
              matchedField = 'description (partial)';
              description = desc;
            }
          }
        }
        
        if (!templateId) {
          // Strategy 3: Search by name contains reference
          const result3 = await callOdoo(
            parseInt(uid),
            password,
            'product.template',
            'search_read',
            [[['name', 'ilike', `%${reference}%`]]],
            { fields, limit: 1 }
          );

          if (result3 && result3.length > 0) {
            templateId = result3[0].id;
            matchedField = 'name';
            description = result3[0].description || null;
          }
        }
      }
    } catch (error) {
      console.error('Error searching for product:', error);
      return res.status(500).json({ error: String(error) });
    }

    return res.status(200).json({
      success: true,
      templateId,
      found: templateId !== null,
      matchedField: matchedField || null,
      description: description || null,
    });

  } catch (error) {
    console.error('Search product error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search product',
    });
  }
}
