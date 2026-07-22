import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

const SIZE_ATTRIBUTES = [
  "MAAT Baby's",
  'MAAT Kinderen',
  'MAAT Tieners',
  'MAAT Volwassenen',
] as const;

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const attributeName =
      (typeof req.query.attribute === 'string' && req.query.attribute) ||
      (typeof req.body?.attribute === 'string' && req.body.attribute) ||
      '';

    if (!attributeName || !SIZE_ATTRIBUTES.includes(attributeName as (typeof SIZE_ATTRIBUTES)[number])) {
      return res.status(400).json({
        success: false,
        error: `Invalid attribute. Use one of: ${SIZE_ATTRIBUTES.join(', ')}`,
      });
    }

    const attrs = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.attribute',
      [['name', '=', attributeName]],
      ['id', 'name'],
      5,
    );

    if (!attrs?.length) {
      return res.status(200).json({
        success: true,
        attribute: attributeName,
        values: [],
      });
    }

    const values = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.attribute.value',
      [['attribute_id', '=', attrs[0].id]],
      ['id', 'name'],
      2000,
    );

    const sorted = (values || [])
      .map((v) => ({ id: v.id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true }));

    return res.status(200).json({
      success: true,
      attribute: attributeName,
      attributeId: attrs[0].id,
      values: sorted,
    });
  } catch (error) {
    console.error('Fetch size values error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch size values',
    });
  }
}

export default withAuth(handler);
