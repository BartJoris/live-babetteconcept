import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface ProductMissingWeight {
  id: number;
  name: string;
  display_name: string;
  product_tmpl_id?: [number, string];
  weight: number | null;
  barcode: string | null;
  default_code: string | null;
  qty_available?: number;
  list_price: number;
  type: 'variant' | 'template';
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ProductMissingWeight[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Haal eerst alle product templates op die gepubliceerd zijn
    const publishedTemplates = await odooClient.searchRead<{
      id: number;
      name: string;
    }>(
      user.uid,
      user.password,
      'product.template',
      [['website_published', '=', true]],
      ['id', 'name']
    );

    const templateIds = publishedTemplates.map((t) => t.id);

    if (templateIds.length === 0) {
      return res.status(200).json([]);
    }

    // Haal alle product varianten op voor gepubliceerde templates
    // We controleren het gewicht op variant niveau, niet template niveau
    const products = await odooClient.searchRead<{
      id: number;
      name: string;
      display_name: string;
      product_tmpl_id: [number, string];
      weight: number | null;
      barcode: string | null;
      default_code: string | null;
      qty_available: number;
      list_price: number;
    }>(
      user.uid,
      user.password,
      'product.product',
      [['product_tmpl_id', 'in', templateIds]],
      [
        'id',
        'name',
        'display_name',
        'product_tmpl_id',
        'weight',
        'barcode',
        'default_code',
        'qty_available',
        'list_price',
      ]
    );

    // Filter varianten zonder gewicht of met gewicht 0
    // Dit zijn de varianten die daadwerkelijk verzonden worden
    const productsWithoutWeight = products.filter(
      (p) => !p.weight || p.weight === 0
    );

    // Converteer naar ProductMissingWeight formaat
    const result: ProductMissingWeight[] = productsWithoutWeight.map((p) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name,
      product_tmpl_id: p.product_tmpl_id,
      weight: p.weight,
      barcode: p.barcode,
      default_code: p.default_code,
      qty_available: p.qty_available,
      list_price: p.list_price,
      type: 'variant' as const,
    }));

    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching products missing weight:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

