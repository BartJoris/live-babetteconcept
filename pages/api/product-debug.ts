import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: unknown[]) {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  // Get credentials from session
  const { uid, password } = req.session.user!;

  try {
    const productId = parseInt(id);

    console.log(`🔍 Fetching product template ${productId}...`);

    // Fetch the product template  
    const template = await callOdoo(
      uid,
      password,
      'product.template',
      'read',
      [[productId]]
    );

    if (!template || template.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Product template ${productId} not found`,
      });
    }

    const productTemplate = template[0];

    // Fetch attribute lines
    let attributeLines = [];
    if (productTemplate.attribute_line_ids && productTemplate.attribute_line_ids.length > 0) {
      attributeLines = await callOdoo(
        uid,
        password,
        'product.template.attribute.line',
        'read',
        [productTemplate.attribute_line_ids]
      );
    }

    // Fetch product variants
    let variants = [];
    if (productTemplate.product_variant_ids && productTemplate.product_variant_ids.length > 0) {
      variants = await callOdoo(
        uid,
        password,
        'product.product',
        'read',
        [productTemplate.product_variant_ids]
      );
    }

    // Fetch category
    let category = null;
    if (productTemplate.categ_id && productTemplate.categ_id[0]) {
      const categoryResult = await callOdoo(
        uid,
        password,
        'product.category',
        'read',
        [[productTemplate.categ_id[0]]]
      );
      if (categoryResult && categoryResult.length > 0) {
        category = categoryResult[0];
      }
    }

    // Fetch public categories
    let publicCategories = [];
    if (productTemplate.public_categ_ids && productTemplate.public_categ_ids.length > 0) {
      try {
        publicCategories = await callOdoo(
          uid,
          password,
          'product.public.category',
          'read',
          [productTemplate.public_categ_ids]
        );
      } catch (error) {
        console.error('Error fetching public categories:', error);
      }
    }

    console.log(`✅ Product ${productId} fetched successfully`);
    console.log(`   - Variants: ${variants.length}`);
    console.log(`   - Attribute Lines: ${attributeLines.length}`);
    console.log(`   - Public Categories: ${publicCategories.length}`);

    return res.status(200).json({
      success: true,
      productId,
      template: productTemplate,
      attributeLines,
      variants,
      category,
      publicCategories,
    });

  } catch (error) {
    console.error('Product debug error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch product',
    });
  }
}

export default withAuth(handler);