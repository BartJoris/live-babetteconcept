import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface ProductCheckItem {
  id: number;
  name: string;
  defaultCode: string | null;
  brand: string | null;
  hasMainImage: boolean;
  imageCount: number;
  hasDescription: boolean;
  description: string | null;
  weight: number;
  tags: string[];
  tagIds: number[];
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ProductCheckItem[] | { error: string }>
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
      description_ecommerce: string | false;
      weight: number;
      product_tag_ids: number[];
    }>(
      user.uid,
      user.password,
      'product.template',
      [['website_published', '=', true]],
      ['id', 'name', 'default_code', 'description_ecommerce', 'weight', 'product_tag_ids']
    );

    if (templates.length === 0) {
      return res.status(200).json([]);
    }

    const templateIds = templates.map((t) => t.id);

    // Check which templates have a main image (IDs only, no binary data)
    const templatesWithImage = await odooClient.search(
      user.uid,
      user.password,
      'product.template',
      [['id', 'in', templateIds], ['image_1920', '!=', false]]
    );
    const hasImageSet = new Set(templatesWithImage);

    // Resolve brands via MERK attribute
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

    // Fetch variant weights as fallback (weight is often only set on product.product)
    const variants = await odooClient.searchRead<{
      id: number;
      product_tmpl_id: [number, string] | number;
      weight: number;
    }>(
      user.uid,
      user.password,
      'product.product',
      [['product_tmpl_id', 'in', templateIds]],
      ['id', 'product_tmpl_id', 'weight'],
      100000
    );

    const variantWeightMap: Record<number, number> = {};
    variants.forEach((v) => {
      const tmplId = Array.isArray(v.product_tmpl_id)
        ? v.product_tmpl_id[0]
        : v.product_tmpl_id;
      const w = v.weight || 0;
      if (w > (variantWeightMap[tmplId] || 0)) {
        variantWeightMap[tmplId] = w;
      }
    });

    // Count gallery images per template
    const galleryImages = await odooClient.searchRead<{
      id: number;
      product_tmpl_id: [number, string] | number;
    }>(
      user.uid,
      user.password,
      'product.image',
      [['product_tmpl_id', 'in', templateIds]],
      ['id', 'product_tmpl_id'],
      100000
    );

    const imageCountMap: Record<number, number> = {};
    galleryImages.forEach((img) => {
      const tmplId = Array.isArray(img.product_tmpl_id)
        ? img.product_tmpl_id[0]
        : img.product_tmpl_id;
      imageCountMap[tmplId] = (imageCountMap[tmplId] || 0) + 1;
    });

    // Resolve tag names
    const allTagIds = new Set<number>();
    templates.forEach((t) => {
      if (t.product_tag_ids && Array.isArray(t.product_tag_ids)) {
        t.product_tag_ids.forEach((tid) => allTagIds.add(tid));
      }
    });

    const tagNameMap = new Map<number, string>();
    if (allTagIds.size > 0) {
      const possibleModels = ['product.tag', 'product.template.tag', 'base.tag'];
      for (const modelName of possibleModels) {
        try {
          const tags = await odooClient.searchRead<{ id: number; name: string }>(
            user.uid,
            user.password,
            modelName,
            [['id', 'in', Array.from(allTagIds)]],
            ['id', 'name'],
            1000
          );
          if (tags.length > 0) {
            tags.forEach((tag) => tagNameMap.set(tag.id, tag.name));
            break;
          }
        } catch {
          continue;
        }
      }
    }

    const result: ProductCheckItem[] = templates.map((t) => {
      const hasMainImage = hasImageSet.has(t.id);
      const galleryCount = imageCountMap[t.id] || 0;

      return {
        id: t.id,
        name: t.name || '',
        defaultCode: t.default_code || null,
        brand: brandMap[t.id] ?? null,
        hasMainImage,
        imageCount: (hasMainImage ? 1 : 0) + galleryCount,
        hasDescription: !!t.description_ecommerce && t.description_ecommerce.trim().length > 0,
        description: t.description_ecommerce ? t.description_ecommerce.trim() : null,
        weight: t.weight || variantWeightMap[t.id] || 0,
        tags: (t.product_tag_ids || []).map((tid) => tagNameMap.get(tid) || `Tag ${tid}`),
        tagIds: t.product_tag_ids || [],
      };
    });

    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching products for check:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
