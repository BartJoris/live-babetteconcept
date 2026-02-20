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
  reference: string;      // e.g., "11000335_75" (artNo_variantNo)
  color?: string;         // e.g., "Green"
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

    // Mini Rodini products have references like "11000335_75" (artNo_variantNo)
    // Product names are like "Mini Rodini - Panther sp sweatshirt - Green (11000335)"
    
    // Strategy 1: Search by exact reference (artNo_variantNo)
    const exactTemplateIds = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search',
      [[['default_code', '=', reference.toUpperCase()]]],
      { limit: 10 }
    );

    if (exactTemplateIds && exactTemplateIds.length > 0) {
      const templates = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'read',
        [exactTemplateIds, ['name', 'default_code']]
      );

      for (const tmpl of templates) {
        results.push({
          templateId: tmpl.id,
          name: tmpl.name,
          reference: tmpl.default_code || reference,
          color: color,
          hasImages: false,
          imageCount: 0,
        });
      }
    }

    // Strategy 2: Search by artNo prefix (without variant no)
    if (results.length === 0) {
      const baseRef = reference.split('_')[0];
      const partialTemplateIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[['default_code', '=ilike', `${baseRef}%`]]],
        { limit: 50 }
      );

      if (partialTemplateIds && partialTemplateIds.length > 0) {
        const templates = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'read',
          [partialTemplateIds, ['name', 'default_code']]
        );

        for (const tmpl of templates) {
          const refCode = tmpl.default_code || '';
          
          if (color) {
            const normalizedSearchColor = color.toUpperCase().replace(/\s+/g, '');
            if (tmpl.name.toUpperCase().includes(normalizedSearchColor) || refCode.toUpperCase().includes(normalizedSearchColor)) {
              results.push({
                templateId: tmpl.id,
                name: tmpl.name,
                reference: refCode,
                color: color,
                hasImages: false,
                imageCount: 0,
              });
            }
          } else {
            results.push({
              templateId: tmpl.id,
              name: tmpl.name,
              reference: refCode,
              hasImages: false,
              imageCount: 0,
            });
          }
        }
      }
    }

    // Strategy 3: Search by product name containing "Mini Rodini" and the reference
    if (results.length === 0) {
      const baseRef = reference.split('_')[0];
      const nameSearchIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[
          '&',
          ['name', 'ilike', 'mini rodini'],
          ['name', 'ilike', baseRef]
        ]],
        { limit: 20 }
      );

      if (nameSearchIds && nameSearchIds.length > 0) {
        const templates = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'read',
          [nameSearchIds, ['name', 'default_code']]
        );

        for (const tmpl of templates) {
          if (color) {
            const normalizedColor = color.toLowerCase();
            if (tmpl.name.toLowerCase().includes(normalizedColor)) {
              results.push({
                templateId: tmpl.id,
                name: tmpl.name,
                reference: tmpl.default_code || reference,
                color: color,
                hasImages: false,
                imageCount: 0,
              });
            }
          } else {
            results.push({
              templateId: tmpl.id,
              name: tmpl.name,
              reference: tmpl.default_code || reference,
              hasImages: false,
              imageCount: 0,
            });
          }
        }
      }
    }

    // Remove duplicates
    const uniqueResults = results.filter((result, index, self) => 
      index === self.findIndex(r => r.templateId === result.templateId)
    );

    // Fetch image counts for all found products
    if (uniqueResults.length > 0) {
      for (const result of uniqueResults) {
        try {
          const imageIds = await callOdoo(
            parseInt(uid),
            password,
            'product.image',
            'search',
            [[['product_tmpl_id', '=', result.templateId]]],
            { limit: 100 }
          );
          
          const template = await callOdoo(
            parseInt(uid),
            password,
            'product.template',
            'read',
            [[result.templateId], ['image_1920']]
          );
          
          const hasMainImage = template && template[0]?.image_1920 ? 1 : 0;
          const galleryImageCount = imageIds?.length || 0;
          
          result.imageCount = hasMainImage + galleryImageCount;
          result.hasImages = result.imageCount > 0;
        } catch (err) {
          console.error(`Error fetching images for template ${result.templateId}:`, err);
          result.imageCount = 0;
          result.hasImages = false;
        }
      }
    }

    return res.status(200).json({
      success: true,
      found: uniqueResults.length > 0,
      products: uniqueResults,
      searchedReference: reference,
      searchedColor: color,
    });

  } catch (error) {
    console.error('Error searching Mini Rodini products:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search products',
    });
  }
}
