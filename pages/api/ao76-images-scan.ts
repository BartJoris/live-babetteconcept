import type { NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

interface ScannedProduct {
  reference: string;
  matchedReference?: string;
  matchedField?: string;
  templateId: number | null;
  foundInOdoo: boolean;
  imageCount: number;
  sampleFiles: string[];
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const expandHome = (inputPath: string) => {
  if (inputPath.startsWith('~')) {
    return path.join(process.env.HOME || '', inputPath.slice(1));
  }
  return inputPath;
};

const getReferenceAndSequence = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);
  const parts = base.split('-').filter(Boolean);
  if (parts.length < 2) return null;

  const trailingNumeric: string[] = [];
  while (parts.length > 0 && /^\d+$/.test(parts[parts.length - 1])) {
    trailingNumeric.push(parts.pop() as string);
  }

  if (parts.length === 0) return null;

  // Drop color code segment
  parts.pop();

  const reference = parts.join('-');
  if (!reference) return null;

  const sequence = trailingNumeric.length > 0
    ? parseInt(trailingNumeric[trailingNumeric.length - 1], 10)
    : 999;

  return { reference, sequence };
};

const getCandidateReferences = (reference: string) => {
  const candidates = [reference];
  if (reference.startsWith('126-')) {
    candidates.push(reference.replace(/^126-/, '225-'));
  }
  return Array.from(new Set(candidates));
};

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Only POST allowed' });
  }

  try {
    const { imageFolderPath, debug } = req.body as { imageFolderPath?: string; debug?: boolean };
    if (!imageFolderPath) {
      return res.status(400).json({ success: false, error: 'Missing imageFolderPath' });
    }

    const expandedPath = expandHome(imageFolderPath);
    if (!fs.existsSync(expandedPath)) {
      return res.status(400).json({ success: false, error: `Directory not found: ${expandedPath}` });
    }

    const files = fs
      .readdirSync(expandedPath)
      .filter(file => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .filter(file => fs.statSync(path.join(expandedPath, file)).isFile());

    const grouped = new Map<string, { files: string[]; sequences: number[] }>();

    files.forEach(file => {
      const info = getReferenceAndSequence(file);
      if (!info) return;
      if (!grouped.has(info.reference)) {
        grouped.set(info.reference, { files: [], sequences: [] });
      }
      grouped.get(info.reference)!.files.push(file);
      grouped.get(info.reference)!.sequences.push(info.sequence);
    });

    const { uid, password } = req.session.user!;
    const products: ScannedProduct[] = [];

    const debugLogs: Array<Record<string, unknown>> = [];

    for (const [reference, data] of grouped.entries()) {
      let templateId: number | null = null;
      let matchedReference: string | undefined;
      let matchedField: string | undefined;
      try {
        for (const candidate of getCandidateReferences(reference)) {
          const templateResult = await odooClient.call<Array<{ id: number; description?: string; description_picking?: string }>>({
            uid,
            password,
            model: 'product.template',
            method: 'search_read',
            args: [[
              '|',
              ['description', '=', candidate],
              ['description_picking', '=', candidate],
            ]],
            kwargs: { fields: ['id', 'description', 'description_picking'], limit: 1 },
          });

          if (templateResult.length > 0) {
            templateId = templateResult[0].id;
            matchedReference = candidate;
            matchedField = templateResult[0].description === candidate ? 'description' : 'description_picking';
            break;
          }

          const productResult = await odooClient.call<Array<{ product_tmpl_id: [number, string] }>>({
            uid,
            password,
            model: 'product.product',
            method: 'search_read',
            args: [[['default_code', '=', candidate]]],
            kwargs: { fields: ['product_tmpl_id'], limit: 1 },
          });

          if (productResult.length > 0) {
            templateId = productResult[0].product_tmpl_id?.[0] || null;
            matchedReference = candidate;
            matchedField = 'default_code';
            break;
          }
        }
      } catch (error) {
        console.error(`Odoo lookup failed for ${reference}:`, error);
      }

      if (debug) {
        debugLogs.push({
          reference,
          candidates: getCandidateReferences(reference),
          matchedReference,
          matchedField,
          templateId,
        });
      }

      const sampleFiles = data.files
        .map((file, idx) => ({ file, sequence: data.sequences[idx] }))
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, 5)
        .map(item => item.file);

      products.push({
        reference,
        matchedReference,
        matchedField,
        templateId,
        foundInOdoo: templateId !== null,
        imageCount: data.files.length,
        sampleFiles,
      });
    }

    products.sort((a, b) => a.reference.localeCompare(b.reference));

    return res.status(200).json({ success: true, products, debug: debug ? debugLogs : undefined });
  } catch (error) {
    console.error('AO76 image scan failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Scan failed',
    });
  }
}

export default withAuth(handler);
