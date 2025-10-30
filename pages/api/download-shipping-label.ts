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

    console.log('📦 Download Shipping Label Request - Order ID:', orderId);

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // First, try to find attachments on the sale order
    console.log('Step 1: Searching for attachments on sale.order', orderId);
    let attachments = await odooCall<any[]>({
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
        fields: ['id', 'name', 'datas', 'res_model', 'res_id'],
        order: 'create_date desc',
      },
    });

    console.log(`✅ Found ${attachments.length} attachments on sale.order ${orderId}:`, 
      attachments.map(a => a.name));

    // If no shipping label on sale.order, check the related stock.picking (delivery order)
    let shippingLabel = attachments.find(a => {
      const name = a.name.toLowerCase();
      return (
        name.includes('shipping') ||
        name.includes('sendcloud') ||
        name.includes('label') ||
        name.includes('verzending')
      );
    });

    // If not found on sale order, check delivery orders
    if (!shippingLabel) {
      console.log('Step 2: No label on sale.order, checking stock.picking records...');
      
      // Get related stock.picking records
      const pickings = await odooCall<any[]>({
        uid,
        password,
        model: 'stock.picking',
        method: 'search_read',
        args: [[['sale_id', '=', orderId]]],
        kwargs: {
          fields: ['id', 'name'],
        },
      });

      console.log(`✅ Found ${pickings.length} delivery orders for sale order ${orderId}:`,
        pickings.map(p => ({ id: p.id, name: p.name })));

      // Search attachments on all related pickings
      for (const picking of pickings) {
        console.log(`Checking attachments on stock.picking ${picking.id} (${picking.name})...`);
        const pickingAttachments = await odooCall<any[]>({
          uid,
          password,
          model: 'ir.attachment',
          method: 'search_read',
          args: [
            [
              ['res_model', '=', 'stock.picking'],
              ['res_id', '=', picking.id],
              ['mimetype', '=', 'application/pdf'],
            ],
          ],
          kwargs: {
            fields: ['id', 'name', 'datas'],
            order: 'create_date desc',
          },
        });

        console.log(`✅ Found ${pickingAttachments.length} attachments on stock.picking ${picking.id}:`,
          pickingAttachments.map(a => a.name));
        attachments = [...attachments, ...pickingAttachments];

        // Look for shipping label
        const label = pickingAttachments.find(a => {
          const name = a.name.toLowerCase();
          return (
            name.includes('shipping') ||
            name.includes('sendcloud') ||
            name.includes('label') ||
            name.includes('verzending')
          );
        });

        if (label) {
          console.log('✅ Found shipping label:', label.name);
          shippingLabel = label;
          break;
        }
      }
    }

    if (!shippingLabel || !shippingLabel.datas) {
      console.log('❌ No shipping label found!');
      console.log('All available attachments:', attachments.map(a => ({ name: a.name, model: a.res_model })));
      return res.status(404).json({ 
        error: 'Geen verzendlabel gevonden. Controleer of Sendcloud het label heeft aangemaakt in Odoo.',
        availableAttachments: attachments.map(a => a.name),
        checkedModels: ['sale.order', 'stock.picking']
      });
    }

    // Convert base64 to PDF buffer
    const pdfBuffer = Buffer.from(shippingLabel.datas, 'base64');
    console.log(`📦 Shipping label PDF size: ${pdfBuffer.length} bytes`);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${shippingLabel.name}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log('✅ Sending shipping label PDF');
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading shipping label:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon verzendlabel niet downloaden' 
    });
  }
}

