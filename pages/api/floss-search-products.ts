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
  styleNos: string[];
  uid: string;
  password: string;
}

interface ProductResult {
  templateId: number;
  name: string;
  reference: string;
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
    const { styleNos, uid, password } = req.body as SearchRequest;

    if (!styleNos || styleNos.length === 0 || !uid || !password) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const products: Record<string, ProductResult> = {};
    const uidNum = parseInt(uid);

    // Flöss products store their Style No in the `description` field (internal notes),
    // NOT in `default_code`. The product name format is "Flöss - Style Name - Color".

    // Strategy 1: Search by description (internal notes) containing the style number
    // Search all Flöss/Brunobruno products at once
    const flossTemplateIds = await callOdoo(
      uidNum, password,
      'product.template', 'search',
      [[
        '|', '|',
        ['name', 'ilike', 'fl_ss'],
        ['name', 'ilike', 'brunobruno'],
        ['name', 'ilike', 'petit blush'],
      ]],
      { limit: 2000 }
    );

    console.log(`🌸 [Flöss Search] Found ${flossTemplateIds?.length || 0} Flöss/Brunobruno/Petit Blush templates in Odoo`);

    if (flossTemplateIds && flossTemplateIds.length > 0) {
      const templates = await callOdoo(
        uidNum, password,
        'product.template', 'read',
        [flossTemplateIds, ['name', 'default_code', 'description']]
      );

      console.log(`🌸 [Flöss Search] Read ${templates.length} templates, searching for style numbers: ${styleNos.join(', ')}`);
      // Log first few descriptions for debugging
      for (const tmpl of templates.slice(0, 3)) {
        console.log(`🌸 [Sample] "${tmpl.name}" -> description: "${(tmpl.description || '').substring(0, 100)}"`);
      }

      for (const tmpl of templates) {
        // Strip HTML tags - Odoo may wrap internal notes in <p> tags
        const rawDesc = (tmpl.description || '');
        const desc = rawDesc.replace(/<[^>]*>/g, '').trim();
        const name = (tmpl.name || '');

        for (const styleNo of styleNos) {
          if (products[styleNo]) continue;

          // Check description (internal notes) for the style number
          if (desc && desc.toUpperCase().includes(styleNo.toUpperCase())) {
            products[styleNo] = {
              templateId: tmpl.id,
              name,
              reference: styleNo,
              hasImages: false,
              imageCount: 0,
            };
            continue;
          }

          // Also check product name for the style number as fallback
          if (name.toUpperCase().includes(styleNo.toUpperCase())) {
            products[styleNo] = {
              templateId: tmpl.id,
              name,
              reference: styleNo,
              hasImages: false,
              imageCount: 0,
            };
          }
        }
      }
    }

    // Strategy 2: Fallback - search by default_code for any not yet found
    const notFoundAfterDesc = styleNos.filter(s => !products[s]);
    if (notFoundAfterDesc.length > 0) {
      const codeIds = await callOdoo(
        uidNum, password,
        'product.template', 'search',
        [[['default_code', 'in', notFoundAfterDesc.map(s => s.toUpperCase())]]],
        { limit: 500 }
      );

      if (codeIds && codeIds.length > 0) {
        const templates = await callOdoo(
          uidNum, password,
          'product.template', 'read',
          [codeIds, ['name', 'default_code']]
        );

        for (const tmpl of templates) {
          const code = (tmpl.default_code || '').toUpperCase();
          const matchingStyleNo = notFoundAfterDesc.find(s => s.toUpperCase() === code);
          if (matchingStyleNo && !products[matchingStyleNo]) {
            products[matchingStyleNo] = {
              templateId: tmpl.id,
              name: tmpl.name,
              reference: tmpl.default_code || code,
              hasImages: false,
              imageCount: 0,
            };
          }
        }
      }
    }

    // Fetch gallery image counts in one batch
    const allFoundTemplateIds = Object.values(products).map(p => p.templateId);
    if (allFoundTemplateIds.length > 0) {
      try {
        const allImageIds = await callOdoo(
          uidNum, password,
          'product.image', 'search_read',
          [[['product_tmpl_id', 'in', allFoundTemplateIds]]],
          { fields: ['product_tmpl_id'], limit: 1000 }
        );
        if (allImageIds && allImageIds.length > 0) {
          const countByTemplate: Record<number, number> = {};
          for (const img of allImageIds) {
            const tid = Array.isArray(img.product_tmpl_id) ? img.product_tmpl_id[0] : img.product_tmpl_id;
            countByTemplate[tid] = (countByTemplate[tid] || 0) + 1;
          }
          for (const styleNo of Object.keys(products)) {
            const count = countByTemplate[products[styleNo].templateId] || 0;
            products[styleNo].imageCount = count;
            products[styleNo].hasImages = count > 0;
          }
        }
      } catch (err) {
        console.error('Error counting images:', err);
      }
    }

    return res.status(200).json({
      success: true,
      products,
      found: Object.keys(products).length,
      total: styleNos.length,
    });

  } catch (error) {
    console.error('Error searching Flöss products:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search products',
    });
  }
}
