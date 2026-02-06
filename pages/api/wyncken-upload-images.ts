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

interface WynckenImageUploadRequest {
  images: Array<{ base64: string; filename: string; productKey: string }>;
  productKeyToTemplateId: Record<string, number>;
  odooUid: string;
  odooPassword: string;
}

interface UploadResult {
  productKey: string;
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
  console.log('🌻 [Wyncken Images] API called');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, productKeyToTemplateId, odooUid, odooPassword } = req.body as WynckenImageUploadRequest;

    if (!images || images.length === 0) {
      console.log('❌ [ERROR] No images provided');
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!odooUid || !odooPassword) {
      console.log('❌ [ERROR] Missing Odoo credentials');
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`🌻 [START] Processing ${images.length} images`);
    console.log(`🌻 [MAPPING] Product keys to template IDs:`, productKeyToTemplateId);

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
        console.log(`🌻 [${i + 1}/${images.length}] Uploading ${img.filename} to template ${templateId}...`);
        
        // Determine sequence number from filename
        // Format: "MW20J01-ARTISTS BLUE-2.jpg" or "MW20J01-ARTISTS BLUE.jpg"
        // Pattern: {STYLE}-{COLOUR}[-{VARIANT}].{ext}
        let sequence: number = 1;
        let isDefaultImage = false;
        
        const filenameWithoutExt = img.filename.replace(/\.[^.]+$/, '').trim();
        // Match pattern: {STYLE}-{COLOUR}[-{VARIANT}]
        // Extract variant number if present (e.g., "-2" -> 2)
        const match = filenameWithoutExt.match(/[-_](\d+)$/);
        if (match) {
          sequence = parseInt(match[1]);
          // First image (number 1 or no number) is default
          isDefaultImage = sequence === 1;
        } else {
          // If no number found, use order in product images
          const productImages = imagesByProductKey[productKey];
          // Sort by filename to maintain consistent order
          const sortedImages = [...productImages].sort((a, b) => {
            return a.filename.localeCompare(b.filename);
          });
          const imageIndex = sortedImages.findIndex(pi => pi.filename === img.filename);
          sequence = imageIndex + 1;
          isDefaultImage = imageIndex === 0;
        }

        // If this is the first image (sequence 1), set it as the default product image
        if (isDefaultImage && !processedTemplateIds.has(templateId)) {
          console.log(`🖼️ Setting image as main product image for template ${templateId}...`);
          await callOdoo(
            parseInt(odooUid),
            odooPassword,
            'product.template',
            'write',
            [[templateId], { image_1920: img.base64 }]
          );
          processedTemplateIds.add(templateId);
          console.log(`✅ Set as main product image`);
        }

        // Extract colour from filename for image name
        // Format: "MW20J01-ARTISTS BLUE-2.jpg" -> "ARTISTS BLUE"
        // Pattern: {STYLE}-{COLOUR}[-{VARIANT}]
        const colourMatch = filenameWithoutExt.match(/^[A-Z]{2,}\d+[A-Z0-9]*[-_](.+?)(?:[-_]\d+)?$/i);
        const colorName = colourMatch ? colourMatch[1].trim() : '';

        // Create product.image record for eCommerce media
        const imageId = await callOdoo(
          parseInt(odooUid),
          odooPassword,
          'product.image',
          'create',
          [{
            name: `${colorName || productKey} - Image ${sequence}`,
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
    
    // Check if it's a body size error
    if (err.message?.includes('Body') || err.message?.includes('size') || err.message?.includes('exceed')) {
      return res.status(413).json({
        success: false,
        error: 'Request body too large. Please upload fewer images at once or contact support.',
      });
    }
    
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
