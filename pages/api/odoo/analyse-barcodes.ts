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
  product_tmpl_id: [number, string] | number | null;
};

type OdooMatch = {
  id: number;
  barcode: string | null;
  name: string;
  categId: number | null;
  categName: string | null;
  qtyAvailable: number | null;
  listPrice: number | null;
  standardPrice: number | null;
  productTmplId: number | null;
};

type AnalyseApiItem = {
  barcode: string;
  active: OdooMatch | null;
  archived: OdooMatch | null;
};

function toMatch(p: OdooRawProduct): OdooMatch {
  const categId = Array.isArray(p.categ_id) ? p.categ_id[0] : (typeof p.categ_id === 'number' ? p.categ_id : null);
  const categName = Array.isArray(p.categ_id) ? p.categ_id[1] : null;
  const productTmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : (typeof p.product_tmpl_id === 'number' ? p.product_tmpl_id : null);
  return {
    id: p.id,
    barcode: p.barcode ?? null,
    name: p.display_name,
    categId,
    categName,
    qtyAvailable: p.qty_available ?? null,
    listPrice: p.list_price ?? null,
    standardPrice: p.standard_price ?? null,
    productTmplId,
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
  // Use low-level call to pass context explicitly
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

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<AnalyseApiItem[] | { error: string }>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { barcodes, mode } = req.body as { barcodes?: string[]; mode?: 'activeOnly' | 'activeAndArchived' };
  if (!Array.isArray(barcodes) || barcodes.length === 0) {
    return res.status(400).json({ error: 'barcodes (string[]) is required' });
  }
  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const fields = ['id','barcode','display_name','categ_id','qty_available','list_price','standard_price','active','product_tmpl_id'];

    // Batch to avoid large payloads
    const chunkSize = 100;
    const activeMap = new Map<string, OdooMatch>();
    const archivedMap = new Map<string, OdooMatch>();

    for (let i = 0; i < barcodes.length; i += chunkSize) {
      const slice = barcodes.slice(i, i + chunkSize);
      // Active first
      const actives = await searchReadWithContext(
        user.uid,
        user.password,
        'product.product',
        [['barcode','in', slice]],
        fields
      );
      for (const p of actives) {
        if (p.barcode) activeMap.set(p.barcode, toMatch(p));
      }
      if (mode !== 'activeOnly') {
        // Prepare missing for archived
        const missing = slice.filter(bc => !activeMap.has(bc));
        if (missing.length > 0) {
          const archived = await searchReadWithContext(
            user.uid,
            user.password,
            'product.product',
            [['barcode','in', missing], ['active', '=', false]],
            fields,
            { active_test: false }
          );
          for (const p of archived) {
            if (p.barcode) archivedMap.set(p.barcode, toMatch(p));
          }
        }
      }      
    }

    const response: AnalyseApiItem[] = barcodes.map(bc => ({
      barcode: bc,
      active: activeMap.get(bc) ?? null,
      archived: archivedMap.get(bc) ?? null,
    }));

    return res.status(200).json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});


