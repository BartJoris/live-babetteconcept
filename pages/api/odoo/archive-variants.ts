import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type OdooVariant = {
  id: number;
  display_name: string;
  qty_available: number;
  active: boolean;
  product_tmpl_id: [number, string] | number;
  barcode: string | false;
  default_code: string | false;
};

export type VariantInfo = {
  id: number;
  displayName: string;
  qtyAvailable: number;
  barcode: string | null;
  defaultCode: string | null;
};

export type ProductWithVariants = {
  templateId: number;
  templateName: string;
  totalVariants: number;
  emptyVariants: VariantInfo[];
};

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  const { user } = req.session;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    return handleGet(req, res, user);
  } else if (req.method === 'POST') {
    return handlePost(req, res, user);
  }
  return res.status(405).json({ error: 'Method Not Allowed' });
});

async function handleGet(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
  user: { uid: number; password: string }
) {
  try {
    const categId = req.query.categ_id ? Number(req.query.categ_id) : null;

    const domain: unknown[][] = [['qty_available', '<=', 0], ['active', '=', true]];
    if (categId) {
      domain.push(['categ_id', '=', categId]);
    }

    // Step 1: Find all active variants with qty_available <= 0
    const emptyVariants = await odooClient.call<OdooVariant[]>({
      uid: user.uid,
      password: user.password,
      model: 'product.product',
      method: 'search_read',
      args: [domain],
      kwargs: {
        fields: ['id', 'display_name', 'qty_available', 'active', 'product_tmpl_id', 'barcode', 'default_code'],
      },
    });

    if (!emptyVariants.length) {
      return res.status(200).json([]);
    }

    // Step 2: Group empty variants by template
    const emptyByTemplate = new Map<number, { templateName: string; variants: VariantInfo[] }>();
    for (const v of emptyVariants) {
      const tmplId = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id;
      const tmplName = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[1] : '';
      if (!emptyByTemplate.has(tmplId)) {
        emptyByTemplate.set(tmplId, { templateName: tmplName, variants: [] });
      }
      emptyByTemplate.get(tmplId)!.variants.push({
        id: v.id,
        displayName: v.display_name,
        qtyAvailable: v.qty_available,
        barcode: v.barcode || null,
        defaultCode: v.default_code || null,
      });
    }

    // Step 3: For each template, count total active variants to ensure we don't archive all
    const templateIds = Array.from(emptyByTemplate.keys());
    const allVariantsOfTemplates = await odooClient.call<{ product_tmpl_id: [number, string] | number; id: number }[]>({
      uid: user.uid,
      password: user.password,
      model: 'product.product',
      method: 'search_read',
      args: [[['product_tmpl_id', 'in', templateIds], ['active', '=', true]]],
      kwargs: {
        fields: ['id', 'product_tmpl_id'],
      },
    });

    // Count total active variants per template
    const totalCountByTemplate = new Map<number, number>();
    for (const v of allVariantsOfTemplates) {
      const tmplId = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id;
      totalCountByTemplate.set(tmplId, (totalCountByTemplate.get(tmplId) || 0) + 1);
    }

    // Step 4: Build results — only include templates where not ALL variants are empty
    const results: ProductWithVariants[] = [];
    for (const [tmplId, data] of emptyByTemplate) {
      const totalVariants = totalCountByTemplate.get(tmplId) || 0;
      if (totalVariants > 1 && data.variants.length < totalVariants) {
        results.push({
          templateId: tmplId,
          templateName: data.templateName,
          totalVariants,
          emptyVariants: data.variants,
        });
      }
    }

    results.sort((a, b) => a.templateName.localeCompare(b.templateName));
    return res.status(200).json(results);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('archive-variants GET error:', error);
    return res.status(500).json({ error: message });
  }
}

const BATCH_SIZE = 100;

async function handlePost(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
  user: { uid: number; password: string }
) {
  try {
    const { variantIds } = req.body as { variantIds: number[] };
    if (!Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({ error: 'variantIds is required and must be a non-empty array' });
    }

    let archived = 0;
    const errors: string[] = [];

    for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
      const batch = variantIds.slice(i, i + BATCH_SIZE);
      try {
        await odooClient.call({
          uid: user.uid,
          password: user.password,
          model: 'product.product',
          method: 'write',
          args: [batch, { active: false }],
        });
        archived += batch.length;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}`);
      }
    }

    if (errors.length > 0 && archived === 0) {
      return res.status(500).json({ error: errors.join('; ') });
    }

    return res.status(200).json({
      success: true,
      archivedCount: archived,
      totalRequested: variantIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('archive-variants POST error:', error);
    return res.status(500).json({ error: message });
  }
}
