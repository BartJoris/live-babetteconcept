import type { NextApiRequest, NextApiResponse } from 'next';
import { callOdooMethod } from '../../lib/odoo';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  try {
    const productId = parseInt(id);

    console.log(`🔍 Fetching product template ${productId}...`);

    // Fetch the product template  
    const template = await callOdooMethod(
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
      attributeLines = await callOdooMethod(
        'product.template.attribute.line',
        'read',
        [productTemplate.attribute_line_ids]
      );
    }

    // Fetch product variants
    let variants = [];
    if (productTemplate.product_variant_ids && productTemplate.product_variant_ids.length > 0) {
      variants = await callOdooMethod(
        'product.product',
        'read',
        [productTemplate.product_variant_ids]
      );
    }

    // Fetch category
    let category = null;
    if (productTemplate.categ_id && productTemplate.categ_id[0]) {
      const categoryResult = await callOdooMethod(
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
        publicCategories = await callOdooMethod(
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

  } catch (error: any) {
    console.error('Product debug error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch product',
    });
  }
}

