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

interface FlossImageUploadRequest {
  images: Array<{ base64: string; filename: string; styleNo: string }>;
  styleNoToTemplateId: Record<string, number>;
  odooUid: string;
  odooPassword: string;
}

interface UploadResult {
  styleNo: string;
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
  console.log('🌸 [Flöss Images] API called');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, styleNoToTemplateId, odooUid, odooPassword } = req.body as FlossImageUploadRequest;

    if (!images || images.length === 0) {
      console.log('❌ [ERROR] No images provided');
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!odooUid || !odooPassword) {
      console.log('❌ [ERROR] Missing Odoo credentials');
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`🌸 [START] Processing ${images.length} images`);
    console.log(`🌸 [MAPPING] Style numbers to template IDs:`, styleNoToTemplateId);

    // Group images by styleNo to determine if each product has only 1 image
    const imagesByStyleNo: Record<string, typeof images> = {};
    for (const img of images) {
      if (!imagesByStyleNo[img.styleNo]) {
        imagesByStyleNo[img.styleNo] = [];
      }
      imagesByStyleNo[img.styleNo].push(img);
    }

    const uploadResults: UploadResult[] = [];
    const processedTemplateIds: Set<number> = new Set();
    // Track next available sequence per template to avoid duplicates across colors
    const templateSequenceCounter: Record<number, number> = {};
    
    // Sort images: Main images first (so they become the default), then Extra by number
    const sortedImages = [...images].sort((a, b) => {
      const aIsMain = a.filename.includes('Main') ? 0 : 1;
      const bIsMain = b.filename.includes('Main') ? 0 : 1;
      if (aIsMain !== bIsMain) return aIsMain - bIsMain;
      const aExtra = a.filename.match(/Extra\s*(\d+)/i);
      const bExtra = b.filename.match(/Extra\s*(\d+)/i);
      return (aExtra ? parseInt(aExtra[1]) : 0) - (bExtra ? parseInt(bExtra[1]) : 0);
    });

    for (let i = 0; i < sortedImages.length; i++) {
      const img = sortedImages[i];
      const styleNo = img.styleNo;
      const templateId = styleNoToTemplateId[styleNo];

      if (!templateId) {
        console.log(`⚠️ [${i + 1}/${sortedImages.length}] Skipping ${img.filename}: No template ID found for style ${styleNo}`);
        uploadResults.push({
          styleNo,
          templateId: 0,
          filename: img.filename,
          success: false,
          error: 'No template ID found for this style number',
        });
        continue;
      }

      try {
        console.log(`🌸 [${i + 1}/${sortedImages.length}] Uploading ${img.filename} to template ${templateId}...`);
        
        // Assign unique incrementing sequence per template
        if (!templateSequenceCounter[templateId]) {
          templateSequenceCounter[templateId] = 1;
        }
        const sequence = templateSequenceCounter[templateId];
        templateSequenceCounter[templateId]++;

        const isDefaultImage = img.filename.includes('Main') && !processedTemplateIds.has(templateId);

        // Extract color from filename
        // Format: "F10625 - Apple Knit Cardigan - Red Apple - Main.jpg"
        const parts = img.filename.replace(/\.[^.]+$/, '').split(' - ');
        const colorName = parts.length >= 3 ? parts[parts.length - 2] : '';

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

        // Create product.image record for eCommerce media
        const imageId = await callOdoo(
          parseInt(odooUid),
          odooPassword,
          'product.image',
          'create',
          [{
            name: `${colorName || styleNo} - Image ${sequence}`,
            product_tmpl_id: templateId,
            image_1920: img.base64,
            sequence: sequence,
          }]
        );
        
        uploadResults.push({
          styleNo,
          templateId,
          filename: img.filename,
          success: true,
          imageId,
        });
        
        console.log(`✅ [${i + 1}/${images.length}] Uploaded! Image ID: ${imageId}, Sequence: ${sequence}`);
      } catch (uploadError) {
        console.error(`❌ [${i + 1}/${images.length}] Upload failed:`, uploadError);
        uploadResults.push({
          styleNo,
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
