import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user || {};

    if (!uid || !password) {
      console.error('❌ No credentials in session');
      return res.status(401).json({ error: 'Unauthorized - no session credentials' });
    }

    console.log('📦 Fetching all products for user:', uid);

    // Fetch all product templates
    const products = await odooClient.call<Array<{ id: number; name: string; default_code: string; active: boolean }>>({
      uid,
      password,
      model: 'product.template',
      method: 'search_read',
      args: [[]],
      kwargs: { fields: ['id', 'name', 'default_code', 'active'], limit: 10000 },
    });

    console.log(`✅ Fetched ${products?.length || 0} products`);

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        products: [],
      });
    }

    // Fetch variant counts
    const variantCounts = await odooClient.call<Array<{ product_tmpl_id: [number, string]; product_tmpl_id_count: number }>>({
      uid,
      password,
      model: 'product.product',
      method: 'read_group',
      args: [[], ['product_tmpl_id'], ['product_tmpl_id']],
    });

    console.log(`✅ Fetched variant counts:`, variantCounts?.length || 0);

    // Create a map of template_id -> variant_count
    const variantCountMap: Record<number, number> = {};
    if (Array.isArray(variantCounts)) {
      variantCounts.forEach((group: any) => {
        if (group.product_tmpl_id && Array.isArray(group.product_tmpl_id)) {
          variantCountMap[group.product_tmpl_id[0]] = group.product_tmpl_id_count || 0;
        }
      });
    }

    // Add variant counts to products
    const productsWithVariants = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      default_code: p.default_code,
      active: p.active,
      variant_count: variantCountMap[p.id] || 0,
    }));

    console.log(`✅ Returning ${productsWithVariants.length} products with variant counts`);

    return res.status(200).json({
      success: true,
      products: productsWithVariants,
    });
  } catch (error) {
    console.error('❌ Product cleanup error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch products',
      details: err.message,
    });
  }
}

export default withAuth(handler);
