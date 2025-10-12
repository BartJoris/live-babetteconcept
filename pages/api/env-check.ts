import type { NextApiRequest, NextApiResponse } from 'next';

const N8N_API_KEY = process.env.N8N_API_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (req.headers['x-api-key'] as string) || (req.query.key as string) || '';
  // Debug logs for local dev: presence only, not values
  console.log('env-check: hasN8nKeyEnv=', Boolean(N8N_API_KEY), 'hasHeader=', Boolean(apiKey));
  if (!N8N_API_KEY || apiKey !== N8N_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only expose boolean presence, not the actual values
  const keys = ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY', 'N8N_API_KEY'] as const;
  const presence: Record<string, boolean> = {};
  keys.forEach((k) => {
    presence[k] = Boolean(process.env[k]);
  });

  return res.status(200).json({ envLoaded: true, presence });
}


