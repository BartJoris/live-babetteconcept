import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import { importProductsSchema } from '@/lib/validation/product';
import { rateLimitImport } from '@/lib/middleware/rateLimiter';
import { logProductImport } from '@/lib/auditLog';
import { OdooImportService, OdooImageService } from '@/lib/import/services';
import type { ImportProductData, ImportVariantData } from '@/lib/import/services';

function getClientIp(req: NextApiRequestWithSession): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await rateLimitImport(req, res);
  if (!allowed) {
    return;
  }

  try {
    const validation = importProductsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues,
      });
    }

    const { products, testMode } = validation.data;
    const { uid, password } = req.session.user!;

    console.log(`🚀 Starting import: ${products.length} products (testMode: ${testMode})`);
    console.log(`📊 Raw request isPublished values:`, (req.body.products as Array<{ isPublished?: boolean }>).map((p) => p.isPublished));
    console.log(`📊 After validation isPublished values:`, products.map(p => p.isPublished));

    const importService = new OdooImportService(uid, password);
    const imageService = new OdooImageService(uid, password);

    const results = [];

    for (const product of products) {
      try {
        console.log(`\n📦 Processing: ${product.name} (${product.reference})`);
        console.log(`   🌐 isPublished: ${product.isPublished}, isFavorite: ${product.isFavorite}`);

        if (!product.selectedBrand) {
          throw new Error('Brand not selected');
        }
        if (!product.category) {
          throw new Error('Category not selected');
        }
        if (product.variants.length === 0) {
          throw new Error('No variants');
        }

        const maxRrp = Math.max(...product.variants.map(v => v.rrp || 0));
        const maxPrice = Math.max(...product.variants.map(v => v.price || 0));

        const normalizeSize = (size: string) => size?.trim().toUpperCase() || '';
        const uniqueSizes = Array.from(
          new Set(product.variants.map(v => normalizeSize(v.size)))
        ).filter(Boolean);
        const isNoVariantProduct =
          uniqueSizes.length === 1 || product.sizeAttribute === 'Eén Maat';

        // Step 1: Create product template
        console.log('Step 1: Creating product template...');
        const templateData: ImportProductData = {
          name: product.name,
          reference: product.reference,
          categoryId: product.category.id,
          listPrice: maxRrp || maxPrice || 0,
          standardPrice: maxPrice || maxRrp || 0,
          isPublished: product.isPublished,
          isFavorite: product.isFavorite,
          ecommerceDescription: product.ecommerceDescription,
          publicCategoryIds: product.publicCategories?.map(c => c.id),
          productTagIds: product.productTags?.map(t => t.id),
          productName: product.productName,
        };

        const templateId = await importService.createProductTemplate(templateData);
        console.log(`✅ Template created: ID ${templateId}`);

        const templateInfo = await odooClient.read<{ display_name: string }>(
          uid, password, 'product.template', [templateId], ['display_name']
        );
        const displayName = Array.isArray(templateInfo) && templateInfo.length > 0
          ? templateInfo[0].display_name
          : product.name;
        console.log(`📝 Display name: ${displayName}`);

        // Step 2: Add brand attribute
        console.log('Step 2: Adding brand attribute...');
        await importService.addBrandAttribute(templateId, product.selectedBrand.name);

        // Step 3-4: Add size attribute (skip for single-size products)
        let sizeValueIds: number[] = [];
        let sizeNames: string[] = [];
        if (isNoVariantProduct) {
          console.log('Single-size product detected: skipping size attribute line');
        } else {
          const sizeAttributeName = product.sizeAttribute || null;
          const sizes = product.variants.map(v => v.size);
          console.log(`Step 3-4: Adding size attribute${product.sizeAttribute ? ` (user-selected: ${product.sizeAttribute})` : ' (auto-detected)'}...`);
          const sizeResult = await importService.addSizeAttribute(templateId, sizeAttributeName, sizes);
          sizeValueIds = sizeResult.valueIds;
          sizeNames = sizeResult.sizeNames;
        }

        // Step 5-7: Wait for variant generation (poll, no fixed 1s sleep), then update
        console.log('Step 5-7: Waiting for variant generation and updating...');
        const expectedVariants = isNoVariantProduct
          ? 1
          : Math.max(sizeValueIds.length, 1);
        const prefetchedVariants = await importService.waitForVariants(
          templateId,
          expectedVariants,
        );

        const variantData: ImportVariantData[] = product.variants.map(v => ({
          size: v.size,
          ean: v.ean,
          sku: v.sku,
          price: v.price,
          rrp: v.rrp,
          quantity: v.quantity,
        }));

        const variantResult = await importService.updateVariants(
          templateId,
          variantData,
          sizeValueIds,
          sizeNames,
          prefetchedVariants,
        );
        console.log(`✅ Updated ${variantResult.updated}/${variantResult.total} variants`);

        // Step 8: Upload images
        let imagesUploaded = 0;
        if (product.images && product.images.length > 0) {
          console.log(`Step 8: Uploading ${product.images.length} images...`);
          imagesUploaded = await imageService.uploadProductImages(
            templateId, product.images, product.name, product.isPublished
          );
          console.log(`✅ Uploaded ${imagesUploaded}/${product.images.length} images`);
        }

        results.push({
          success: true,
          reference: product.reference,
          name: displayName,
          templateId,
          variantsCreated: variantResult.total,
          variantsUpdated: variantResult.updated,
          imagesUploaded,
          message: `Created template ${templateId} with ${variantResult.total} variants${imagesUploaded > 0 ? ` and ${imagesUploaded} images` : ''}`,
        });

      } catch (productError) {
        console.error(`❌ Error processing ${product.reference}:`, productError);
        const err = productError as { message?: string };
        results.push({
          success: false,
          reference: product.reference,
          name: product.name,
          message: err.message || String(productError),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`\n🎉 Import complete: ${successCount}/${results.length} successful`);

    const successfulProducts = results
      .filter(r => r.success)
      .map(r => ({
        reference: r.reference,
        name: r.name,
        templateId: r.templateId,
        variantsCreated: r.variantsCreated || 0,
        variantsUpdated: r.variantsUpdated || 0,
        imagesUploaded: r.imagesUploaded || 0,
      }));

    const failedProducts = results
      .filter(r => !r.success)
      .map(r => ({
        reference: r.reference,
        name: r.name,
        error: r.message,
      }));

    logProductImport(
      req.session.user!.uid,
      req.session.user!.username,
      getClientIp(req),
      true,
      products.length,
      {
        successful: successCount,
        failed: results.length - successCount,
        testMode,
        vendor: (req.body as { vendor?: string }).vendor || 'unknown',
        successfulProducts: successfulProducts.slice(0, 50),
        failedProducts: failedProducts.slice(0, 50),
        totalVariantsCreated: results.reduce((sum, r) => sum + (r.variantsCreated || 0), 0),
        totalVariantsUpdated: results.reduce((sum, r) => sum + (r.variantsUpdated || 0), 0),
        totalImagesUploaded: results.reduce((sum, r) => sum + (r.imagesUploaded || 0), 0),
      }
    );

    return res.status(200).json({
      success: true,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
      },
    });

  } catch (error) {
    console.error('Import error:', error);
    const err = error as { message?: string };

    try {
      const validation = importProductsSchema.safeParse(req.body);
      const productCount = validation.success ? validation.data.products.length : 0;

      logProductImport(
        req.session.user!.uid,
        req.session.user!.username,
        getClientIp(req),
        false,
        productCount,
        { error: err.message }
      );
    } catch {
      // Ignore logging errors
    }

    return res.status(500).json({
      success: false,
      error: err.message || 'Import failed',
    });
  }
}

export default withAuth(handler);

// Ceiling only (does not slow imports). 120s covers ~2 products with many variants.
export const maxDuration = 60;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};
