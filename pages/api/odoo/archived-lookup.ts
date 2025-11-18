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
};

export type OdooMatch = {
  id: number;
  barcode: string | null;
  name: string;
  categId: number | null;
  categName: string | null;
  qtyAvailable: number | null;
  listPrice: number | null;
  standardPrice: number | null;
};

function toMatch(p: OdooRawProduct): OdooMatch {
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
  };
}

async function searchReadWithContext(
  uid: number,
  password: string,
  model: string,
  domain: unknown[],
  fields: string[],
  context?: Record<string, unknown>
) {
  return odooClient.call<OdooRawProduct[]>({
    uid,
    password,
    model,
    method: 'search_read',
    args: [domain],
    kwargs: {
      fields,
      ...(context ? { context } : {}),
    },
  });
}

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<OdooMatch | null | { error: string }>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const raw = req.query.barcode;
  const barcode = Array.isArray(raw) ? raw[0] : raw;
  if (!barcode || typeof barcode !== 'string' || !barcode.trim()) {
    return res.status(400).json({ error: 'barcode query param is required' });
  }
  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const fields = ['id','barcode','display_name','categ_id','qty_available','list_price','standard_price','active'];
    const products = await searchReadWithContext(
      user.uid,
      user.password,
      'product.product',
      [['barcode', '=', String(barcode)], ['active', '=', false]],
      fields,
      { active_test: false }
    );
    const prod = products && products.length > 0 ? products[0] : null;
    return res.status(200).json(prod ? toMatch(prod) : null);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});



