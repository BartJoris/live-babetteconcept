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

interface JenestImageUploadRequest {
  images: Array<{ base64: string; filename: string; productKey: string }>;
  productKeyToTemplateId: Record<string, number>;

}

interface UploadResult {
  productKey: string;
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
  console.log('👕 [Jenest Images] API called');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, productKeyToTemplateId } = req.body as JenestImageUploadRequest;

    if (!images || images.length === 0) {
      console.log('❌ [ERROR] No images provided');
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!uid || !password) {
      console.log('❌ [ERROR] Missing Odoo credentials');
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`👕 [START] Processing ${images.length} images`);
    console.log(`👕 [MAPPING] Product keys to template IDs:`, productKeyToTemplateId);

    // Group images by productKey to determine sequence
    const imagesByProductKey: Record<string, typeof images> = {};
    for (const img of images) {
      if (!imagesByProductKey[img.productKey]) {
        imagesByProductKey[img.productKey] = [];
      }
      imagesByProductKey[img.productKey].push(img);
    }

    const uploadResults: UploadResult[] = [];
    const processedTemplateIds: Set<number> = new Set();
    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const productKey = img.productKey;
      const templateId = productKeyToTemplateId[productKey];
      const imagesForThisProduct = imagesByProductKey[productKey].length;

      if (!templateId) {
        console.log(`⚠️ [${i + 1}/${images.length}] Skipping ${img.filename}: No template ID found for product key ${productKey}`);
        uploadResults.push({
          productKey,
          templateId: 0,
          filename: img.filename,
          success: false,
          error: 'No template ID found for this product',
        });
        continue;
      }

      try {
        console.log(`👕 [${i + 1}/${images.length}] Uploading ${img.filename} to template ${templateId}...`);
        
        // Determine sequence number from filename
        let sequence: number = 1;
        let isDefaultImage = false;
        
        // Extract sequence from filename
        // Format: "PRODUCT NAME COLOR.jpg" or "PRODUCT NAME COLOR primary.jpg" = sequence 1
        // Format: "PRODUCT NAME COLOR 2.jpg" = sequence 2, etc.
        const filenameWithoutExt = img.filename.replace(/\.[^.]+$/, '').trim();
        const filenameUpper = filenameWithoutExt.toUpperCase();
        
        // Check if it's marked as primary or if it's the only image
        if (filenameUpper.includes(' PRIMARY') || imagesForThisProduct === 1) {
          sequence = 1;
          isDefaultImage = true;
        } else {
          // Look for number at the end: " 2", " 3", " 10", etc.
          const numberMatch = filenameWithoutExt.match(/\s+(\d+)$/i);
          if (numberMatch) {
            sequence = parseInt(numberMatch[1]);
            // First numbered image (2) should be sequence 2, not default
            isDefaultImage = false;
          } else {
            // No number found and not primary - check if it's the first image for this product
            // Sort images by filename to determine order
            const productImages = imagesByProductKey[productKey];
            const sortedImages = [...productImages].sort((a, b) => {
              // Sort: primary/no number first, then by number
              const aHasNumber = /\s+\d+$/i.test(a.filename);
              const bHasNumber = /\s+\d+$/i.test(b.filename);
              if (!aHasNumber && bHasNumber) return -1;
              if (aHasNumber && !bHasNumber) return 1;
              if (aHasNumber && bHasNumber) {
                const aNum = parseInt(a.filename.match(/\s+(\d+)$/i)?.[1] || '999');
                const bNum = parseInt(b.filename.match(/\s+(\d+)$/i)?.[1] || '999');
                return aNum - bNum;
              }
              return a.filename.localeCompare(b.filename);
            });
            const imageIndex = sortedImages.findIndex(pi => pi.filename === img.filename);
            sequence = imageIndex + 1;
            // First image in sorted list is default
            isDefaultImage = imageIndex === 0;
          }
        }

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
            name: `${productKey} - Image ${sequence}`,
            product_tmpl_id: templateId,
            image_1920: img.base64,
            sequence: sequence,
          }]
        );
        
        uploadResults.push({
          productKey,
          templateId,
          filename: img.filename,
          success: true,
          imageId,
        });
        
        console.log(`✅ [${i + 1}/${images.length}] Uploaded! Image ID: ${imageId}, Sequence: ${sequence}`);
      } catch (uploadError) {
        console.error(`❌ [${i + 1}/${images.length}] Upload failed:`, uploadError);
        uploadResults.push({
          productKey,
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
