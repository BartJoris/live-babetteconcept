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

interface WeekendHouseKidsImageUploadRequest {
  images: Array<{ base64: string; filename: string; productReference: string; isLook: boolean }>;
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
  console.log('🏠 [Weekend House Kids Images] API called');
  
  if (req.method !== 'POST') {
    console.log('❌ [ERROR] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, productReferenceToTemplateId, odooUid, odooPassword } = req.body as WeekendHouseKidsImageUploadRequest;

    if (!images || images.length === 0) {
      console.log('❌ [ERROR] No images provided');
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!odooUid || !odooPassword) {
      console.log('❌ [ERROR] Missing Odoo credentials');
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    console.log(`🏠 [START] Processing ${images.length} images`);
    console.log(`🏠 [MAPPING] Product references to template IDs:`, productReferenceToTemplateId);

    // Separate product photos (stills) and looks
    const stills = images.filter(img => !img.isLook);
    const looks = images.filter(img => img.isLook);

    // Group images by productReference to determine sequence
    const imagesByProductReference: Record<string, typeof images> = {};
    for (const img of images) {
      if (!imagesByProductReference[img.productReference]) {
        imagesByProductReference[img.productReference] = [];
      }
      imagesByProductReference[img.productReference].push(img);
    }

    const uploadResults: UploadResult[] = [];
    const processedTemplateIds: Set<number> = new Set();
    
    // First upload stills (product photos), then looks
    const imagesToUpload = [...stills, ...looks];
    
    for (let i = 0; i < imagesToUpload.length; i++) {
      const img = imagesToUpload[i];
      const productReference = img.productReference;
      const templateId = productReferenceToTemplateId[productReference];
      const imagesForThisProduct = imagesByProductReference[productReference] || [];

      if (!templateId) {
        console.log(`⚠️ [${i + 1}/${imagesToUpload.length}] Skipping ${img.filename}: No template ID found for product reference ${productReference}`);
        uploadResults.push({
          productReference,
          templateId: 0,
          filename: img.filename,
          success: false,
          error: 'No template ID found for this product',
        });
        continue;
      }

      try {
        console.log(`🏠 [${i + 1}/${imagesToUpload.length}] Uploading ${img.filename} to template ${templateId}...`);
        
        // Determine sequence number from filename
        // Format: "26015_1.jpg" = sequence 1, "26015_2.jpg" = sequence 2, etc.
        let sequence: number = 1;
        let isDefaultImage = false;
        
        const filenameMatch = img.filename.match(/^(\d+)_(\d+)\./i);
        if (filenameMatch) {
          sequence = parseInt(filenameMatch[2]);
        } else {
          // Fallback: determine sequence from order in product's image list
          const productImages = imagesForThisProduct.filter(pi => pi.isLook === img.isLook);
          const sortedImages = [...productImages].sort((a, b) => {
            const aMatch = a.filename.match(/^(\d+)_(\d+)\./i);
            const bMatch = b.filename.match(/^(\d+)_(\d+)\./i);
            if (aMatch && bMatch) {
              return parseInt(aMatch[2]) - parseInt(bMatch[2]);
            }
            return a.filename.localeCompare(b.filename);
          });
          const imageIndex = sortedImages.findIndex(pi => pi.filename === img.filename);
          sequence = imageIndex + 1;
        }

        // For stills: first image (sequence 1) is default
        // For looks: add after all stills, so sequence starts after still count
        if (!img.isLook) {
          // Stills: sequence 1 is default
          isDefaultImage = sequence === 1;
        } else {
          // Looks: sequence starts after all stills
          const stillCount = imagesForThisProduct.filter(pi => !pi.isLook).length;
          sequence = stillCount + sequence;
          isDefaultImage = false; // Looks are never default
        }

        // If this is the first still image (sequence 1), set it as the default product image
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
        const imageName = img.isLook 
          ? `${productReference} - Look ${sequence - imagesForThisProduct.filter(pi => !pi.isLook).length}`
          : `${productReference} - Image ${sequence}`;
        
        const imageId = await callOdoo(
          parseInt(odooUid),
          odooPassword,
          'product.image',
          'create',
          [{
            name: imageName,
            product_tmpl_id: templateId,
            image_1920: img.base64,
            sequence: sequence,
          }]
        );
        
        uploadResults.push({
          productReference,
          templateId,
          filename: img.filename,
          success: true,
          imageId,
        });
        
        console.log(`✅ [${i + 1}/${imagesToUpload.length}] Uploaded! Image ID: ${imageId}, Sequence: ${sequence}, Type: ${img.isLook ? 'Look' : 'Still'}`);
      } catch (uploadError) {
        console.error(`❌ [${i + 1}/${imagesToUpload.length}] Upload failed:`, uploadError);
        uploadResults.push({
          productReference,
          templateId,
          filename: img.filename,
          success: false,
          error: String(uploadError),
        });
      }
    }

    const successCount = uploadResults.filter(r => r.success).length;
    const stillsCount = uploadResults.filter(r => r.success && stills.some(s => s.filename === r.filename)).length;
    const looksCount = uploadResults.filter(r => r.success && looks.some(l => l.filename === r.filename)).length;
    console.log(`🎉 Complete: ${successCount}/${imagesToUpload.length} images uploaded (${stillsCount} stills, ${looksCount} looks)`);

    return res.status(200).json({
      success: true,
      imagesUploaded: successCount,
      totalImages: imagesToUpload.length,
      stillsUploaded: stillsCount,
      looksUploaded: looksCount,
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
