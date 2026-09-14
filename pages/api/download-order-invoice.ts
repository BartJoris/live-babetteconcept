import type { NextApiResponse } from 'next';
import { findOrderInvoiceAttachment } from '@/lib/order-attachments';
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

    console.log('📄 Download Invoice Request - Order ID:', orderId);

    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const invoice = await findOrderInvoiceAttachment(odooCall, uid, password, orderId);

    if (!invoice) {
      console.log('❌ No invoice found for order', orderId);
      return res.status(404).json({
        error: 'Geen factuur gevonden. Bevestig de order eerst.',
      });
    }

    console.log('✅ Found invoice:', invoice.attachment.name);
    console.log(`📄 Invoice PDF size: ${invoice.buffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.attachment.name}"`);
    res.setHeader('Content-Length', invoice.buffer.length);

    return res.status(200).send(invoice.buffer);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon factuur niet downloaden',
    });
  }
}

export default withAuth(handler);
