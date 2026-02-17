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
  reference: string;      // e.g., "B126AK001"
  colorCode?: string;     // e.g., "611" (optional)
  uid: string;
  password: string;
}

interface ProductResult {
  templateId: number;
  name: string;
  reference: string;
  colorCode?: string;
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
    const { reference, colorCode, uid, password } = req.body as SearchRequest;

    if (!reference || !uid || !password) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const results: ProductResult[] = [];

    // Bobo Choses products have references stored in the "description" field (Internal Notes in Odoo)
    // Format: "B126AK026_991|B126AK026"
    // The reference can be: B126AK026 (base) or B126AK026_991 (with color code)
    
    // Strategy 1: Search by description field (where internal notes/references are stored)
    // This is the primary search method for Bobo Choses
    const descSearchIds = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search',
      [[['description', 'ilike', reference.toUpperCase()]]],
      { limit: 50 }
    );

    if (descSearchIds && descSearchIds.length > 0) {
      const templates = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'read',
        [descSearchIds, ['name', 'default_code', 'description']]
      );

      for (const tmpl of templates) {
        const desc = tmpl.description || '';
        // Strip HTML tags from description
        const descText = desc.replace(/<[^>]*>/g, '').toUpperCase();
        
        // If colorCode specified, prefer exact match with color
        if (colorCode) {
          const refWithColor = `${reference.toUpperCase()}_${colorCode}`;
          if (descText.includes(refWithColor) || descText.includes(reference.toUpperCase())) {
            results.push({
              templateId: tmpl.id,
              name: tmpl.name,
              reference: tmpl.default_code || refWithColor,
              colorCode: colorCode,
              hasImages: false,
              imageCount: 0,
            });
          }
        } else {
          // No color code - match base reference
          if (descText.includes(reference.toUpperCase())) {
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

    // Strategy 2: Search by default_code (fallback for products with reference set)
    if (results.length === 0) {
      const refWithColor = colorCode ? `${reference.toUpperCase()}_${colorCode}` : reference.toUpperCase();
      
      const exactTemplateIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[['default_code', '=ilike', `${refWithColor}%`]]],
        { limit: 50 }
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
          const refCode = tmpl.default_code || '';
          const colorFromRef = refCode.includes('_') ? refCode.split('_')[1] : undefined;
          
          results.push({
            templateId: tmpl.id,
            name: tmpl.name,
            reference: refCode,
            colorCode: colorFromRef,
            hasImages: false,
            imageCount: 0,
          });
        }
      }
    }

    // Strategy 3: Search by product name containing "Bobo Choses" and reference
    if (results.length === 0) {
      const nameSearchIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[
          '&',
          ['name', 'ilike', 'bobo choses'],
          ['name', 'ilike', reference]
        ]],
        { limit: 20 }
      );

      if (nameSearchIds && nameSearchIds.length > 0) {
        const templates = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'read',
          [nameSearchIds, ['name', 'default_code', 'description']]
        );

        for (const tmpl of templates) {
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

    // Remove duplicates
    const uniqueResults = results.filter((result, index, self) => 
      index === self.findIndex(r => r.templateId === result.templateId)
    );

    // Fetch image counts for all found products
    if (uniqueResults.length > 0) {
      for (const result of uniqueResults) {
        try {
          // Check for product.image records
          const imageIds = await callOdoo(
            parseInt(uid),
            password,
            'product.image',
            'search',
            [[['product_tmpl_id', '=', result.templateId]]],
            { limit: 100 }
          );
          
          // Also check if main image exists on template
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
      searchedColorCode: colorCode,
    });

  } catch (error) {
    console.error('Error searching Bobo Choses products:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search products',
    });
  }
}
