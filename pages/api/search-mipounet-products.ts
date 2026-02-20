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
  reference: string; // e.g., "1310.02" (model.color)
  color?: string;
  uid: string;
  password: string;
}

interface ProductResult {
  templateId: number;
  name: string;
  reference: string;
  color?: string;
  hasImages: boolean;
  imageCount: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reference, color, uid, password } = req.body as SearchRequest;

    if (!reference || !uid || !password) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const results: ProductResult[] = [];

    // Strategy 1: Search by description (Interne Notitie) — this is where the reference is stored
    const descIds = await callOdoo(
      parseInt(uid), password,
      'product.template', 'search',
      [[['description', '=', reference]]],
      { limit: 10 }
    );

    if (descIds && descIds.length > 0) {
      const templates = await callOdoo(
        parseInt(uid), password,
        'product.template', 'read',
        [descIds, ['name', 'default_code', 'description']]
      );
      for (const tmpl of templates) {
        results.push({
          templateId: tmpl.id,
          name: tmpl.name,
          reference: tmpl.description || tmpl.default_code || reference,
          color,
          hasImages: false,
          imageCount: 0,
        });
      }
    }

    // Strategy 2: Search description with ilike (handles "reference|productName" format)
    if (results.length === 0) {
      const descLikeIds = await callOdoo(
        parseInt(uid), password,
        'product.template', 'search',
        [[['description', '=ilike', `${reference}%`]]],
        { limit: 10 }
      );
      if (descLikeIds && descLikeIds.length > 0) {
        const templates = await callOdoo(
          parseInt(uid), password,
          'product.template', 'read',
          [descLikeIds, ['name', 'default_code', 'description']]
        );
        for (const tmpl of templates) {
          results.push({
            templateId: tmpl.id,
            name: tmpl.name,
            reference: tmpl.description || tmpl.default_code || reference,
            color,
            hasImages: false,
            imageCount: 0,
          });
        }
      }
    }

    // Strategy 3: Fallback — search by name containing "Mipounet" and the reference
    if (results.length === 0) {
      const nameIds = await callOdoo(
        parseInt(uid), password,
        'product.template', 'search',
        [['&', ['name', 'ilike', 'mipounet'], ['name', 'ilike', reference]]],
        { limit: 20 }
      );
      if (nameIds && nameIds.length > 0) {
        const templates = await callOdoo(
          parseInt(uid), password,
          'product.template', 'read',
          [nameIds, ['name', 'default_code', 'description']]
        );
        for (const tmpl of templates) {
          results.push({
            templateId: tmpl.id,
            name: tmpl.name,
            reference: tmpl.description || tmpl.default_code || reference,
            color,
            hasImages: false,
            imageCount: 0,
          });
        }
      }
    }

    // Deduplicate
    const unique = results.filter((r, i, self) =>
      i === self.findIndex(x => x.templateId === r.templateId)
    );

    // Fetch image counts
    for (const result of unique) {
      try {
        const imageIds = await callOdoo(
          parseInt(uid), password,
          'product.image', 'search',
          [[['product_tmpl_id', '=', result.templateId]]],
          { limit: 100 }
        );
        const template = await callOdoo(
          parseInt(uid), password,
          'product.template', 'read',
          [[result.templateId], ['image_1920']]
        );
        const hasMain = template?.[0]?.image_1920 ? 1 : 0;
        const gallery = imageIds?.length || 0;
        result.imageCount = hasMain + gallery;
        result.hasImages = result.imageCount > 0;
      } catch {
        result.imageCount = 0;
        result.hasImages = false;
      }
    }

    return res.status(200).json({
      success: true,
      found: unique.length > 0,
      products: unique,
      searchedReference: reference,
      searchedColor: color,
    });
  } catch (error) {
    console.error('Error searching Mipounet products:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search products',
    });
  }
}
