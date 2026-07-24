import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqualString } from '@/lib/security/timingSafeEqualString';

const N8N_API_KEY = process.env.N8N_API_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only accept header — never query ?key= (ends up in access logs)
  const headerKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  let apiKey = '';
  if (typeof headerKey === 'string' && headerKey) {
    apiKey = headerKey;
  } else if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    apiKey = authHeader.slice(7).trim();
  }
  if (!N8N_API_KEY || !timingSafeEqualString(apiKey, N8N_API_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only expose boolean presence, not the actual values
  const keys = [
    'ODOO_URL',
    'ODOO_DB',
    'ODOO_USERNAME',
    'ODOO_API_KEY',
    'ODOO_MOLLIE_BANK_JOURNAL_ID',
    'N8N_API_KEY',
  ] as const;
  const presence: Record<string, boolean> = {};
  keys.forEach((k) => {
    presence[k] = Boolean(process.env[k]);
  });

  return res.status(200).json({ envLoaded: true, presence });
}


