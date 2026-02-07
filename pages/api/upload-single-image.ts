import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
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
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

interface UploadRequest {
  templateId: number;
  base64Image: string;
  imageName: string;
  sequence: number;
  isMainImage: boolean;
  odooUid: string;
  odooPassword: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      templateId, 
      base64Image, 
      imageName, 
      sequence, 
      isMainImage,
      odooUid,
      odooPassword 
    } = req.body as UploadRequest;

    if (!templateId || !base64Image || !odooUid || !odooPassword) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const uid = parseInt(odooUid);

    let imageId: number | null = null;

    // If this is the main image, ONLY set it as the product template's main image
    // Do NOT create a product.image record for the main image (it would cause duplicates)
    if (isMainImage) {
      console.log(`🖼️ Setting main image for template ${templateId}...`);
      await callOdoo(
        uid,
        odooPassword,
        'product.template',
        'write',
        [[templateId], { image_1920: base64Image }]
      );
      console.log(`✅ Main image set (no product.image record created to avoid duplicates)`);
    } else {
      // Only create product.image record for additional images (not the main one)
      imageId = await callOdoo(
        uid,
        odooPassword,
        'product.image',
        'create',
        [{
          name: imageName,
          product_tmpl_id: templateId,
          image_1920: base64Image,
          sequence: sequence,
        }]
      );
      console.log(`✅ Created product.image ${imageId} for template ${templateId}`);
    }

    return res.status(200).json({
      success: true,
      imageId,
      templateId,
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload image',
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};
