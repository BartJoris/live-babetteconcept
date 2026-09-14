import type { NextApiResponse } from 'next';
import { findOrderShippingLabelAttachment } from '@/lib/order-attachments';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function odooCall<T>(params: {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}): Promise<T> {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [
        ODOO_DB,
        params.uid,
        params.password,
        params.model,
        params.method,
        params.args,
        params.kwargs || {},
      ],
    },
    id: Date.now(),
  };

  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(json.error.data?.message || json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const orderId = Number(req.body?.orderId);

    console.log('📦 Download Shipping Label Request - Order ID:', orderId);

    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const shippingLabel = await findOrderShippingLabelAttachment(
      odooCall,
      uid,
      password,
      orderId
    );

    if (!shippingLabel) {
      console.log('❌ No shipping label found for order', orderId);
      return res.status(404).json({
        error:
          'Geen verzendlabel gevonden. Controleer of Sendcloud het label heeft aangemaakt in Odoo.',
        checkedModels: ['sale.order', 'account.move', 'stock.picking'],
      });
    }

    console.log('✅ Found shipping label:', shippingLabel.attachment.name);
    console.log(`📦 Shipping label PDF size: ${shippingLabel.buffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${shippingLabel.attachment.name}"`
    );
    res.setHeader('Content-Length', shippingLabel.buffer.length);

    return res.status(200).send(shippingLabel.buffer);
  } catch (error) {
    console.error('Error downloading shipping label:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon verzendlabel niet downloaden',
    });
  }
}

export default withAuth(handler);
