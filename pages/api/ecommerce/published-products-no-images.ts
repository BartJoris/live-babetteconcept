import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface ProductNoImage {
  id: number;
  name: string;
  defaultCode: string | null;
  brand: string | null;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ProductNoImage[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const templates = await odooClient.searchRead<{
      id: number;
      name: string;
      default_code: string | false;
    }>(
      user.uid,
      user.password,
      'product.template',
      [
        ['website_published', '=', true],
        ['image_1920', '=', false],
      ],
      ['id', 'name', 'default_code']
    );

    if (templates.length === 0) {
      return res.status(200).json([]);
    }

    const templateIds = templates.map((t) => t.id);

    // Fetch brand names via MERK attribute
    const merkAttributes = await odooClient.searchRead<{ id: number; name: string }>(
      user.uid,
      user.password,
      'product.attribute',
      [['name', 'in', ['MERK', 'Merk 1']]],
      ['id', 'name'],
      10
    );

    const brandMap: Record<number, string | null> = {};
    templateIds.forEach((id) => { brandMap[id] = null; });

    if (merkAttributes.length > 0) {
      const merkAttributeIds = merkAttributes.map((a) => a.id);

      const attributeLines = await odooClient.searchRead<{
        id: number;
        product_tmpl_id: [number, string];
        value_ids: number[];
      }>(
        user.uid,
        user.password,
        'product.template.attribute.line',
        [
          ['product_tmpl_id', 'in', templateIds],
          ['attribute_id', 'in', merkAttributeIds],
        ],
        ['id', 'product_tmpl_id', 'value_ids'],
        10000
      );

      const brandValueIds = new Set<number>();
      attributeLines.forEach((line) => {
        line.value_ids?.forEach((vid) => brandValueIds.add(vid));
      });

      if (brandValueIds.size > 0) {
        const brandValues = await odooClient.searchRead<{ id: number; name: string }>(
          user.uid,
          user.password,
          'product.attribute.value',
          [['id', 'in', Array.from(brandValueIds)]],
          ['id', 'name'],
          1000
        );

        const brandValuesMap = new Map<number, string>();
        brandValues.forEach((bv) => brandValuesMap.set(bv.id, bv.name));

        attributeLines.forEach((line) => {
          const tmplId = Array.isArray(line.product_tmpl_id)
            ? line.product_tmpl_id[0]
            : line.product_tmpl_id;
          if (line.value_ids?.length > 0) {
            const brandName = brandValuesMap.get(line.value_ids[0]);
            if (brandName) brandMap[tmplId] = brandName;
          }
        });
      }
    }

    const result: ProductNoImage[] = templates.map((t) => ({
      id: t.id,
      name: t.name || '',
      defaultCode: t.default_code || null,
      brand: brandMap[t.id] ?? null,
    }));

    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching published products without images:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
