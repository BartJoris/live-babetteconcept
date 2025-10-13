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
  const { uid, password } = req.method === 'POST' ? req.body : req.query;

  if (!uid || !password) {
    return res.status(400).json({ error: 'Missing uid or password' });
  }

  try {
    console.log('🔍 Fetching categories...');

    // Fetch Internal Categories
    const internalCategories = await callOdoo(
      parseInt(uid),
      password,
      'product.category',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'display_name', 'parent_id'] }
    );
    console.log(`✅ Found ${internalCategories.length} internal categories`);

    // Fetch Public/eCommerce Categories - ALL categories
    let publicCategories: unknown[] = [];
    let publicCategoriesError: { code: number; message: string; data: unknown } | null = null;

    try {
      // Fetch ALL public categories instead of just those from sample products
      publicCategories = await callOdoo(
        parseInt(uid),
        password,
        'product.public.category',
        'search_read',
        [[]], // Empty domain = fetch all
        { fields: ['id', 'name', 'display_name', 'parent_id'] }
      );
      console.log(`✅ Fetched ${publicCategories.length} public categories (all)`);
    } catch (error) {
      console.error('Error fetching public categories:', error);
      const err = error as { code?: number; message?: string; data?: unknown };
      publicCategoriesError = {
        code: err.code || 500,
        message: err.message || 'Unknown error',
        data: err.data || {},
      };
    }

    // Fetch POS Categories
    const posCategories = await callOdoo(
      parseInt(uid),
      password,
      'pos.category',
      'search_read',
      [[]],
      { fields: ['id', 'name', 'parent_id'] }
    );
    console.log(`✅ Found ${posCategories.length} POS categories`);

    // Fetch Product Tags - ALL tags
    let productTags: unknown[] = [];
    let productTagsError: { code: number; message: string; data: unknown } | null = null;

    try {
      // Try different possible model names for product tags
      const possibleModels = ['product.tag', 'product.template.tag', 'base.tag'];
      
      for (const modelName of possibleModels) {
        try {
          // Fetch ALL tags instead of just from sample products
          productTags = await callOdoo(
            parseInt(uid),
            password,
            modelName,
            'search_read',
            [[]], // Empty domain = fetch all
            { fields: ['id', 'name'] }
          );
          console.log(`✅ Fetched ${productTags.length} product tags from model: ${modelName}`);
          break; // Success, exit loop
        } catch {
          console.log(`Model ${modelName} failed or not accessible, trying next...`);
          continue;
        }
      }
    } catch (error) {
      console.error('Error fetching product tags:', error);
      const err = error as { code?: number; message?: string; data?: unknown };
      productTagsError = {
        code: err.code || 500,
        message: err.message || 'Unknown error',
        data: err.data || {},
      };
    }

    // Sample products that should have these fields
    const sampleProductWithPublicCategs = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search_read',
      [[['id', 'in', [6758, 7004]]]],
      { fields: ['id', 'name', 'public_categ_ids'] }
    );

    const sampleProductsWithTags = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search_read',
      [[['id', 'in', [6758, 7004]]]],
      { fields: ['id', 'name', 'product_tag_ids'] }
    );

    return res.status(200).json({
      success: true,
      summary: {
        internalCategories: internalCategories.length,
        publicCategories: publicCategories.length,
        posCategories: posCategories.length,
        productTags: productTags.length,
      },
      internalCategories,
      publicCategories,
      publicCategoriesError,
      posCategories,
      productTags,
      productTagsError,
      sampleProductWithPublicCategs,
      sampleProductsWithTags,
    });

  } catch (error) {
    console.error('Debug categories error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch categories',
    });
  }
}

