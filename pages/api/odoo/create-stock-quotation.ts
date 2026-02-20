import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type OrderLine = {
  productId: number;
  name: string;
  quantity: number;
  priceUnit: number;
  discount: number;
};

type RequestBody = {
  partnerId: number;
  lines: OrderLine[];
};

type ApiResponse =
  | { success: true; orderId: number; orderName: string }
  | { error: string };

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body as RequestBody;

    if (!body.partnerId || !Array.isArray(body.lines) || body.lines.length === 0) {
      return res.status(400).json({ error: 'partnerId and non-empty lines array are required' });
    }

    const orderId = await odooClient.create(
      user.uid,
      user.password,
      'sale.order',
      {
        partner_id: body.partnerId,
        note: 'Stock verkoop - vorige collectie aan 20% van verkoopprijs',
      }
    );

    for (const line of body.lines) {
      await odooClient.create(
        user.uid,
        user.password,
        'sale.order.line',
        {
          order_id: orderId,
          product_id: line.productId,
          name: line.name,
          product_uom_qty: line.quantity,
          price_unit: line.priceUnit,
          discount: line.discount,
        }
      );
    }

    const orders = await odooClient.read<{ id: number; name: string }>(
      user.uid,
      user.password,
      'sale.order',
      [orderId],
      ['id', 'name']
    );

    const orderName = orders && orders.length > 0 ? orders[0].name : `SO-${orderId}`;

    return res.status(200).json({
      success: true,
      orderId,
      orderName,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
