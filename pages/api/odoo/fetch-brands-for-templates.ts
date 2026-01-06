import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type BrandMapResponse = {
  [productTmplId: number]: string | null;
};

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<BrandMapResponse | { error: string }>
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

    // Step 1: Get MERK and Merk 1 attributes
    const merkAttributes = await odooClient.searchRead<{ id: number; name: string }>(
      user.uid,
      user.password,
      'product.attribute',
      [['name', 'in', ['MERK', 'Merk 1']]],
      ['id', 'name'],
      10
    );

    if (!merkAttributes || merkAttributes.length === 0) {
      // Return empty map if no merk attributes found
      return res.status(200).json({});
    }

    const merkAttributeIds = merkAttributes.map((attr) => attr.id);

    // Step 2: Get attribute lines for these templates and merk attributes
    const attributeLines = await odooClient.searchRead<{
      id: number;
      product_tmpl_id: [number, string];
      attribute_id: [number, string];
      value_ids: number[];
    }>(
      user.uid,
      user.password,
      'product.template.attribute.line',
      [
        ['product_tmpl_id', 'in', templateIds],
        ['attribute_id', 'in', merkAttributeIds],
      ],
      ['id', 'product_tmpl_id', 'attribute_id', 'value_ids'],
      10000
    );

    // Step 3: Get brand values
    const brandValueIds = new Set<number>();
    attributeLines.forEach((line) => {
      if (line.value_ids && line.value_ids.length > 0) {
        line.value_ids.forEach((vid) => brandValueIds.add(vid));
      }
    });

    const brandValuesMap = new Map<number, string>();
    if (brandValueIds.size > 0) {
      const brandValues = await odooClient.searchRead<{
        id: number;
        name: string;
      }>(
        user.uid,
        user.password,
        'product.attribute.value',
        [['id', 'in', Array.from(brandValueIds)]],
        ['id', 'name'],
        1000
      );

      brandValues.forEach((bv) => {
        brandValuesMap.set(bv.id, bv.name);
      });
    }

    // Step 4: Map template IDs to brand names
    const result: BrandMapResponse = {};
    templateIds.forEach((tmplId) => {
      result[tmplId] = null;
    });

    attributeLines.forEach((line) => {
      const tmplId = Array.isArray(line.product_tmpl_id) ? line.product_tmpl_id[0] : line.product_tmpl_id;
      if (line.value_ids && line.value_ids.length > 0) {
        const brandValueId = line.value_ids[0]; // Take first brand value
        const brandName = brandValuesMap.get(brandValueId);
        if (brandName) {
          result[tmplId] = brandName;
        }
      }
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});





