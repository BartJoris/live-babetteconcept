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
    const { uid, password } = req.body;

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    // Get Hvid brand value ID
    const hvidBrandValues = await callOdoo(
      parseInt(uid),
      password,
      'product.attribute.value',
      'search_read',
      [
        [['name', '=', 'Hvid']],
        ['id', 'attribute_id']
      ]
    );

    // Get all HVID products (products with Hvid brand)
    const hvidProducts = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search_read',
      [
        [['categ_id', 'ilike', 'Hvid']],
        ['id', 'name', 'categ_id', 'attribute_line_ids']
      ]
    );

    // Get attribute information for each product
    const productsWithAttrs = await Promise.all(
      hvidProducts.map(async (product: any) => {
        const attrLines = await callOdoo(
          parseInt(uid),
          password,
          'product.template.attribute.line',
          'read',
          [product.attribute_line_ids, ['attribute_id', 'value_ids']]
        );

        const attributes: any = {};
        for (const line of attrLines) {
          const attrName = line.attribute_id[1];
          
          // Get attribute values
          if (line.value_ids && line.value_ids.length > 0) {
            const values = await callOdoo(
              parseInt(uid),
              password,
              'product.attribute.value',
              'read',
              [line.value_ids, ['name']]
            );
            attributes[attrName] = values.map((v: any) => v.name);
          }
        }

        return {
          ...product,
          attributes,
        };
      })
    );

    // Get default category
    const hvidCategory = await callOdoo(
      parseInt(uid),
      password,
      'product.category',
      'search_read',
      [
        [['complete_name', 'ilike', 'Hvid']],
        ['id', 'name', 'complete_name']
      ]
    );

    res.status(200).json({
      success: true,
      products: productsWithAttrs,
      hvidBrand: hvidBrandValues[0] || null,
      hvidCategory: hvidCategory[0] || null,
    });

  } catch (error: any) {
    console.error('Error fetching HVID products:', error);
    res.status(500).json({ 
      error: 'Failed to fetch HVID products', 
      details: error.message 
    });
  }
}

