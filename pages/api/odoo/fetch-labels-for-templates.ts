import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type LabelsMapResponse = {
  [productTmplId: number]: string[];
};

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<LabelsMapResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { templateIds } = req.body as { templateIds?: number[] };
  if (!Array.isArray(templateIds) || templateIds.length === 0) {
    return res.status(400).json({ error: 'templateIds (number[]) is required' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch product templates with their labels (product_tag_ids)
    const templates = await odooClient.read<{
      id: number;
      product_tag_ids: number[];
    }>(
      user.uid,
      user.password,
      'product.template',
      templateIds,
      ['id', 'product_tag_ids']
    );

    // Get all unique label IDs
    const labelIds = new Set<number>();
    templates.forEach((tmpl) => {
      if (tmpl.product_tag_ids && Array.isArray(tmpl.product_tag_ids)) {
        tmpl.product_tag_ids.forEach((lid) => labelIds.add(lid));
      }
    });

    // Fetch label names
    const labelsMap = new Map<number, string>();
    if (labelIds.size > 0) {
      // Try different possible model names for product tags
      const possibleModels = ['product.tag', 'product.template.tag', 'base.tag'];
      let labels: Array<{ id: number; name: string }> = [];

      for (const modelName of possibleModels) {
        try {
          labels = await odooClient.searchRead<{ id: number; name: string }>(
            user.uid,
            user.password,
            modelName,
            [['id', 'in', Array.from(labelIds)]],
            ['id', 'name'],
            1000
          );
          if (labels.length > 0) {
            break; // Success, exit loop
          }
        } catch {
          continue; // Try next model
        }
      }

      labels.forEach((label) => {
        labelsMap.set(label.id, label.name);
      });
    }

    // Map template IDs to label names
    const result: LabelsMapResponse = {};
    templateIds.forEach((tmplId) => {
      result[tmplId] = [];
    });

    templates.forEach((tmpl) => {
      const tmplId = tmpl.id;
      if (tmpl.product_tag_ids && Array.isArray(tmpl.product_tag_ids)) {
        const labelNames = tmpl.product_tag_ids
          .map((lid) => labelsMap.get(lid))
          .filter((name): name is string => name !== undefined);
        result[tmplId] = labelNames;
      }
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});



