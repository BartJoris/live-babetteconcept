import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface UpdateLabelsRequest {
  templateIds: number[];
  labelIds: number[];
  mode?: 'replace' | 'add'; // 'replace' replaces all labels, 'add' adds to existing
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password } = req.session.user || {};

  if (!uid || !password) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { templateIds, labelIds, mode = 'replace' }: UpdateLabelsRequest = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'templateIds must be a non-empty array' });
    }

    if (!Array.isArray(labelIds) || labelIds.length === 0) {
      return res.status(400).json({ error: 'labelIds must be a non-empty array' });
    }

    console.log(`📝 Updating labels for ${templateIds.length} product templates (mode: ${mode})...`);

    if (mode === 'replace') {
      // Replace all labels with the new ones
      await odooClient.write(
        uid,
        password,
        'product.template',
        templateIds,
        { product_tag_ids: [[6, 0, labelIds]] } // [6, 0, [ids]] replaces all existing with new list
      );
    } else {
      // Add labels to existing ones
      // First, fetch current labels for all templates
      const currentTemplates = await odooClient.read<{ id: number; product_tag_ids: number[] }>(
        uid,
        password,
        'product.template',
        templateIds,
        ['id', 'product_tag_ids']
      );

      // Update each template with merged labels
      for (const template of currentTemplates) {
        const currentLabelIds = template.product_tag_ids || [];
        const mergedLabelIds = [...new Set([...currentLabelIds, ...labelIds])]; // Remove duplicates
        
        await odooClient.write(
          uid,
          password,
          'product.template',
          [template.id],
          { product_tag_ids: [[6, 0, mergedLabelIds]] }
        );
      }
    }

    console.log(`✅ Successfully updated labels for ${templateIds.length} product templates`);

    // Fetch updated templates to return current label info
    const updatedTemplates = await odooClient.read<{ id: number; name: string; product_tag_ids: number[] }>(
      uid,
      password,
      'product.template',
      templateIds,
      ['id', 'name', 'product_tag_ids']
    );

    return res.status(200).json({
      success: true,
      message: `Successfully updated labels for ${templateIds.length} product(s)`,
      updatedCount: templateIds.length,
      templates: updatedTemplates.map(t => ({
        id: t.id,
        name: t.name,
        labelIds: t.product_tag_ids || [],
      })),
    });
  } catch (error) {
    console.error('Error updating product labels:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update product labels',
    });
  }
}

export default withAuth(handler);

