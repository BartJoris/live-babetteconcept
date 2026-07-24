import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

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

interface TheNewSocietyImageUploadRequest {
  images: Array<{ base64: string; filename: string; productReference: string; colorName: string }>;
  productKeyToTemplateId: Record<string, number>; // Key format: "S26AHB1P362-Pink Lavander Bow" (reference-color)

}

interface UploadResult {
  productReference: string;
  colorName: string;
  templateId: number;
  filename: string;
  success: boolean;
  imageId?: number;
  error?: string;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  const { uid, password } = req.session.user!;
  console.log('🌿 [The New Society Images] API called');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, productKeyToTemplateId } = req.body as TheNewSocietyImageUploadRequest;

    if (!images || images.length === 0) {
      console.log('❌ [ERROR] No images provided');
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!uid || !password) {
      console.log('❌ [ERROR] Missing Odoo credentials');
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`🌿 [START] Processing ${images.length} images`);
    console.log(`🌿 [MAPPING] Product keys to template IDs:`, productKeyToTemplateId);

    // Group images by product key to determine sequence
    const imagesByProductKey: Record<string, typeof images> = {};
    for (const img of images) {
      const productKey = `${img.productReference}-${img.colorName}`;
      if (!imagesByProductKey[productKey]) {
        imagesByProductKey[productKey] = [];
      }
      imagesByProductKey[productKey].push(img);
    }

    // Sort images within each product by sequence number from filename
    Object.keys(imagesByProductKey).forEach(key => {
      imagesByProductKey[key].sort((a, b) => {
        // Extract sequence number from filename: "s26ahb1p362-pink_lavander_bow-1-3dc260.jpg" -> 1
        const matchA = a.filename.match(/-(\d+)-[a-f0-9]+\./i);
        const matchB = b.filename.match(/-(\d+)-[a-f0-9]+\./i);
        const seqA = matchA ? parseInt(matchA[1]) : 999;
        const seqB = matchB ? parseInt(matchB[1]) : 999;
        return seqA - seqB;
      });
    });

    const uploadResults: UploadResult[] = [];
    const processedTemplateIds: Set<number> = new Set();
    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const productKey = `${img.productReference}-${img.colorName}`;
      const templateId = productKeyToTemplateId[productKey];

      if (!templateId) {
        console.log(`⚠️ [${i + 1}/${images.length}] Skipping ${img.filename}: No template ID found for product ${productKey}`);
        uploadResults.push({
          productReference: img.productReference,
          colorName: img.colorName,
          templateId: 0,
          filename: img.filename,
          success: false,
          error: 'No template ID found for this product',
        });
        continue;
      }

      try {
        console.log(`🌿 [${i + 1}/${images.length}] Uploading ${img.filename} to template ${templateId}...`);
        
        // Extract sequence number from filename
        // Format: "s26ahb1p362-pink_lavander_bow-1-3dc260.jpg" -> sequence = 1
        let sequence: number = 1;
        let isDefaultImage = false;
        
        const filenameWithoutExt = img.filename.replace(/\.[^.]+$/, '').trim();
        // Match pattern: {reference}-{color}-{number}-{hash}
        const match = filenameWithoutExt.match(/-(\d+)-[a-f0-9]+$/i);
        if (match) {
          sequence = parseInt(match[1]);
        } else {
          // Fallback: use position in sorted array
          const productImages = imagesByProductKey[productKey];
          sequence = productImages.indexOf(img) + 1;
        }
        
        // First image (sequence 1) is always the default
        isDefaultImage = sequence === 1;

        // If this is the first image (sequence 1), set it as the default product image
        if (isDefaultImage && !processedTemplateIds.has(templateId)) {
          console.log(`🖼️ Setting image as main product image for template ${templateId}...`);
          await callOdoo(
            uid,
            password,
            'product.template',
            'write',
            [[templateId], { image_1920: img.base64 }]
          );
          processedTemplateIds.add(templateId);
          console.log(`✅ Set as main product image`);
        }

        // Create product.image record for eCommerce media
        const imageId = await callOdoo(
          uid,
          password,
          'product.image',
          'create',
          [{
            name: `${img.colorName || img.productReference} - Image ${sequence}`,
            product_tmpl_id: templateId,
            image_1920: img.base64,
            sequence: sequence,
          }]
        );
        
        uploadResults.push({
          productReference: img.productReference,
          colorName: img.colorName,
          templateId,
          filename: img.filename,
          success: true,
          imageId,
        });
        
        console.log(`✅ [${i + 1}/${images.length}] Uploaded! Image ID: ${imageId}, Sequence: ${sequence}`);
      } catch (uploadError) {
        console.error(`❌ [${i + 1}/${images.length}] Upload failed:`, uploadError);
        uploadResults.push({
          productReference: img.productReference,
          colorName: img.colorName,
          templateId,
          filename: img.filename,
          success: false,
          error: String(uploadError),
        });
      }
    }

    const successCount = uploadResults.filter(r => r.success).length;
    console.log(`🎉 Complete: ${successCount}/${images.length} images uploaded`);

    return res.status(200).json({
      success: true,
      imagesUploaded: successCount,
      totalImages: images.length,
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

// Configure body parser for this endpoint to accept larger payloads (up to 50MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default withAuth(handler);
