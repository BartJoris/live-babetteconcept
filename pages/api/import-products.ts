import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import { importProductsSchema } from '@/lib/validation/product';
import { rateLimitImport } from '@/lib/middleware/rateLimiter';
import { logProductImport } from '@/lib/auditLog';

function getClientIp(req: NextApiRequestWithSession): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

async function callOdoo<T = unknown>(uid: number, password: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>): Promise<T> {
  return odooClient.call<T>({
    uid,
    password,
    model,
    method,
    args,
    kwargs,
  });
}

// These interfaces are defined in validation/product.ts but kept here for runtime use
interface ProductVariant {
  size: string;
  quantity: number;
  ean?: string;
  sku?: string; // Internal Reference / SKU for variant
  price: number;
  rrp: number;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (10 imports per hour)
  const allowed = await rateLimitImport(req, res);
  if (!allowed) {
    return; // Rate limiter already sent response
  }

  try {
    // Validate input
    const validation = importProductsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues,
      });
    }

    const { products, testMode } = validation.data;

    // Get credentials from session
    const { uid, password } = req.session.user!;

    console.log(`🚀 Starting import: ${products.length} products (testMode: ${testMode})`);
    console.log(`📊 Raw request isPublished values:`, (req.body.products as Array<{isPublished?: boolean}>).map((p) => p.isPublished));
    console.log(`📊 After validation isPublished values:`, products.map(p => p.isPublished));

    const results = [];

    for (const product of products) {
      try {
        console.log(`\n📦 Processing: ${product.name} (${product.reference})`);
        console.log(`   🌐 isPublished: ${product.isPublished}, isFavorite: ${product.isFavorite}`);

        // Validation
        if (!product.selectedBrand) {
          throw new Error('Brand not selected');
        }
        if (!product.category) {
          throw new Error('Category not selected');
        }
        if (product.variants.length === 0) {
          throw new Error('No variants');
        }

        // Step 1: Create Product Template
        console.log('Step 1: Creating product template...');
        // Use highest RRP (verkoopprijs) for template, or fallback to highest price
        const maxRrp = Math.max(...product.variants.map(v => v.rrp || 0));
        const maxPrice = Math.max(...product.variants.map(v => v.price || 0));
        const templateData: Record<string, unknown> = {
          name: product.name,
          categ_id: product.category.id,
          list_price: maxRrp || maxPrice || 0, // Use highest verkoopprijs (RRP) from all variants
          standard_price: maxPrice || maxRrp || 0, // Use highest kostprijs from all variants
          type: 'consu', // Verbruiksartikel
          is_storable: true, // Enable "Voorraad bijhouden" checkbox (can track inventory even for consumables)
          weight: 0.2, // Default weight 0.2kg for all products
          tracking: 'none', // No serial/lot tracking, but inventory is tracked
          available_in_pos: true, // Kan verkocht worden in Kassa
          website_id: 1, // Website: Babette.
          website_published: product.isPublished, // Kan gekocht worden (online)
          purchase_ok: false, // Kan NIET gekocht worden (inkoop uitgeschakeld)
          out_of_stock_message: '<p>Verkocht!</p><p><br></p>', // Bericht bij geen voorraad
          is_favorite: product.isFavorite, // Favoriet product
        };

        if (product.reference) {
          // Store reference in Internal Notes
          // For 1+ products, also include productName (e.g., "26s063") which is used in image filenames
          let descriptionValue = product.reference;
          if ((product as { productName?: string }).productName) {
            // Format: "reference|productName" (e.g., "egas-blossom|26s063")
            descriptionValue = `${product.reference}|${(product as { productName: string }).productName}`;
          }
          templateData.description = descriptionValue;
        }

        // Add ecommerce description if available
        if (product.ecommerceDescription) {
          templateData.description_ecommerce = product.ecommerceDescription;
        }

        // Add public categories if any
        if (product.publicCategories && product.publicCategories.length > 0) {
          templateData.public_categ_ids = [[6, 0, product.publicCategories.map(c => c.id)]];
        }

        // Add product tags if any
        if (product.productTags && product.productTags.length > 0) {
          templateData.product_tag_ids = [[6, 0, product.productTags.map(t => t.id)]];
        }

        const templateResult = await callOdoo(uid, password, 'product.template', 'create', [templateData]);
        const templateId = templateResult;
        console.log(`✅ Template created: ID ${templateId}`);

        // Fetch display_name from the created product
        const templateInfo = await odooClient.read<{ display_name: string }>(
          uid,
          password,
          'product.template',
          [templateId as number],
          ['display_name']
        );
        const displayName = Array.isArray(templateInfo) && templateInfo.length > 0 ? templateInfo[0].display_name : product.name;
        console.log(`📝 Display name: ${displayName}`);

        // Step 2: Get MERK attribute
        console.log('Step 2: Adding brand attribute...');
        const merkAttrResult = await callOdoo<Array<{ id: number; name: string }>>(
          uid,
          password,
          'product.attribute',
          'search_read',
          [[['name', 'in', ['MERK', 'Merk 1']]]],
          { fields: ['id', 'name'] }
        );
        
        if (!merkAttrResult || merkAttrResult.length === 0) {
          throw new Error('MERK attribute not found');
        }

        const merkAttributeId = merkAttrResult[0].id;

        const normalizeSize = (size: string) => size?.trim().toUpperCase() || '';
        const uniqueSizes = Array.from(
          new Set(product.variants.map(variant => normalizeSize(variant.size)))
        ).filter(Boolean);
        const hasSingleSize = uniqueSizes.length === 1;
        const isNoVariantProduct = product.variants.length > 0 && hasSingleSize;

        // Step 3: Determine which size attribute to use based on the product's sizes
        console.log('Step 3: Determining size attribute...');
        
        // Determine the appropriate size attribute based on the variants
        const determineSizeAttribute = (variants: ProductVariant[]): string => {
          // Check first variant to determine category
          const firstSize = variants[0].size;
          
          // Baby sizes: ends with "maand" or is a month number with M (3M, 6M, etc.)
          // Also handle Weekend House Kids format: 3/6m, 6/12m, 12/18m, 18/24m
          if (firstSize.includes('maand') || /^\d+\s*M$/i.test(firstSize) || /\d+\/\d+\s*m$/i.test(firstSize)) {
            return "MAAT Baby's";
          }
          
          // Teen sizes: ends with "jaar" and number >= 10, or Y sizes >= 10 (including 16Y, 18Y)
          // Also handle Weekend House Kids format: 11/12, 13/14 (these are teen sizes)
          if (firstSize.includes('jaar')) {
            const match = firstSize.match(/^(\d+)\s*jaar/i);
            if (match && parseInt(match[1]) >= 10) {
              return 'MAAT Tieners';
            }
          }
          if (/^(\d+)\s*Y$/i.test(firstSize)) {
            const match = firstSize.match(/^(\d+)\s*Y$/i);
            if (match && parseInt(match[1]) >= 10) {
              return 'MAAT Tieners';  // Covers 10Y, 12Y, 14Y, 16Y, 18Y
            }
          }
          // Weekend House Kids teen sizes: 11/12, 13/14
          if (/^(11\/12|13\/14)$/i.test(firstSize)) {
            return 'MAAT Tieners';
          }
          
          // Kids sizes: ends with "jaar" and number < 10, or Y sizes < 10
          // Also handle Weekend House Kids format: 2, 3/4, 5/6, 7/8, 9/10 (these are kids sizes)
          if (firstSize.includes('jaar') || /^\d+\s*Y$/i.test(firstSize)) {
            return 'MAAT Kinderen';
          }
          // Weekend House Kids kids sizes: 2, 3/4, 5/6, 7/8, 9/10
          if (/^(2|3\/4|5\/6|7\/8|9\/10)$/i.test(firstSize)) {
            return 'MAAT Kinderen';
          }
          
          // Adult sizes: XXS, XS, S, M, L, XL, XXL (matching Odoo attribute values)
          if (/^(XXS|XS|S|M|L|XL|XXL)$/i.test(firstSize)) {
            return 'MAAT Volwassenen';
          }
          
          // Default fallback
          return 'MAAT Kinderen';
        };
        
        let maatAttributeId: number | null = null;
        if (isNoVariantProduct) {
          console.log('Single-size product detected: skipping size attribute line');
        } else {
          // Use user-selected attribute if provided, otherwise auto-detect
          const sizeAttributeName = product.sizeAttribute || determineSizeAttribute(product.variants);
          console.log(`Using size attribute: ${sizeAttributeName}${product.sizeAttribute ? ' (user-selected)' : ' (auto-detected)'}`);
          
          const maatAttrResult = await callOdoo<Array<{ id: number; name: string }>>(
            uid,
            password,
            'product.attribute',
            'search_read',
            [[['name', '=', sizeAttributeName]]],
            { fields: ['id', 'name'] }
          );

          if (!maatAttrResult || maatAttrResult.length === 0) {
            console.log(`Creating ${sizeAttributeName} attribute...`);
            maatAttributeId = await callOdoo(uid, password, 'product.attribute', 'create', [{
              name: sizeAttributeName,
              display_type: 'radio',
            }]);
          } else {
            maatAttributeId = maatAttrResult[0].id;
          }
        }

        // Step 4: Create attribute lines on template
        console.log('Step 4: Creating attribute lines...');
        
        // Ensure brand value exists in MERK attribute
        console.log(`Checking if brand "${product.selectedBrand.name}" exists in MERK attribute...`);
        const existingBrand = await callOdoo<Array<{ id: number }>>(
          uid,
          password,
          'product.attribute.value',
          'search_read',
          [[['attribute_id', '=', merkAttributeId], ['name', '=', product.selectedBrand.name]]],
          { fields: ['id'] }
        );

        let brandValueId;
        if (existingBrand && existingBrand.length > 0) {
          brandValueId = existingBrand[0].id;
          console.log(`✅ Brand value exists: ID ${brandValueId}`);
        } else {
          console.log(`Creating brand value "${product.selectedBrand.name}" in MERK attribute...`);
          brandValueId = await callOdoo(uid, password, 'product.attribute.value', 'create', [{
            attribute_id: merkAttributeId,
            name: product.selectedBrand.name,
          }]);
          console.log(`✅ Created brand value: ID ${brandValueId}`);
        }
        
        // Add MERK line
        await callOdoo(uid, password, 'product.template.attribute.line', 'create', [{
          product_tmpl_id: templateId,
          attribute_id: merkAttributeId,
          value_ids: [[6, 0, [brandValueId]]],
        }]);

        // Get or create size values
        const sizeValueIds: number[] = [];
        if (!isNoVariantProduct && maatAttributeId) {
          for (const variant of product.variants) {
            const existingSize = await callOdoo<Array<{ id: number }>>(
              uid,
              password,
              'product.attribute.value',
              'search_read',
              [[['attribute_id', '=', maatAttributeId], ['name', '=', variant.size]]],
              { fields: ['id'] }
            );

            let sizeValueId: number;
            if (existingSize && existingSize.length > 0) {
              sizeValueId = existingSize[0].id;
            } else {
              sizeValueId = await callOdoo<number>(uid, password, 'product.attribute.value', 'create', [{
                attribute_id: maatAttributeId,
                name: variant.size,
              }]);
            }
            sizeValueIds.push(sizeValueId);
          }

          // Add MAAT line
          await callOdoo(uid, password, 'product.template.attribute.line', 'create', [{
            product_tmpl_id: templateId,
            attribute_id: maatAttributeId,
            value_ids: [[6, 0, sizeValueIds]],
          }]);
        }

        console.log('✅ Attribute lines created');

        // Step 5: Wait for Odoo to generate variants
        console.log('Step 5: Waiting for variant generation...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 6: Fetch generated variants
        const variantsResult = await callOdoo<Array<{
          id: number;
          product_template_variant_value_ids: number[];
        }>>(
          uid,
          password,
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', templateId]]],
          { fields: ['id', 'product_template_variant_value_ids'] }
        );

        console.log(`Found ${variantsResult.length} variants`);

        // Step 7: Update each variant with barcode, price, and stock
        console.log('Step 7: Updating variants with barcodes and prices...');
        let updatedCount = 0;

        if (isNoVariantProduct) {
          const baseSize = uniqueSizes[0] || '';
          const combinedVariant = product.variants.reduce<ProductVariant>(
            (acc, variant) => ({
              ...acc,
              quantity: acc.quantity + (variant.quantity || 0),
              ean: acc.ean || variant.ean,
              sku: acc.sku || variant.sku,
              price: acc.price || variant.price,
              rrp: acc.rrp || variant.rrp,
            }),
            { size: baseSize, quantity: 0, ean: '', price: 0, rrp: 0 }
          );

          const odooVariant = variantsResult[0];
          if (odooVariant) {
            const updateData: Record<string, unknown> = {
              standard_price: combinedVariant.price || combinedVariant.rrp || 0,
              list_price: combinedVariant.rrp || combinedVariant.price || 0, // Verkoopprijs (RRP) from CSV
              weight: 0.2, // Default weight 0.2kg for all variants
            };

            if (combinedVariant.ean && combinedVariant.ean.trim()) {
              updateData.barcode = combinedVariant.ean;
              console.log(`📌 Setting barcode: ${combinedVariant.ean}`);
            }

            console.log(`Updating single-size product variant ${odooVariant.id}:`, JSON.stringify(updateData));
            await callOdoo(uid, password, 'product.product', 'write', [[odooVariant.id], updateData]);
            console.log(`✅ Updated single-size product variant`);

            if (combinedVariant.quantity > 0) {
              try {
                await callOdoo(uid, password, 'stock.quant', 'create', [{
                  product_id: odooVariant.id,
                  location_id: 8, // Stock location - adjust if needed
                  quantity: combinedVariant.quantity,
                }]);
              } catch (stockError) {
                console.log(`⚠️ Stock update failed: ${stockError}`);
              }
            }

            updatedCount = 1;
          }
        } else {
          for (const odooVariant of variantsResult) {
            try {
              // Get variant attribute values to match with CSV data
              const variantValueIds = odooVariant.product_template_variant_value_ids || [];
              
              // Fetch the actual attribute values
              if (variantValueIds.length === 0) continue;

              const valuesResult = await callOdoo<Array<{
                product_attribute_value_id: [number, string];
              }>>(
                uid,
                password,
                'product.template.attribute.value',
                'search_read',
                [[['id', 'in', variantValueIds]]],
                { fields: ['product_attribute_value_id'] }
              );

              // Get the size value name
              let sizeValueId = null;
              for (const val of valuesResult) {
                const valueId = val.product_attribute_value_id[0];
                if (sizeValueIds.includes(valueId)) {
                  sizeValueId = valueId;
                  break;
                }
              }

              if (!sizeValueId) continue;

              // Get size name
              const sizeValueResult = await callOdoo<Array<{ name: string }>>(
                uid,
                password,
                'product.attribute.value',
                'read',
                [[sizeValueId]]
              );

              if (!sizeValueResult || sizeValueResult.length === 0) continue;

              const sizeName = sizeValueResult[0].name;

              // Find matching variant in CSV data
              const csvVariant = product.variants.find(v => v.size === sizeName);
              if (!csvVariant) {
                console.log(`⚠️ No CSV data for size ${sizeName}`);
                continue;
              }

              console.log(`Updating variant: Size ${sizeName}, Barcode ${csvVariant.ean}, SKU ${csvVariant.sku || 'N/A'}`);

              const updateData: Record<string, unknown> = {
                standard_price: csvVariant.price,
                list_price: csvVariant.rrp || csvVariant.price || 0, // Verkoopprijs (RRP) from CSV
                weight: 0.2, // Default weight 0.2kg for all variants
              };

              // Always set barcode from CSV for new imports
              if (csvVariant.ean && csvVariant.ean.trim()) {
                updateData.barcode = csvVariant.ean;
                console.log(`📌 Setting barcode: ${csvVariant.ean}`);
              }

              console.log(`Updating variant ${odooVariant.id}:`, JSON.stringify(updateData));
              await callOdoo(uid, password, 'product.product', 'write', [[odooVariant.id], updateData]);
              console.log(`✅ Updated variant`);

              // Update stock if quantity > 0
              if (csvVariant.quantity > 0) {
                try {
                  await callOdoo(uid, password, 'stock.quant', 'create', [{
                    product_id: odooVariant.id,
                    location_id: 8, // Stock location - adjust if needed
                    quantity: csvVariant.quantity,
                  }]);
                } catch (stockError) {
                  console.log(`⚠️ Stock update failed: ${stockError}`);
                }
              }

              updatedCount++;
            } catch (variantError) {
              console.error(`Error updating variant:`, variantError);
            }
          }
        }

        console.log(`✅ Updated ${updatedCount}/${variantsResult.length} variants`);

        // Step 8: Upload images if any
        let imagesUploaded = 0;
        if (product.images && product.images.length > 0) {
          console.log(`Step 8: Uploading ${product.images.length} images as e-commerce media...`);
          
          for (let i = 0; i < product.images.length; i++) {
            try {
              const imageData = product.images[i];
              
              // Extract base64 data (handle both URLs and data URLs)
              let base64Data = '';
              if (imageData.startsWith('data:image')) {
                // It's a data URL (e.g., from file upload)
                base64Data = imageData.split(',')[1];
              } else if (imageData.startsWith('http')) {
                // It's a URL - fetch and convert to base64
                // If URL ends with underscore, try to find full-size version
                let imageUrl = imageData.trim();
                const originalUrl = imageUrl;
                let base64DataFound = false;
                
                // If URL ends with underscore, try to find full-size version by removing underscore and trying extensions
                if (imageUrl.endsWith('_')) {
                  console.log(`  🔍 URL ends with underscore, searching for full-size version...`);
                  const extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
                  
                  // Try removing underscore and adding extension
                  for (const ext of extensions) {
                    const testUrl = imageUrl.slice(0, -1) + ext;
                    try {
                      console.log(`  Trying: ${testUrl.substring(0, 80)}...`);
                      const testResponse = await fetch(testUrl);
                      if (testResponse.ok) {
                        const buffer = await testResponse.arrayBuffer();
                        const sizeKB = parseFloat((buffer.byteLength / 1024).toFixed(2));
                        const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);
                        
                        // Only use if it's a reasonable size (not a thumbnail)
                        if (sizeKB > 50) {
                          console.log(`  ✅ Found full-size image: ${sizeKB} KB (${sizeMB} MB)`);
                          base64Data = Buffer.from(buffer).toString('base64');
                          base64DataFound = true;
                          break;
                        } else {
                          console.log(`  ⚠️ Found image but seems small (${sizeKB} KB), trying next extension...`);
                        }
                      }
                    } catch (e) {
                      // Continue trying other extensions
                    }
                  }
                  
                  // If still not found, try URL without underscore (no extension)
                  if (!base64DataFound) {
                    console.log(`  Trying URL without underscore: ${imageUrl.slice(0, -1).substring(0, 80)}...`);
                    try {
                      const testResponse = await fetch(imageUrl.slice(0, -1));
                      if (testResponse.ok) {
                        const buffer = await testResponse.arrayBuffer();
                        const sizeKB = parseFloat((buffer.byteLength / 1024).toFixed(2));
                        if (sizeKB > 50) {
                          console.log(`  ✅ Found full-size image (no extension): ${sizeKB} KB`);
                          base64Data = Buffer.from(buffer).toString('base64');
                          base64DataFound = true;
                        }
                      }
                    } catch (e) {
                      // Continue
                    }
                  }
                }
                
                // If we haven't found a good image yet, try the original URL
                if (!base64DataFound) {
                  console.log(`  Fetching image from original URL: ${imageUrl.substring(0, 80)}...`);
                  const imageResponse = await fetch(imageUrl);
                  if (imageResponse.ok) {
                    const buffer = await imageResponse.arrayBuffer();
                    const sizeKB = parseFloat((buffer.byteLength / 1024).toFixed(2));
                    const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);
                    console.log(`  📦 Image size: ${sizeKB} KB (${sizeMB} MB)`);
                    
                    // If image is small, try to find full-size version
                    if (sizeKB < 100) {
                      console.warn(`  ⚠️ Image seems small (${sizeKB} KB) - trying to find full-size version...`);
                      
                      // If URL ends with underscore, try removing it and adding extensions
                      if (originalUrl.endsWith('_')) {
                        const extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
                        for (const ext of extensions) {
                          const fullSizeUrl = originalUrl.slice(0, -1) + ext;
                          try {
                            console.log(`  🔍 Trying full-size URL: ${fullSizeUrl.substring(0, 80)}...`);
                            const fullSizeResponse = await fetch(fullSizeUrl);
                            if (fullSizeResponse.ok) {
                              const fullSizeBuffer = await fullSizeResponse.arrayBuffer();
                              const fullSizeKB = parseFloat((fullSizeBuffer.byteLength / 1024).toFixed(2));
                              const fullSizeMB = (fullSizeBuffer.byteLength / (1024 * 1024)).toFixed(2);
                              
                              if (fullSizeKB > sizeKB) {
                                console.log(`  ✅ Found larger image: ${fullSizeKB} KB (${fullSizeMB} MB) - using this instead!`);
                                base64Data = Buffer.from(fullSizeBuffer).toString('base64');
                                base64DataFound = true;
                                break;
                              }
                            }
                          } catch (e) {
                            // Continue
                          }
                        }
                      }
                      
                      // If still using small image, warn user
                      if (!base64DataFound) {
                        console.warn(`  ⚠️ Using small image (${sizeKB} KB) - might be a thumbnail.`);
                        console.warn(`  💡 Tip: Check if the CSV contains the full-size image URL (should be ~1MB for high quality images)`);
                        base64Data = Buffer.from(buffer).toString('base64');
                        base64DataFound = true;
                      }
                    } else {
                      base64Data = Buffer.from(buffer).toString('base64');
                      base64DataFound = true;
                    }
                  } else {
                    console.warn(`  ⚠️ Failed to fetch image: ${imageResponse.status} - ${imageUrl.substring(0, 80)}...`);
                  }
                }
                
                if (!base64DataFound) {
                  console.warn(`  ❌ Could not fetch image from any URL variant`);
                  continue;
                }
              } else {
                console.warn(`  ⚠️ Invalid image data format`);
                continue;
              }

              // Create all images as product.image records (e-commerce media)
              console.log(`  Creating e-commerce media image ${i + 1}/${product.images.length}...`);
              await callOdoo(uid, password, 'product.image', 'create', [{
                name: `${product.name} - Image ${i + 1}`,
                product_tmpl_id: templateId,
                image_1920: base64Data, // Full size image (1920x1920)
                sequence: i + 1, // Set sequence for ordering
              }]);
              imagesUploaded++;
              console.log(`  ✅ E-commerce media image ${i + 1}/${product.images.length} uploaded`);

              // First image: also set as product template's main image (for POS/backend)
              if (i === 0) {
                console.log(`  Also setting first image as main product image...`);
                // Include website_published to prevent it from being reset
                await callOdoo(uid, password, 'product.template', 'write', [
                  [templateId],
                  { 
                    image_1920: base64Data,
                    website_published: product.isPublished // Preserve published status
                  }
                ]);
                console.log(`  ✅ Main image also set`);
              }
            } catch (imageError) {
              console.error(`  ❌ Error uploading image ${i + 1}:`, imageError);
            }
          }
          
          console.log(`✅ Uploaded ${imagesUploaded}/${product.images.length} images as e-commerce media`);
        }

        results.push({
          success: true,
          reference: product.reference,
          name: displayName,
          templateId,
          variantsCreated: variantsResult.length,
          variantsUpdated: updatedCount,
          imagesUploaded,
          message: `Created template ${templateId} with ${variantsResult.length} variants${imagesUploaded > 0 ? ` and ${imagesUploaded} images` : ''}`,
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

    // Log import completion with detailed information
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
        successfulProducts: successfulProducts.slice(0, 50), // Limit to first 50 for log size
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
    
    // Log import failure
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

