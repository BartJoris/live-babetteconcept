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

    console.log('📦 Confirming delivery for order:', orderId);

    // Get related stock.picking (delivery) records
    const pickings = await odooCall<any[]>({
      uid,
      password,
      model: 'stock.picking',
      method: 'search_read',
      args: [[['sale_id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'state'],
      },
    });

    console.log(`✅ Found ${pickings.length} delivery orders:`, pickings.map(p => ({ id: p.id, name: p.name, state: p.state })));

    if (pickings.length === 0) {
      return res.status(404).json({ 
        error: 'Geen leveringsorder gevonden voor deze order' 
      });
    }

    // Confirm each picking (delivery order)
    const confirmedPickings = [];
    for (const picking of pickings) {
      // Check if picking needs to be confirmed (not already done or cancelled)
      if (picking.state !== 'done' && picking.state !== 'cancel') {
        console.log(`\n════════════════════════════════════════`);
        console.log(`📦 CONFIRMING PICKING ${picking.id}`);
        console.log(`   Name: ${picking.name}`);
        console.log(`   Current State: ${picking.state}`);
        console.log(`════════════════════════════════════════\n`);
        
        try {
          // Method 1: Try direct write to done state (simplest)
          console.log(`Attempting direct state change to 'done'...`);
          const writeResult = await odooCall<boolean>({
            uid,
            password,
            model: 'stock.picking',
            method: 'write',
            args: [[picking.id], { state: 'done' }],
          });
          
          console.log(`✅ Write result:`, writeResult);

          // Verify the state changed
          const verifyPicking = await odooCall<any[]>({
            uid,
            password,
            model: 'stock.picking',
            method: 'read',
            args: [[picking.id], ['state']],
          });

          const finalState = verifyPicking[0]?.state;
          console.log(`\n✅ FINAL STATE: ${finalState}\n`);

          confirmedPickings.push({
            id: picking.id,
            name: picking.name,
            success: true,
            finalState,
          });

        } catch (pickingErr) {
          console.error(`\n❌ ERROR confirming picking ${picking.id}:`, pickingErr);
          
          confirmedPickings.push({
            id: picking.id,
            name: picking.name,
            success: false,
            error: pickingErr instanceof Error ? pickingErr.message : 'Unknown error'
          });
        }
      } else {
        console.log(`Picking ${picking.id} already in state: ${picking.state} (no action needed)`);
        confirmedPickings.push({
          id: picking.id,
          name: picking.name,
          state: picking.state,
          alreadyConfirmed: true
        });
      }
    }

    // Check if at least one picking was successfully confirmed
    const hasSuccessfulConfirmation = confirmedPickings.some(p => p.success === true || p.alreadyConfirmed);

    if (!hasSuccessfulConfirmation && confirmedPickings.some(p => p.success === false)) {
      const errors = confirmedPickings.filter(p => p.error).map(p => `${p.name}: ${p.error}`);
      return res.status(400).json({ 
        error: 'Kon leveringsorder niet bevestigen',
        details: errors
      });
    }

    // Fetch updated order state
    const orders = await odooCall<any[]>({
      uid,
      password,
      model: 'sale.order',
      method: 'search_read',
      args: [[['id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'state'],
        limit: 1,
      },
    });

    console.log(`✅ Delivery confirmation completed for order ${orderId}`);

    return res.status(200).json({ 
      success: true,
      order: orders[0] || null,
      confirmedPickings,
      message: 'Leveringsorder bevestigd'
    });
  } catch (error) {
    console.error('Error confirming delivery:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon leveringsorder niet bevestigen' 
    });
  }
}
