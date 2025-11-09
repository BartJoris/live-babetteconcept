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

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    console.log('📮 Sending to shipper (Sendcloud) for order:', orderId);

    // Get related stock.picking (delivery) records
    const pickings = await odooCall<any[]>({
      uid,
      password,
      model: 'stock.picking',
      method: 'search_read',
      args: [[['sale_id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'state', 'carrier_id'],
      },
    });

    console.log(`✅ Found ${pickings.length} picking(s):`, pickings);

    if (pickings.length === 0) {
      return res.status(404).json({ 
        error: 'Geen leveringsorder gevonden' 
      });
    }

    // Send each picking to shipper (Sendcloud)
    const sentPickings = [];
    for (const picking of pickings) {
      console.log(`\n═══════════════════════════════════════`);
      console.log(`📮 SENDING TO SHIPPER: ${picking.id}`);
      console.log(`   Name: ${picking.name}`);
      console.log(`   State: ${picking.state}`);
      console.log(`═══════════════════════════════════════\n`);

      try {
        // Try the Sendcloud-specific method first
        console.log(`Attempting action_send_to_shipper...`);
        const sendResult = await odooCall<any>({
          uid,
          password,
          model: 'stock.picking',
          method: 'action_send_to_shipper',
          args: [[picking.id]],
        });

        console.log(`✅ Sent to shipper result:`, sendResult);

        sentPickings.push({
          id: picking.id,
          name: picking.name,
          success: true,
          result: sendResult
        });

      } catch {
        console.warn(`⚠️ action_send_to_shipper failed, trying alternatives...`);

        // Try alternative method names
        const alternativeMethods = [
          'send_to_shipper',
          'action_generate_carrier_label',
          'generate_carrier_label',
          'send_to_carrier'
        ];

        let methodSucceeded = false;

        for (const method of alternativeMethods) {
          try {
            console.log(`Trying ${method}...`);
            const altResult = await odooCall<any>({
              uid,
              password,
              model: 'stock.picking',
              method,
              args: [[picking.id]],
            });

            console.log(`✅ ${method} succeeded:`, altResult);
            sentPickings.push({
              id: picking.id,
              name: picking.name,
              success: true,
              method,
              result: altResult
            });
            methodSucceeded = true;
            break;
          } catch {
            console.log(`❌ ${method} failed`);
            continue;
          }
        }

        if (!methodSucceeded) {
          console.error(`❌ All methods failed for picking ${picking.id}`);
          sentPickings.push({
            id: picking.id,
            name: picking.name,
            success: false,
            error: 'Kon niet naar verzender sturen - geen werkende methode gevonden'
          });
        }
      }
    }

    // Check if at least one picking was sent
    const hasSuccess = sentPickings.some(p => p.success === true);

    if (!hasSuccess) {
      const errors = sentPickings.filter(p => p.error).map(p => `${p.name}: ${p.error}`);
      return res.status(400).json({ 
        error: 'Kon niet naar verzender sturen',
        details: errors
      });
    }

    console.log(`✅ Send to shipper completed for order ${orderId}`);

    return res.status(200).json({ 
      success: true,
      orderId,
      sentPickings,
      message: 'Verzonden naar verzender (Sendcloud)'
    });
  } catch (error) {
    console.error('Error sending to shipper:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon niet naar verzender sturen' 
    });
  }
}


