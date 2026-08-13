import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user || {};

    if (!uid || !password) {
      console.error('❌ No credentials in session');
      return res.status(401).json({
        error: 'Unauthorized - no session credentials',
      });
    }

    console.log('📦 Fetching all products for user:', uid);

    // product_variant_count is on product.template — avoids read_group on
    // product.product (removed/blocked on this Odoo version).
    const products = await odooClient.call<
      Array<{
        id: number;
        name: string;
        default_code: string | false;
        active: boolean;
        product_variant_count: number;
      }>
    >({
      uid,
      password,
      model: 'product.template',
      method: 'search_read',
      args: [[]],
      kwargs: {
        fields: [
          'id',
          'name',
          'default_code',
          'active',
          'product_variant_count',
        ],
        limit: 10000,
      },
    });

    console.log(`✅ Fetched ${products?.length || 0} products`);

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        products: [],
      });
    }

    const productsWithVariants = products.map((p) => ({
      id: p.id,
      name: p.name,
      default_code: p.default_code || '',
      active: p.active,
      variant_count: p.product_variant_count || 0,
    }));

    console.log(
      `✅ Returning ${productsWithVariants.length} products with variant counts`,
    );

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
