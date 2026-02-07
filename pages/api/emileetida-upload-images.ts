import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';

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

interface ImageUpload {
  filepath: string;
  filename: string;
  productReference: string;
  sequence: number; // Image order (1, 2, 3...)
  isMain: boolean; // First image should be the main product image
}

interface UploadRequest {
  images: ImageUpload[];
  productReferenceToTemplateId: Record<string, number>;
  odooUid: string;
  odooPassword: string;
}

interface UploadResult {
  productReference: string;
  templateId: number;
  filename: string;
  success: boolean;
  imageId?: number;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('🌸 [Emile et Ida Images] API called');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, productReferenceToTemplateId, odooUid, odooPassword } = req.body as UploadRequest;

    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!odooUid || !odooPassword) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`🌸 [START] Processing ${images.length} images`);

    const uploadResults: UploadResult[] = [];
    const processedMainImages: Set<number> = new Set(); // Track which templates have main image set

    // Sort images by sequence to ensure main images are processed first
    const sortedImages = [...images].sort((a, b) => {
      if (a.productReference !== b.productReference) {
        return a.productReference.localeCompare(b.productReference);
      }
      return a.sequence - b.sequence;
    });

    for (let i = 0; i < sortedImages.length; i++) {
      const img = sortedImages[i];
      const templateId = productReferenceToTemplateId[img.productReference.toUpperCase()];

      if (!templateId) {
        console.log(`⚠️ [${i + 1}/${sortedImages.length}] Skipping ${img.filename}: No template ID for ${img.productReference}`);
        uploadResults.push({
          productReference: img.productReference,
          templateId: 0,
          filename: img.filename,
          success: false,
          error: 'No template ID found for this product',
        });
        continue;
      }

      try {
        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(img.filepath);
        const base64Image = fileBuffer.toString('base64');

        console.log(`🌸 [${i + 1}/${sortedImages.length}] Uploading ${img.filename} to template ${templateId}...`);

        // Set as main product image if this is the first image for this template
        if (img.isMain && !processedMainImages.has(templateId)) {
          console.log(`🖼️ Setting as main product image for template ${templateId}...`);
          await callOdoo(
            parseInt(odooUid),
            odooPassword,
            'product.template',
            'write',
            [[templateId], { image_1920: base64Image }]
          );
          processedMainImages.add(templateId);
          console.log(`✅ Set as main product image`);
        }

        // Create product.image record for eCommerce media gallery
        const imageName = `${img.productReference} - Image ${img.sequence}`;
        
        const imageId = await callOdoo(
          parseInt(odooUid),
          odooPassword,
          'product.image',
          'create',
          [{
            name: imageName,
            product_tmpl_id: templateId,
            image_1920: base64Image,
            sequence: img.sequence,
          }]
        );

        uploadResults.push({
          productReference: img.productReference,
          templateId,
          filename: img.filename,
          success: true,
          imageId,
        });

        console.log(`✅ [${i + 1}/${sortedImages.length}] Uploaded! Image ID: ${imageId}, Sequence: ${img.sequence}`);

      } catch (uploadError) {
        console.error(`❌ [${i + 1}/${sortedImages.length}] Upload failed:`, uploadError);
        uploadResults.push({
          productReference: img.productReference,
          templateId,
          filename: img.filename,
          success: false,
          error: String(uploadError),
        });
      }
    }

    const successCount = uploadResults.filter(r => r.success).length;
    console.log(`🎉 Complete: ${successCount}/${sortedImages.length} images uploaded`);

    return res.status(200).json({
      success: true,
      imagesUploaded: successCount,
      totalImages: sortedImages.length,
      results: uploadResults,
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload images',
    });
  }
}

// Configure body parser for larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: false,
  },
};
