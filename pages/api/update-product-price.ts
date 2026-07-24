import type { NextApiResponse } from 'next';
import { odooClient } from '@/lib/odooClient';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

interface UpdateRequest {
  variantId: number;
  listPrice: number;
}

interface UpdateProductPriceRequest {
  updates: UpdateRequest[];

}

interface UpdateResult {
  variantId: number;
  success: boolean;
  error?: string;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: boolean; results: UpdateResult[] } | { error: string; details?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const { updates }: UpdateProductPriceRequest = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Missing or empty updates array' });
    }

    // Validate updates
    for (const update of updates) {
      if (!update.variantId || typeof update.listPrice !== 'number' || update.listPrice < 0) {
        return res.status(400).json({ 
          error: `Invalid update: variantId=${update.variantId}, listPrice=${update.listPrice}` 
        });
      }
    }

    const results: UpdateResult[] = [];

    // Batch update products
    // Group updates by price to minimize API calls (though each variant needs individual update)
    for (const update of updates) {
      try {
        await odooClient.write(
          uid,
          password,
          'product.product',
          [update.variantId],
          { list_price: update.listPrice }
        );

        results.push({
          variantId: update.variantId,
          success: true,
        });

        console.log(`✅ Updated variant ${update.variantId} price to €${update.listPrice.toFixed(2)}`);
      } catch (error: any) {
        console.error(`❌ Failed to update variant ${update.variantId}:`, error);
        results.push({
          variantId: update.variantId,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`📊 Price update complete: ${successCount} succeeded, ${failCount} failed`);

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error('Error in update-product-price:', error);
    return res.status(500).json({ 
      error: 'Failed to update prices', 
      details: error.message 
    });
  }
}

export default withAuth(handler);
