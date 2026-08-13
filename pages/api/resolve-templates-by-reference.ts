import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

interface ResolveBody {
  references: string[];
  brandName?: string;
}

/**
 * Resolve Odoo product.template ids for supplier references.
 * Matches description == reference, description starting with "reference|",
 * or name containing "(reference)".
 */
async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password } = req.session.user!;
  const body = req.body as ResolveBody;
  const references = Array.from(
    new Set(
      (body.references || [])
        .map((r) => String(r || '').trim())
        .filter(Boolean),
    ),
  );

  if (references.length === 0) {
    return res.status(400).json({ error: 'references required' });
  }

  const brandName = (body.brandName || 'Play Up').trim();

  try {
    // Prefer exact description match (import stores reference there).
    const byDescription = await odooClient.searchRead<{
      id: number;
      name: string;
      description: string | false;
    }>(
      uid,
      password,
      'product.template',
      [['description', 'in', references]],
      ['id', 'name', 'description'],
      references.length * 2,
    );

    const found = new Map<string, { reference: string; templateId: number; name: string }>();

    for (const row of byDescription) {
      const desc = String(row.description || '').split('|')[0].trim();
      if (references.includes(desc) && !found.has(desc)) {
        found.set(desc, {
          reference: desc,
          templateId: row.id,
          name: row.name,
        });
      }
    }

    const missing = references.filter((r) => !found.has(r));
    if (missing.length > 0) {
      // Fall back: name contains "(REF)" — common after Play UP rename.
      const nameHits = await odooClient.searchRead<{
        id: number;
        name: string;
        description: string | false;
      }>(
        uid,
        password,
        'product.template',
        [
          ['name', 'ilike', `${brandName} -`],
          ['name', 'ilike', '('],
        ],
        ['id', 'name', 'description'],
        500,
        0,
        'create_date desc',
      );

      for (const ref of missing) {
        const needle = `(${ref})`;
        const match = nameHits.find((row) => row.name.includes(needle));
        if (match) {
          found.set(ref, {
            reference: ref,
            templateId: match.id,
            name: match.name,
          });
        }
      }
    }

    const products = references.map((reference) => {
      const hit = found.get(reference);
      return hit
        ? { ...hit, found: true as const }
        : {
            reference,
            templateId: null as number | null,
            name: '',
            found: false as const,
          };
    });

    return res.status(200).json({
      success: true,
      products,
      found: products.filter((p) => p.found).length,
      missing: products.filter((p) => !p.found).length,
    });
  } catch (error) {
    console.error('resolve-templates-by-reference error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withAuth(handler);
