import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type OdooRawProduct = {
  id: number;
  barcode: string | null;
  display_name: string;
  qty_available: number | null;
  list_price: number | null;
  standard_price: number | null;
  active: boolean;
  categ_id: [number, string] | number | null;
  default_code?: string | null;
  name?: string | null;
};

export type ProductSearchItem = {
  id: number;
  barcode: string | null;
  name: string;
  categId: number | null;
  categName: string | null;
  qtyAvailable: number | null;
  listPrice: number | null;
  standardPrice: number | null;
  active: boolean;
};

function toItem(p: OdooRawProduct): ProductSearchItem {
  const categId = Array.isArray(p.categ_id) ? p.categ_id[0] : (typeof p.categ_id === 'number' ? p.categ_id : null);
  const categName = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
  return {
    id: p.id,
    barcode: p.barcode ?? null,
    name: p.display_name,
    categId,
    categName,
    qtyAvailable: p.qty_available ?? null,
    listPrice: p.list_price ?? null,
    standardPrice: p.standard_price ?? null,
    active: !!p.active,
  };
}

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ProductSearchItem[] | { error: string }>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const qraw = req.query.q;
  const q = Array.isArray(qraw) ? qraw[0] : qraw;
  const includeArchived = String(req.query.includeArchived || 'false') === 'true';
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'q query param is required' });
  }
  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fields = ['id','barcode','display_name','categ_id','qty_available','list_price','standard_price','active','default_code','name'];
    const domain: unknown[] = [
      '|', '|', '|',
      ['display_name', 'ilike', q],
      ['barcode', 'ilike', q],
      ['default_code', 'ilike', q],
      ['name', 'ilike', q],
    ];

    // Use low-level call to pass context + limit/order
    const products = await odooClient.call<OdooRawProduct[]>({
      uid: user.uid,
      password: user.password,
      model: 'product.product',
      method: 'search_read',
      args: [domain],
      kwargs: {
        fields,
        limit: 20,
        order: 'display_name asc',
        ...(includeArchived ? { context: { active_test: false } } : {}),
      },
    });

    return res.status(200).json(products.map(toItem));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});



