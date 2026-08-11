import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import {
  extractBrandFromProductName,
  parseQuotationRef,
  sortQuotationLines,
} from '@/lib/quotationExport';

type SaleOrder = {
  id: number;
  name: string;
  partner_id?: [number, string] | false;
  amount_untaxed: number;
  amount_total: number;
  state: string;
};

type SaleOrderLine = {
  id: number;
  product_id?: [number, string] | false;
  name: string;
  product_uom_qty: number;
  price_unit: number;
  discount: number;
  price_subtotal: number;
};

type ProductRow = {
  id: number;
  product_tmpl_id?: [number, string] | false;
  barcode?: string | false;
  default_code?: string | false;
  display_name?: string;
};

type ExportLine = {
  brand: string;
  productName: string;
  barcode: string;
  defaultCode: string;
  quantity: number;
  uom: string;
  priceUnit: number;
  discount: number;
  subtotal: number;
};

type ApiResponse =
  | {
      success: true;
      order: {
        id: number;
        name: string;
        partner: string;
        state: string;
        amountUntaxed: number;
        amountTotal: number;
      };
      lines: ExportLine[];
    }
  | { error: string };

async function buildTemplateBrandMap(
  uid: number,
  password: string,
  templateIds: number[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!templateIds.length) return result;

  const attrs = await odooClient.searchRead<{ id: number }>(
    uid,
    password,
    'product.attribute',
    [['name', 'in', ['MERK', 'Merk 1']]],
    ['id'],
    10,
  );
  const merkIds = attrs.map((a) => a.id);
  if (!merkIds.length) return result;

  const brandValues = await odooClient.searchRead<{ id: number; name: string }>(
    uid,
    password,
    'product.attribute.value',
    [['attribute_id', 'in', merkIds]],
    ['id', 'name'],
    500,
  );
  const brandNames = new Map(brandValues.map((b) => [b.id, b.name]));

  const chunk = 500;
  for (let i = 0; i < templateIds.length; i += chunk) {
    const slice = templateIds.slice(i, i + chunk);
    const lines = await odooClient.searchRead<{
      product_tmpl_id: [number, string];
      value_ids?: number[];
    }>(
      uid,
      password,
      'product.template.attribute.line',
      [['attribute_id', 'in', merkIds], ['product_tmpl_id', 'in', slice]],
      ['product_tmpl_id', 'value_ids'],
      5000,
    );
    for (const line of lines) {
      if (!Array.isArray(line.product_tmpl_id)) continue;
      const tmplId = line.product_tmpl_id[0];
      if (result.has(tmplId)) continue;
      for (const vid of line.value_ids || []) {
        const name = brandNames.get(vid);
        if (name) {
          result.set(tmplId, name);
          break;
        }
      }
    }
  }
  return result;
}

async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const raw = typeof req.body?.ref === 'string' ? req.body.ref : '';
  const ref = parseQuotationRef(raw);
  if (!ref) {
    return res.status(400).json({
      error: 'Geef een offerte-URL, id (bv. 3167) of nummer (bv. S03167) op.',
    });
  }

  try {
    const { uid, password } = user;

    const domain =
      ref.kind === 'id'
        ? [['id', '=', ref.id]]
        : [['name', '=', ref.name]];

    const orders = await odooClient.searchRead<SaleOrder>(
      uid,
      password,
      'sale.order',
      domain,
      ['id', 'name', 'partner_id', 'amount_untaxed', 'amount_total', 'state'],
      1,
    );

    if (!orders.length) {
      return res.status(404).json({ error: `Offerte niet gevonden: ${raw.trim()}` });
    }

    const order = orders[0];
    const orderLines = await odooClient.searchRead<SaleOrderLine>(
      uid,
      password,
      'sale.order.line',
      [['order_id', '=', order.id], ['product_id', '!=', false]],
      [
        'id',
        'product_id',
        'name',
        'product_uom_qty',
        'price_unit',
        'discount',
        'price_subtotal',
      ],
      10000,
    );

    const productIds = Array.from(
      new Set(
        orderLines
          .map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : null))
          .filter((id): id is number => id != null),
      ),
    );

    const products =
      productIds.length > 0
        ? await odooClient.searchRead<ProductRow>(
            uid,
            password,
            'product.product',
            [['id', 'in', productIds]],
            ['id', 'product_tmpl_id', 'barcode', 'default_code', 'display_name'],
            productIds.length,
          )
        : [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const templateIds = Array.from(
      new Set(
        products
          .map((p) => (Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null))
          .filter((id): id is number => id != null),
      ),
    );
    const templateBrandMap = await buildTemplateBrandMap(uid, password, templateIds);

    const mapped: ExportLine[] = orderLines.map((line) => {
      const productId = Array.isArray(line.product_id) ? line.product_id[0] : null;
      const product = productId != null ? productMap.get(productId) : undefined;
      const tmplId = product && Array.isArray(product.product_tmpl_id)
        ? product.product_tmpl_id[0]
        : null;
      const productName = line.name
        || (Array.isArray(line.product_id) ? line.product_id[1] : '')
        || product?.display_name
        || '';
      const brandFromAttr = tmplId != null ? templateBrandMap.get(tmplId) : undefined;
      const brand = brandFromAttr || extractBrandFromProductName(productName) || 'Onbekend';

      return {
        brand,
        productName,
        barcode:
          product?.barcode && typeof product.barcode === 'string' ? product.barcode : '',
        defaultCode:
          product?.default_code && typeof product.default_code === 'string'
            ? product.default_code
            : '',
        quantity: line.product_uom_qty,
        uom: 'Stuks',
        priceUnit: line.price_unit,
        discount: line.discount,
        subtotal: line.price_subtotal,
      };
    });

    const lines = sortQuotationLines(mapped);

    return res.status(200).json({
      success: true,
      order: {
        id: order.id,
        name: order.name,
        partner: Array.isArray(order.partner_id) ? order.partner_id[1] : '',
        state: order.state,
        amountUntaxed: order.amount_untaxed,
        amountTotal: order.amount_total,
      },
      lines,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[quotation-export] ERROR:', message);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);
