import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import { odooCallSchema } from '@/lib/validation/product';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    // Validate input
    const validation = odooCallSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues,
      });
    }

    const { model, method, args, kwargs } = validation.data;

    // Get credentials from session
    const { uid, password } = req.session.user!;

    // Make Odoo call using centralized client
    const result = await odooClient.call({
      uid,
      password,
      model,
      method,
      args,
      kwargs,
    });

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Odoo call error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Odoo request failed';
    return res.status(500).json({ success: false, error: errorMessage });
  }
}

export default withAuth(handler);
