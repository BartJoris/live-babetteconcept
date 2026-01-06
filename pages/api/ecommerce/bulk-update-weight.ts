import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface BulkUpdateWeightRequest {
  productIds: number[];
  weight: number;
  updateType: 'variant' | 'template'; // 'variant' updates product.product, 'template' updates product.template
}

interface UpdateResult {
  productId: number;
  success: boolean;
  error?: string;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: boolean; updatedCount: number; results: UpdateResult[] } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { productIds, weight, updateType }: BulkUpdateWeightRequest = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds must be a non-empty array' });
    }

    if (typeof weight !== 'number' || weight <= 0) {
      return res.status(400).json({ error: 'weight must be a positive number' });
    }

    if (updateType !== 'variant' && updateType !== 'template') {
      return res.status(400).json({ error: 'updateType must be either "variant" or "template"' });
    }

    const model = updateType === 'variant' ? 'product.product' : 'product.template';
    const results: UpdateResult[] = [];

    console.log(`📝 Updating weight to ${weight}kg for ${productIds.length} ${updateType}(s)...`);

    // Update all products/templates at once
    try {
      await odooClient.write(
        user.uid,
        user.password,
        model,
        productIds,
        { weight }
      );

      // All succeeded
      productIds.forEach((id) => {
        results.push({ productId: id, success: true });
      });

      console.log(`✅ Successfully updated weight for ${productIds.length} ${updateType}(s)`);

      return res.status(200).json({
        success: true,
        updatedCount: productIds.length,
        results,
      });
    } catch (error) {
      // If bulk update fails, try individual updates
      console.warn('Bulk update failed, trying individual updates...');
      let successCount = 0;

      for (const id of productIds) {
        try {
          await odooClient.write(
            user.uid,
            user.password,
            model,
            [id],
            { weight }
          );
          results.push({ productId: id, success: true });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Error updating ${updateType} ${id}:`, message);
          results.push({ productId: id, success: false, error: message });
        }
      }

      return res.status(200).json({
        success: successCount > 0,
        updatedCount: successCount,
        results,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating product weights:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

