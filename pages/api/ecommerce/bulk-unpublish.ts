import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface BulkUnpublishRequest {
  templateIds: number[];
}

interface UnpublishResult {
  templateId: number;
  success: boolean;
  error?: string;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: boolean; updatedCount: number; results: UnpublishResult[] } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { templateIds }: BulkUnpublishRequest = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'templateIds must be a non-empty array' });
    }

    const results: UnpublishResult[] = [];

    console.log(`📝 Depubliceren van ${templateIds.length} product template(s)...`);

    // Update all templates at once
    try {
      await odooClient.write(
        user.uid,
        user.password,
        'product.template',
        templateIds,
        { website_published: false }
      );

      // All succeeded
      templateIds.forEach((id) => {
        results.push({ templateId: id, success: true });
      });

      console.log(`✅ Successfully unpublished ${templateIds.length} product template(s)`);

      return res.status(200).json({
        success: true,
        updatedCount: templateIds.length,
        results,
      });
    } catch (error) {
      // If bulk update fails, try individual updates
      console.warn('Bulk unpublish failed, trying individual updates...');
      let successCount = 0;

      for (const id of templateIds) {
        try {
          await odooClient.write(
            user.uid,
            user.password,
            'product.template',
            [id],
            { website_published: false }
          );
          results.push({ templateId: id, success: true });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Error unpublishing template ${id}:`, message);
          results.push({ templateId: id, success: false, error: message });
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
    console.error('Error unpublishing products:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

