import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

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
    throw new Error(json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;
    const { orderId } = req.body;

    console.log('📄 Download Invoice Request - Order ID:', orderId);

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Fetch all PDF attachments for this order
    console.log('Searching for attachments on sale.order', orderId);
    const attachments = await odooCall<any[]>({
      uid,
      password,
      model: 'ir.attachment',
      method: 'search_read',
      args: [
        [
          ['res_model', '=', 'sale.order'],
          ['res_id', '=', orderId],
          ['mimetype', '=', 'application/pdf'],
        ],
      ],
      kwargs: {
        fields: ['id', 'name', 'datas'],
        order: 'create_date desc',
      },
    });

    console.log(`✅ Found ${attachments.length} PDF attachments:`, attachments.map(a => a.name));

    // Find invoice - look for order/invoice/factuur but NOT shipping/sendcloud
    const invoice = attachments.find(a => {
      const name = a.name.toLowerCase();
      return (
        (name.includes('order') || 
         name.includes('invoice') ||
         name.includes('factuur') ||
         name.startsWith('order - ')) &&
        !name.includes('shipping') && 
        !name.includes('sendcloud') &&
        !name.includes('label')
      );
    });

    if (!invoice || !invoice.datas) {
      console.log('❌ No invoice found. Available attachments:', attachments.map(a => a.name));
      return res.status(404).json({ 
        error: 'Geen factuur gevonden. Bevestig de order eerst.',
        availableAttachments: attachments.map(a => a.name)
      });
    }

    console.log('✅ Found invoice:', invoice.name);

    // Convert base64 to PDF buffer
    const pdfBuffer = Buffer.from(invoice.datas, 'base64');
    console.log(`📄 Invoice PDF size: ${pdfBuffer.length} bytes`);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.name}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon factuur niet downloaden' 
    });
  }
}

