import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface ProductVariant {
  id: number;
  name: string;
  display_name: string;
  qty_available: number;
  barcode: string | null;
  default_code: string | null;
  list_price: number;
  standard_price: number;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<{ variants: ProductVariant[] } | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const templateIdRaw = req.query.templateId;
    const templateId = Array.isArray(templateIdRaw)
      ? parseInt(templateIdRaw[0])
      : parseInt(templateIdRaw as string);

    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'templateId query parameter is required' });
    }

    // Haal alle varianten op voor dit template
    const variants = await odooClient.searchRead<ProductVariant>(
      user.uid,
      user.password,
      'product.product',
      [['product_tmpl_id', '=', templateId]],
      [
        'id',
        'name',
        'display_name',
        'qty_available',
        'barcode',
        'default_code',
        'list_price',
        'standard_price',
      ]
    );

    return res.status(200).json({ variants });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching template variants:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

