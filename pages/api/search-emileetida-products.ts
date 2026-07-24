import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
) {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];
  if (kwargs) executeArgs.push(kwargs);

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'object', method: 'execute_kw', args: executeArgs },
    id: Date.now(),
  };

  const response = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.data?.message || JSON.stringify(json.error));
  }
  return json.result;
}

interface SearchRequest {
  reference: string; // e.g. "AD008" or "IDA-EDGAR"
  color?: string; // e.g. "creme" / "FARINE"
}

interface ProductResult {
  templateId: number;
  name: string;
  reference: string;
  color?: string;
  hasImages: boolean;
  imageCount: number;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeColorToken(color: string): string {
  return color.toUpperCase().replace(/[-_\s]+/g, '');
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const { reference, color } = req.body as SearchRequest;

    if (!reference) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const results: ProductResult[] = [];
    const baseRef = reference.toUpperCase();
    const colorToken = color ? normalizeColorToken(color) : '';
    const refWithColor = colorToken ? `${baseRef}_${colorToken}` : '';

    // Primary: description (Interne Notitie) stores reference like
    // "IDA-EDGAR_FARINE|IDA-EDGAR" or "AD015_CREME|AD015"
    const descriptionQueries = [
      ...(refWithColor ? [refWithColor] : []),
      baseRef,
    ];

    for (const query of descriptionQueries) {
      if (results.length > 0) break;

      const templateIds = await callOdoo(
        uid,
        password,
        'product.template',
        'search',
        [[['description', 'ilike', query]]],
        { limit: 50 },
      );

      if (!templateIds?.length) continue;

      const templates = await callOdoo(
        uid,
        password,
        'product.template',
        'read',
        [templateIds, ['name', 'default_code', 'description']],
      );

      for (const tmpl of templates) {
        const desc = stripHtml(tmpl.description || '');
        const descUpper = desc.toUpperCase();

        // Prefer exact color-specific reference when provided
        if (refWithColor && !descUpper.includes(refWithColor)) {
          // Still accept base ref match if color appears in name/description
          if (!descUpper.includes(baseRef)) continue;
          if (
            colorToken &&
            !descUpper.includes(colorToken) &&
            !String(tmpl.name || '')
              .toUpperCase()
              .includes(colorToken)
          ) {
            continue;
          }
        }

        const colorFromDesc = desc.includes('_')
          ? desc.split('|')[0]?.split('_').slice(1).join('_')
          : undefined;

        results.push({
          templateId: tmpl.id,
          name: tmpl.name,
          reference: tmpl.default_code || desc.split('|')[0] || baseRef,
          color: colorFromDesc || color,
          hasImages: false,
          imageCount: 0,
        });
      }
    }

    // Fallback: product name contains Emile + reference
    if (results.length === 0) {
      const nameSearchIds = await callOdoo(
        uid,
        password,
        'product.template',
        'search',
        [['&', ['name', 'ilike', 'emile'], ['name', 'ilike', reference]]],
        { limit: 20 },
      );

      if (nameSearchIds?.length) {
        const templates = await callOdoo(
          uid,
          password,
          'product.template',
          'read',
          [nameSearchIds, ['name', 'default_code', 'description']],
        );

        for (const tmpl of templates) {
          if (color) {
            const normalizedColor = color.toLowerCase().replace(/[-_\s]+/g, '');
            const nameNorm = String(tmpl.name || '')
              .toLowerCase()
              .replace(/[-_\s]+/g, '');
            if (!nameNorm.includes(normalizedColor)) continue;
          }

          results.push({
            templateId: tmpl.id,
            name: tmpl.name,
            reference: tmpl.default_code || reference,
            color,
            hasImages: false,
            imageCount: 0,
          });
        }
      }
    }

    const uniqueResults = results.filter(
      (result, index, self) =>
        index === self.findIndex((r) => r.templateId === result.templateId),
    );

    for (const result of uniqueResults) {
      try {
        const imageIds = await callOdoo(
          uid,
          password,
          'product.image',
          'search',
          [[['product_tmpl_id', '=', result.templateId]]],
          { limit: 100 },
        );

        const template = await callOdoo(
          uid,
          password,
          'product.template',
          'read',
          [[result.templateId], ['image_1920']],
        );

        const hasMainImage = template?.[0]?.image_1920 ? 1 : 0;
        const galleryImageCount = imageIds?.length || 0;
        result.imageCount = hasMainImage + galleryImageCount;
        result.hasImages = result.imageCount > 0;
      } catch (err) {
        console.error(
          `Error fetching images for template ${result.templateId}:`,
          err,
        );
        result.imageCount = 0;
        result.hasImages = false;
      }
    }

    return res.status(200).json({
      success: true,
      found: uniqueResults.length > 0,
      products: uniqueResults,
      searchedReference: reference,
      searchedColor: color,
    });
  } catch (error) {
    console.error('Error searching Emile et Ida products:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to search products',
    });
  }
}

export default withAuth(handler);
