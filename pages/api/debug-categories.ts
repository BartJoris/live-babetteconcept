import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: any[], kwargs?: any) {
  const executeArgs = [ODOO_DB, uid, password, model, method, args];
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

    // Fetch Public/eCommerce Categories
    let publicCategories: any[] = [];
    let publicCategoriesError = null;

    try {
      // Strategy: Find sample products with public categories, then fetch those specific categories
      const sampleProducts = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search_read',
        [[['id', 'in', [6758, 7004]]]],
        { fields: ['id', 'name', 'public_categ_ids'] }
      );

      if (sampleProducts && sampleProducts.length > 0) {
        const categoryIds = new Set<number>();
        sampleProducts.forEach((p: any) => {
          if (p.public_categ_ids && Array.isArray(p.public_categ_ids)) {
            p.public_categ_ids.forEach((id: number) => categoryIds.add(id));
          }
        });

        console.log(`Found ${categoryIds.size} public category IDs from sample products`);

        if (categoryIds.size > 0) {
          // Note: product.public.category doesn't have complete_name field, only name and display_name
          publicCategories = await callOdoo(
            parseInt(uid),
            password,
            'product.public.category',
            'search_read',
            [[['id', 'in', Array.from(categoryIds)]]],
            { fields: ['id', 'name', 'display_name', 'parent_id'] }
          );
          console.log(`✅ Fetched ${publicCategories.length} public categories`);
        }
      }
    } catch (error: any) {
      console.error('Error fetching public categories:', error);
      publicCategoriesError = {
        code: error.code || 500,
        message: error.message || 'Unknown error',
        data: error.data || {},
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

    // Fetch Product Tags
    let productTags: any[] = [];
    let productTagsError = null;

    try {
      // Try different possible model names for product tags
      const possibleModels = ['product.tag', 'product.template.tag', 'base.tag'];
      
      for (const modelName of possibleModels) {
        try {
          // First check if model exists by trying to fetch from sample products
          const sampleProducts = await callOdoo(
            parseInt(uid),
            password,
            'product.template',
            'search_read',
            [[['id', 'in', [6758, 7004]]]],
            { fields: ['id', 'name', 'product_tag_ids'] }
          );

          if (sampleProducts && sampleProducts.length > 0) {
            const tagIds = new Set<number>();
            sampleProducts.forEach((p: any) => {
              if (p.product_tag_ids && Array.isArray(p.product_tag_ids)) {
                p.product_tag_ids.forEach((id: number) => tagIds.add(id));
              }
            });

            console.log(`Found ${tagIds.size} product tag IDs from sample products`);

            if (tagIds.size > 0) {
              try {
                productTags = await callOdoo(
                  parseInt(uid),
                  password,
                  modelName,
                  'search_read',
                  [[['id', 'in', Array.from(tagIds)]]],
                  { fields: ['id', 'name'] }
                );
                console.log(`✅ Fetched ${productTags.length} product tags from model: ${modelName}`);
                break;
              } catch (modelError) {
                console.log(`Model ${modelName} failed, trying next...`);
                continue;
              }
            }
          }
        } catch (error) {
          console.log(`Model ${modelName} not accessible`);
          continue;
        }
      }
    } catch (error: any) {
      console.error('Error fetching product tags:', error);
      productTagsError = {
        code: error.code || 500,
        message: error.message || 'Unknown error',
        data: error.data || {},
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

  } catch (error: any) {
    console.error('Debug categories error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch categories',
    });
  }
}

