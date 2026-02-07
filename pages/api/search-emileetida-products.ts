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
  reference: string;      // e.g., "AD008"
  color?: string;         // e.g., "creme" (optional - for more precise matching)
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

    // Build search domain
    // Emile et Ida products have references like "AD015_CREME" or just "AD015"
    // Product names are like "Emile & Ida - Tee shirt imprime place fruit - Creme (ad015)"
    
    // Strategy 1: Search by exact reference + color combination (e.g., AD008_CREME)
    if (color) {
      const refWithColor = `${reference.toUpperCase()}_${color.toUpperCase().replace(/\s+/g, '')}`;
      
      const exactTemplateIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[['default_code', '=', refWithColor]]],
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
            reference: tmpl.default_code || refWithColor,
            color: color,
            hasImages: false,
            imageCount: 0,
          });
        }
      }
    }

    // Strategy 2: If no exact match with color, search by reference containing the base ref
    if (results.length === 0) {
      // Search for products where default_code starts with the reference
      const partialTemplateIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[['default_code', '=ilike', `${reference.toUpperCase()}%`]]],
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
          // Extract color from reference if it's in format AD008_COLOR
          const colorFromRef = refCode.includes('_') ? refCode.split('_')[1] : undefined;
          
          // If color was specified, filter to only matching colors
          if (color) {
            const normalizedSearchColor = color.toUpperCase().replace(/\s+/g, '');
            const normalizedRefColor = colorFromRef?.toUpperCase().replace(/\s+/g, '');
            
            // Check if colors match (fuzzy matching)
            if (normalizedRefColor && normalizedRefColor.includes(normalizedSearchColor) || 
                normalizedSearchColor.includes(normalizedRefColor || '')) {
              results.push({
                templateId: tmpl.id,
                name: tmpl.name,
                reference: refCode,
                color: colorFromRef,
                hasImages: false,
                imageCount: 0,
              });
            }
          } else {
            // No color specified - return all matches
            results.push({
              templateId: tmpl.id,
              name: tmpl.name,
              reference: refCode,
              color: colorFromRef,
              hasImages: false,
              imageCount: 0,
            });
          }
        }
      }
    }

    // Strategy 3: Search by product name containing the reference (fallback)
    if (results.length === 0) {
      const nameSearchIds = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search',
        [[
          '&',
          ['name', 'ilike', 'emile'],
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
          [nameSearchIds, ['name', 'default_code']]
        );

        for (const tmpl of templates) {
          // If color was specified, check if name contains the color
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
      // Get product.image records for these templates
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
      searchedColor: color,
    });

  } catch (error) {
    console.error('Error searching Emile et Ida products:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search products',
    });
  }
}
