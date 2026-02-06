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

interface OnemoreImageUploadRequest {
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
  console.log('👶 [One More Images] API called');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, productKeyToTemplateId, odooUid, odooPassword } = req.body as OnemoreImageUploadRequest;

    if (!images || images.length === 0) {
      console.log('❌ [ERROR] No images provided');
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!odooUid || !odooPassword) {
      console.log('❌ [ERROR] Missing Odoo credentials');
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`👶 [START] Processing ${images.length} images`);
    console.log(`👶 [MAPPING] Product keys to template IDs:`, productKeyToTemplateId);

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
        console.log(`👶 [${i + 1}/${images.length}] Uploading ${img.filename} to template ${templateId}...`);
        
        // Determine sequence number from filename
        // Format: "26s179-green-1-476f31.png" or "26s195-off_white-1-e37a9b.png" -> extract number after color (1)
        let sequence: number = 1;
        let isDefaultImage = false;
        
        const filenameWithoutExt = img.filename.replace(/\.[^.]+$/, '').trim();
        // Match pattern: {ProductReference}-{Color}-{Number}-{hash}
        // Improved regex to handle colors with dashes/underscores: matches ProductReference, Color (can contain - or _), then Number
        const match = filenameWithoutExt.match(/^[^-_]+[-_](.+?)[-_](\d+)[-_]/);
        if (match) {
          sequence = parseInt(match[2]);
          // First image (number 1) is default
          isDefaultImage = sequence === 1;
        } else {
          // If no number found, use order in product images
          const productImages = imagesByProductKey[productKey];
          const sortedImages = [...productImages].sort((a, b) => {
            // Extract numbers from filenames for sorting
            // Improved regex to handle colors with dashes/underscores
            const aMatch = a.filename.match(/[-_](.+?)[-_](\d+)[-_]/);
            const bMatch = b.filename.match(/[-_](.+?)[-_](\d+)[-_]/);
            const aNum = aMatch ? parseInt(aMatch[2]) : 999;
            const bNum = bMatch ? parseInt(bMatch[2]) : 999;
            return aNum - bNum;
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

        // Extract color from filename for image name
        // Format: "26s179-green-1-476f31.png" -> "green" or "26s195-off_white-1-e37a9b.png" -> "off_white"
        // Improved regex to handle colors with dashes/underscores
        const colorMatch = filenameWithoutExt.match(/^[^-_]+[-_](.+?)[-_]\d+[-_]/);
        const colorName = colorMatch ? colorMatch[1] : '';

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

    // Return minimal results to avoid response body size issues
    // Only include essential info (not full base64 data, limit error messages)
    const minimalResults = uploadResults.map(r => ({
      productKey: r.productKey,
      templateId: r.templateId,
      filename: r.filename,
      success: r.success,
      imageId: r.imageId,
      error: r.error ? (r.error.length > 100 ? r.error.substring(0, 100) + '...' : r.error) : undefined,
    }));

    // If there are too many results, only return summary for large batches
    if (minimalResults.length > 50) {
      // Group by product key for summary
      const summaryByProduct: Record<string, { success: number; failed: number }> = {};
      minimalResults.forEach(r => {
        if (!summaryByProduct[r.productKey]) {
          summaryByProduct[r.productKey] = { success: 0, failed: 0 };
        }
        if (r.success) {
          summaryByProduct[r.productKey].success++;
        } else {
          summaryByProduct[r.productKey].failed++;
        }
      });

      return res.status(200).json({
        success: true,
        imagesUploaded: successCount,
        totalImages: images.length,
        summary: summaryByProduct,
        // Only include first 50 results for debugging
        results: minimalResults.slice(0, 50),
        totalResults: minimalResults.length,
      });
    }

    return res.status(200).json({
      success: true,
      imagesUploaded: successCount,
      totalImages: images.length,
      results: minimalResults,
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
