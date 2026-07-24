import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];
  if (kwargs) executeArgs.push(kwargs);

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'object', method: 'execute_kw', args: executeArgs },
    id: Date.now(),
  };

  const response = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

async function handler(
  req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const { brandName } = req.body as { brandName: string };

    if (!brandName) {
      return res.status(400).json({ error: 'Missing required parameters: brandName' });
    }

    
    const templates = await callOdoo(
      uid, password,
      'product.template',
      'search_read',
      [[['name', 'ilike', `${brandName} -`]]],
      { fields: ['id', 'name', 'description', 'image_128', 'create_date', 'is_favorite', 'website_published', 'product_variant_count'], limit: 500, order: 'create_date desc' }
    ) as Array<{ id: number; name: string; description: string; image_128: string | false; create_date: string; is_favorite: boolean; website_published: boolean; product_variant_count: number }>;

    // Fetch gallery images (product.image) for all templates in one call
    const templateIds = templates.map(t => t.id);
    const galleryImages = templateIds.length > 0
      ? await callOdoo(
          uid, password,
          'product.image',
          'search_read',
          [[['product_tmpl_id', 'in', templateIds]]],
          { fields: ['id', 'product_tmpl_id', 'name', 'image_128', 'sequence'], order: 'product_tmpl_id, sequence' }
        ) as Array<{ id: number; product_tmpl_id: [number, string]; name: string; image_128: string | false; sequence: number }>
      : [];

    const galleryByTemplate = new Map<number, Array<{ id: number; name: string; thumbnail: string; sequence: number }>>();
    for (const img of galleryImages) {
      const tmplId = Array.isArray(img.product_tmpl_id) ? img.product_tmpl_id[0] : img.product_tmpl_id;
      const list = galleryByTemplate.get(tmplId) || [];
      list.push({
        id: img.id,
        name: img.name,
        thumbnail: img.image_128 ? `data:image/png;base64,${img.image_128}` : '',
        sequence: img.sequence,
      });
      galleryByTemplate.set(tmplId, list);
    }

    const products = templates.map(t => ({
      template_id: t.id,
      internalRef: t.description || '',
      name: t.name,
      hasImage: !!t.image_128,
      mainThumbnail: t.image_128 ? `data:image/png;base64,${t.image_128}` : null,
      galleryImages: galleryByTemplate.get(t.id) || [],
      createDate: t.create_date,
      isFavorite: t.is_favorite,
      isPublished: t.website_published,
      variantCount: t.product_variant_count,
    }));

    return res.status(200).json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error) {
    console.error('Error searching products by brand:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}

export default withAuth(handler);
