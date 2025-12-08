import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface UpdateCategoryRequest {
  templateIds: number[];
  categoryId: number;
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
    const { templateIds, categoryId }: UpdateCategoryRequest = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'templateIds must be a non-empty array' });
    }

    if (!categoryId || typeof categoryId !== 'number') {
      return res.status(400).json({ error: 'categoryId must be a number' });
    }

    console.log(`📝 Updating category for ${templateIds.length} product templates...`);

    // Update all templates at once
    await odooClient.write(
      uid,
      password,
      'product.template',
      templateIds,
      { categ_id: categoryId }
    );

    console.log(`✅ Successfully updated ${templateIds.length} product templates`);

    // Fetch updated templates to return current category info
    const updatedTemplates = await odooClient.read<{ id: number; name: string; categ_id: [number, string] }>(
      uid,
      password,
      'product.template',
      templateIds,
      ['id', 'name', 'categ_id']
    );

    return res.status(200).json({
      success: true,
      message: `Successfully updated category for ${templateIds.length} product(s)`,
      updatedCount: templateIds.length,
      templates: updatedTemplates.map(t => ({
        id: t.id,
        name: t.name,
        categoryId: Array.isArray(t.categ_id) ? t.categ_id[0] : t.categ_id,
        categoryName: Array.isArray(t.categ_id) ? t.categ_id[1] : null,
      })),
    });
  } catch (error) {
    console.error('Error updating product category:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update product category',
    });
  }
}

export default withAuth(handler);

