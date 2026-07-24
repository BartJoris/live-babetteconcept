import type { NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

interface MatchedProduct {
  reference: string;
  color: string;
  templateId: number;
}

interface UploadResult {
  reference: string;
  color: string;
  templateId: number;
  imagesUploaded: number;
  status: 'success' | 'error';
  message: string;
}

interface UploadResponse {
  success: boolean;
  results: UploadResult[];
  error?: string;
}

async function callOdoo(
  uid: number,
  password: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];
  if (Object.keys(kwargs).length > 0) {
    executeArgs.push(kwargs);
  }

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

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<UploadResponse>
) {
  const { uid, password } = req.session.user!;
  console.log('🎯 [Armed Angels Images Upload] API called');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      results: [],
      error: 'Method not allowed',
    });
  }

  if (process.env.VERCEL) {
    return res.status(501).json({
      success: false,
      results: [],
      error: 'Deze functie is niet beschikbaar op Vercel. Gebruik de afbeeldingen upload pagina (/image-upload) in plaats van server-side bestandstoegang.',
    });
  }

  try {
    const { imageFolderPath, products } = req.body as {
      imageFolderPath: string;
      products: MatchedProduct[];

    };

    if (!imageFolderPath || !products || products.length === 0) {
      return res.status(400).json({
        success: false,
        results: [],
        error: 'Missing imageFolderPath or products',
      });
    }

    if (!uid || !password) {
      return res.status(400).json({
        success: false,
        results: [],
        error: 'Missing Odoo credentials',
      });
    }

    // Expand tilde to home directory
    let expandedPath = imageFolderPath;
    if (expandedPath.startsWith('~')) {
      expandedPath = path.join(process.env.HOME || '', expandedPath.slice(1));
    }

    if (!fs.existsSync(expandedPath)) {
      return res.status(400).json({
        success: false,
        results: [],
        error: `Directory not found: ${expandedPath}`,
      });
    }

    console.log(`🎯 [START] Processing ${products.length} products`);

    const results: UploadResult[] = [];

    for (const product of products) {
      const productFolderName = `${product.reference}-${product.color}`;
      const productFolderPath = path.join(expandedPath, productFolderName);

      console.log(`🎯 [PRODUCT] Processing ${productFolderName} (template ${product.templateId})...`);

      if (!fs.existsSync(productFolderPath)) {
        console.log(`⚠️ Folder not found: ${productFolderPath}`);
        results.push({
          reference: product.reference,
          color: product.color,
          templateId: product.templateId,
          imagesUploaded: 0,
          status: 'error',
          message: `Folder not found: ${productFolderName}`,
        });
        continue;
      }

      try {
        // Get image files from folder
        const files = fs.readdirSync(productFolderPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

        if (files.length === 0) {
          console.log(`⚠️ No images found in ${productFolderName}`);
          results.push({
            reference: product.reference,
            color: product.color,
            templateId: product.templateId,
            imagesUploaded: 0,
            status: 'error',
            message: 'No images found in folder',
          });
          continue;
        }

        console.log(`🎯 Found ${files.length} images in ${productFolderName}`);
        files.sort(); // Sort for consistent ordering

        let uploadedCount = 0;
        const processedTemplateIds: Set<number> = new Set();

        // Upload up to 5 images (first as main, rest as gallery)
        for (let i = 0; i < Math.min(files.length, 5); i++) {
          try {
            const imagePath = path.join(productFolderPath, files[i]);
            const imageBuffer = fs.readFileSync(imagePath);
            const base64 = imageBuffer.toString('base64');

            console.log(`🎯 [${i + 1}/${Math.min(files.length, 5)}] Uploading ${files[i]}...`);

            if (i === 0) {
              // First image: Set as main product image
              console.log(
                `🖼️ Setting main image for template ${product.templateId}...`
              );
              await callOdoo(uid, password, 'product.template', 'write', [
                [product.templateId],
                { image_1920: base64 },
              ]);
              processedTemplateIds.add(product.templateId);
              uploadedCount++;
              console.log(`✅ Main image set`);
            } else {
              // Additional images: Add to product media gallery
              console.log(
                `📸 Adding image ${i + 1} to template ${product.templateId}...`
              );
              await callOdoo(uid, password, 'product.image', 'create', [
                {
                  name: `${product.reference} - Image ${i + 1}`,
                  product_tmpl_id: product.templateId,
                  image_1920: base64,
                  sequence: i + 1,
                },
              ]);
              uploadedCount++;
              console.log(`✅ Gallery image ${i + 1} uploaded`);
            }
          } catch (imgError) {
            console.error(`❌ Error uploading image ${i + 1}:`, imgError);
          }
        }

        results.push({
          reference: product.reference,
          color: product.color,
          templateId: product.templateId,
          imagesUploaded: uploadedCount,
          status: uploadedCount > 0 ? 'success' : 'error',
          message: uploadedCount > 0 ? `Uploaded ${uploadedCount} images` : 'No images uploaded',
        });

        console.log(`✅ [PRODUCT COMPLETE] ${productFolderName}: ${uploadedCount} images uploaded`);
      } catch (error) {
        console.error(`❌ Error processing ${productFolderName}:`, error);
        const err = error as { message?: string };
        results.push({
          reference: product.reference,
          color: product.color,
          templateId: product.templateId,
          imagesUploaded: 0,
          status: 'error',
          message: err.message || 'Error processing product',
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`🎉 [COMPLETE] ${successCount}/${products.length} products completed successfully`);

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('❌ Fatal error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      results: [],
      error: err.message || 'Failed to upload images',
    });
  }
}

// Configure body parser for this endpoint
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default withAuth(handler);
