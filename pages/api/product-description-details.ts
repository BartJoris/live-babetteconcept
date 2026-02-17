import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

export interface ProductDescriptionDetail {
  id: number;
  name: string;
  default_code: string | null;
  brand: string | null;
  description_ecommerce: string | null;
  sizeAttribute: string | null;
}

const MAAT_ATTRIBUTES = ["MAAT Baby's", 'MAAT Kinderen', 'MAAT Tieners', 'MAAT Volwassenen'];

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ success: true; products: ProductDescriptionDetail[] } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { templateIds } = req.body as { templateIds?: number[] };
  if (!Array.isArray(templateIds) || templateIds.length === 0) {
    return res.status(400).json({ error: 'templateIds (number[]) is required' });
  }

  try {
    const { uid, password } = req.session.user!;

    // 1. Fetch templates: id, name, default_code, description_ecommerce, attribute_line_ids
    const templates = await odooClient.searchRead<{
      id: number;
      name: string;
      default_code: string | null;
      description_ecommerce: string | false | null;
      attribute_line_ids: number[];
    }>(
      uid,
      password,
      'product.template',
      [['id', 'in', templateIds]],
      ['id', 'name', 'default_code', 'description_ecommerce', 'attribute_line_ids'],
      templateIds.length
    );

    if (!templates || templates.length === 0) {
      return res.status(200).json({ success: true, products: [] });
    }

    // 2. Get MERK / Merk 1 attribute IDs
    const merkAttributes = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.attribute',
      [['name', 'in', ['MERK', 'Merk 1']]],
      ['id', 'name'],
      10
    );
    const merkAttributeIds = merkAttributes?.map((a) => a.id) ?? [];

    const attributeLinesForBrand =
      merkAttributeIds.length > 0
        ? await odooClient.searchRead<{
            id: number;
            product_tmpl_id: [number, string];
            attribute_id: [number, string];
            value_ids: number[];
          }>(
            uid,
            password,
            'product.template.attribute.line',
            [
              ['product_tmpl_id', 'in', templateIds],
              ['attribute_id', 'in', merkAttributeIds],
            ],
            ['id', 'product_tmpl_id', 'attribute_id', 'value_ids'],
            10000
          )
        : [];

    const brandValueIds = new Set<number>();
    attributeLinesForBrand.forEach((line) => {
      if (line.value_ids?.length) line.value_ids.forEach((id) => brandValueIds.add(id));
    });

    const brandNames = new Map<number, string>();
    if (brandValueIds.size > 0) {
      const brandValues = await odooClient.searchRead<{ id: number; name: string }>(
        uid,
        password,
        'product.attribute.value',
        [['id', 'in', Array.from(brandValueIds)]],
        ['id', 'name'],
        1000
      );
      brandValues.forEach((bv) => brandNames.set(bv.id, bv.name));
    }

    const templateToBrand = new Map<number, string>();
    attributeLinesForBrand.forEach((line) => {
      const tmplId = Array.isArray(line.product_tmpl_id) ? line.product_tmpl_id[0] : line.product_tmpl_id;
      if (line.value_ids?.length && line.value_ids[0]) {
        const name = brandNames.get(line.value_ids[0]);
        if (name) templateToBrand.set(tmplId, name);
      }
    });

    // 3. Fetch attribute lines for MAAT (size attribute)
    const allAttributeLineIds = templates.flatMap((t) => t.attribute_line_ids || []);
    if (allAttributeLineIds.length === 0) {
      const products: ProductDescriptionDetail[] = templates.map((t) => ({
        id: t.id,
        name: t.name,
        default_code: t.default_code ?? null,
        brand: templateToBrand.get(t.id) ?? null,
        description_ecommerce:
          t.description_ecommerce && typeof t.description_ecommerce === 'string'
            ? t.description_ecommerce
            : null,
        sizeAttribute: null,
      }));
      return res.status(200).json({ success: true, products });
    }

    const attributeLines = await odooClient.read<{
      id: number;
      product_tmpl_id: [number, string];
      attribute_id: [number, string];
    }>(
      uid,
      password,
      'product.template.attribute.line',
      allAttributeLineIds,
      ['product_tmpl_id', 'attribute_id']
    );

    const templateToSizeAttribute = new Map<number, string>();
    attributeLines.forEach((line) => {
      const tmplId = Array.isArray(line.product_tmpl_id) ? line.product_tmpl_id[0] : line.product_tmpl_id;
      const attrName = Array.isArray(line.attribute_id) ? line.attribute_id[1] : null;
      if (attrName && MAAT_ATTRIBUTES.includes(attrName) && !templateToSizeAttribute.has(tmplId)) {
        templateToSizeAttribute.set(tmplId, attrName);
      }
    });

    const products: ProductDescriptionDetail[] = templates.map((t) => ({
      id: t.id,
      name: t.name,
      default_code: t.default_code ?? null,
      brand: templateToBrand.get(t.id) ?? null,
      description_ecommerce:
        t.description_ecommerce && typeof t.description_ecommerce === 'string'
          ? t.description_ecommerce
          : null,
      sizeAttribute: templateToSizeAttribute.get(t.id) ?? null,
    }));

    return res.status(200).json({ success: true, products });
  } catch (err) {
    console.error('product-description-details error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
