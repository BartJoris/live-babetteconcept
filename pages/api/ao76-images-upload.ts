import type { NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

interface UploadResult {
  reference: string;
  templateId: number | null;
  imagesUploaded: number;
  status: 'success' | 'error';
  message: string;
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

const findTemplateId = async (uid: number, password: string, reference: string) => {
  for (const candidate of getCandidateReferences(reference)) {
    const templateLookup = await odooClient.call<Array<{ id: number; description?: string; description_picking?: string }>>({
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

    if (templateLookup.length > 0) {
      return templateLookup[0].id;
    }

    const productLookup = await odooClient.call<Array<{ product_tmpl_id: [number, string] }>>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[['default_code', '=', candidate]]],
      kwargs: { fields: ['product_tmpl_id'], limit: 1 },
    });

    const templateId = productLookup.length > 0 ? productLookup[0].product_tmpl_id?.[0] || null : null;
    if (templateId) return templateId;
  }

  return null;
};

async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Only POST allowed' });
  }

  try {
    const { imageFolderPath, maxImagesPerProduct = 5 } = req.body as {
      imageFolderPath?: string;
      maxImagesPerProduct?: number;
    };

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

    const grouped = new Map<string, Array<{ file: string; sequence: number }>>();

    files.forEach(file => {
      const info = getReferenceAndSequence(file);
      if (!info) return;
      if (!grouped.has(info.reference)) {
        grouped.set(info.reference, []);
      }
      grouped.get(info.reference)!.push({ file, sequence: info.sequence });
    });

    const { uid, password } = req.session.user!;
    const results: UploadResult[] = [];

    for (const [reference, items] of grouped.entries()) {
      try {
        const templateId = await findTemplateId(uid, password, reference);

        if (!templateId) {
          results.push({
            reference,
            templateId: null,
            imagesUploaded: 0,
            status: 'error',
            message: 'Product not found in Odoo (default_code)',
          });
          continue;
        }

        const sorted = items.sort((a, b) => a.sequence - b.sequence);
        const maxCount = Math.max(1, Math.min(maxImagesPerProduct, sorted.length));
        let uploadedCount = 0;

        for (let i = 0; i < maxCount; i++) {
          const imagePath = path.join(expandedPath, sorted[i].file);
          const imageBuffer = fs.readFileSync(imagePath);
          const base64 = imageBuffer.toString('base64');

          if (i === 0) {
            await odooClient.call({
              uid,
              password,
              model: 'product.template',
              method: 'write',
              args: [[templateId], { image_1920: base64 }],
            });
          } else {
            await odooClient.call({
              uid,
              password,
              model: 'product.image',
              method: 'create',
              args: [{
                name: `${reference} - Image ${i + 1}`,
                product_tmpl_id: templateId,
                image_1920: base64,
                sequence: i + 1,
              }],
            });
          }
          uploadedCount++;
        }

        results.push({
          reference,
          templateId,
          imagesUploaded: uploadedCount,
          status: 'success',
          message: `Uploaded ${uploadedCount} images`,
        });
      } catch (error) {
        console.error(`Upload failed for ${reference}:`, error);
        results.push({
          reference,
          templateId: null,
          imagesUploaded: 0,
          status: 'error',
          message: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('AO76 image upload failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
}

export default withAuth(handler);
