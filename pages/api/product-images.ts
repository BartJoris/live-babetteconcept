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
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds array is required' });
    }

    // Fetch images for all products in batch
    const products = await odooCall<any[]>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[['id', 'in', productIds]]],
      kwargs: {
        fields: ['id', 'image_1920'],
      },
    });

    // Build a map of product ID to image
    const imageMap: Record<number, string | null> = {};
    products.forEach(product => {
      imageMap[product.id] = product.image_1920 || null;
    });

    return res.status(200).json({ images: imageMap });
  } catch (error) {
    console.error('Error fetching product images:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch product images' 
    });
  }
}
