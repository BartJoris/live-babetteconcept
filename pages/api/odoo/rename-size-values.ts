import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface RenameMapping {
  from: string;
  to: string;
}

interface RenameResult {
  from: string;
  to: string;
  valueId: number;
  success: boolean;
  error?: string;
}

type ApiResponse = {
  success: boolean;
  attribute?: { id: number; name: string };
  results: RenameResult[];
  dryRun: boolean;
} | { error: string };

export default withAuth(async function handler(req: NextApiRequestWithSession, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { user } = req.session;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const {
    attributeName = 'MAAT Volwassenen',
    mappings,
    dryRun = true,
  } = req.body as {
    attributeName?: string;
    mappings: RenameMapping[];
    dryRun?: boolean;
  };

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: 'mappings array is required (e.g. [{ from: "S", to: "S / M" }])' });
  }

  try {
    const attrs = await odooClient.searchRead<{ id: number; name: string }>(
      user.uid, user.password,
      'product.attribute',
      [['name', '=', attributeName]],
      ['id', 'name'],
    );

    if (!attrs || attrs.length === 0) {
      return res.status(404).json({ error: `Attribute "${attributeName}" not found` });
    }

    const attrId = attrs[0].id;
    const results: RenameResult[] = [];

    for (const { from, to } of mappings) {
      const values = await odooClient.searchRead<{ id: number; name: string }>(
        user.uid, user.password,
        'product.attribute.value',
        [['attribute_id', '=', attrId], ['name', '=', from]],
        ['id', 'name'],
      );

      if (!values || values.length === 0) {
        results.push({ from, to, valueId: 0, success: false, error: `Value "${from}" not found under "${attributeName}"` });
        continue;
      }

      const valueId = values[0].id;

      if (dryRun) {
        results.push({ from, to, valueId, success: true, error: 'dry run — no changes made' });
      } else {
        await odooClient.write(user.uid, user.password, 'product.attribute.value', [valueId], { name: to });
        results.push({ from, to, valueId, success: true });
      }
    }

    return res.status(200).json({
      success: true,
      attribute: { id: attrId, name: attributeName },
      results,
      dryRun,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});
