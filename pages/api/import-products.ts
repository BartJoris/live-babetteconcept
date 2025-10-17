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

interface ProductVariant {
  size: string;
  quantity: number;
  ean: string;
  sku?: string; // Internal Reference / SKU for variant
  price: number;
  rrp: number;
}

interface ParsedProduct {
  reference: string;
  name: string;
  material: string;
  color: string;
  ecommerceDescription?: string;
  variants: ProductVariant[];
  selectedBrand?: { id: number; name: string };
  category?: { id: number; name: string };
  publicCategories: Array<{ id: number; name: string }>;
  productTags: Array<{ id: number; name: string }>;
  originalName?: string;
  isFavorite: boolean;
  sizeAttribute?: string; // Manually selected size attribute
  images?: string[]; // Image URLs or base64 data URLs
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { products, testMode, uid, password } = req.body as {
      products: ParsedProduct[];
      testMode: boolean;
      uid: string;
      password: string;
    };

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    console.log(`🚀 Starting import: ${products.length} products (testMode: ${testMode})`);

    const results = [];

    for (const product of products) {
      try {
        console.log(`\n📦 Processing: ${product.name} (${product.reference})`);

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
        const templateData: Record<string, unknown> = {
          name: product.name,
          categ_id: product.category.id,
          list_price: product.variants[0].rrp,
          standard_price: product.variants[0].price,
          type: 'consu', // Verbruiksartikel
          is_storable: true, // Enable "Voorraad bijhouden" checkbox (can track inventory even for consumables)
          default_code: product.reference,
          weight: 0.2, // Default weight 0.2kg for all products
          tracking: 'none', // No serial/lot tracking, but inventory is tracked
          available_in_pos: true, // Kan verkocht worden in Kassa
          website_id: 1, // Website: Babette.
          website_published: true, // Kan gekocht worden (online)
          purchase_ok: false, // Kan NIET gekocht worden (inkoop uitgeschakeld)
          out_of_stock_message: '<p>Verkocht!</p><p><br></p>', // Bericht bij geen voorraad
          is_favorite: product.isFavorite, // Favoriet product
        };

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

        const templateResult = await callOdoo(parseInt(uid), password, 'product.template', 'create', [templateData]);
        const templateId = templateResult;
        console.log(`✅ Template created: ID ${templateId}`);

        // Fetch display_name from the created product
        const templateInfo = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'read',
          [[templateId]],
          { fields: ['display_name'] }
        );
        const displayName = templateInfo && templateInfo.length > 0 ? templateInfo[0].display_name : product.name;
        console.log(`📝 Display name: ${displayName}`);

        // Step 2: Get MERK attribute
        console.log('Step 2: Adding brand attribute...');
        const merkAttrResult = await callOdoo(
          parseInt(uid),
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

        // Step 3: Determine which size attribute to use based on the product's sizes
        console.log('Step 3: Determining size attribute...');
        
        // Determine the appropriate size attribute based on the variants
        const determineSizeAttribute = (variants: ProductVariant[]): string => {
          // Check first variant to determine category
          const firstSize = variants[0].size;
          
          // Baby sizes: ends with "maand" or is a month number with M (3M, 6M, etc.)
          if (firstSize.includes('maand') || /^\d+\s*M$/i.test(firstSize)) {
            return "MAAT Baby's";
          }
          
          // Teen sizes: ends with "jaar" and number >= 10, or Y sizes >= 10 (including 16Y, 18Y)
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
          
          // Kids sizes: ends with "jaar" and number < 10, or Y sizes < 10
          if (firstSize.includes('jaar') || /^\d+\s*Y$/i.test(firstSize)) {
            return 'MAAT Kinderen';
          }
          
          // Adult sizes: XS, S, M, L, XL (default to kids if not sure)
          if (/^(XS|S|M|L|XL)$/i.test(firstSize)) {
            return 'MAAT Volwassenen';
          }
          
          // Default fallback
          return 'MAAT Kinderen';
        };
        
        // Use user-selected attribute if provided, otherwise auto-detect
        const sizeAttributeName = product.sizeAttribute || determineSizeAttribute(product.variants);
        console.log(`Using size attribute: ${sizeAttributeName}${product.sizeAttribute ? ' (user-selected)' : ' (auto-detected)'}`);
        
        const maatAttrResult = await callOdoo(
          parseInt(uid),
          password,
          'product.attribute',
          'search_read',
          [[['name', '=', sizeAttributeName]]],
          { fields: ['id', 'name'] }
        );

        let maatAttributeId;
        if (!maatAttrResult || maatAttrResult.length === 0) {
          console.log(`Creating ${sizeAttributeName} attribute...`);
          maatAttributeId = await callOdoo(parseInt(uid), password, 'product.attribute', 'create', [{
            name: sizeAttributeName,
            display_type: 'radio',
          }]);
        } else {
          maatAttributeId = maatAttrResult[0].id;
        }

        // Step 4: Create attribute lines on template
        console.log('Step 4: Creating attribute lines...');
        
        // Add MERK line
        await callOdoo(parseInt(uid), password, 'product.template.attribute.line', 'create', [{
          product_tmpl_id: templateId,
          attribute_id: merkAttributeId,
          value_ids: [[6, 0, [product.selectedBrand.id]]],
        }]);

        // Get or create size values
        const sizeValueIds = [];
        for (const variant of product.variants) {
          const existingSize = await callOdoo(
            parseInt(uid),
            password,
            'product.attribute.value',
            'search_read',
            [[['attribute_id', '=', maatAttributeId], ['name', '=', variant.size]]],
            { fields: ['id'] }
          );

          let sizeValueId;
          if (existingSize && existingSize.length > 0) {
            sizeValueId = existingSize[0].id;
          } else {
            sizeValueId = await callOdoo(parseInt(uid), password, 'product.attribute.value', 'create', [{
              attribute_id: maatAttributeId,
              name: variant.size,
            }]);
          }
          sizeValueIds.push(sizeValueId);
        }

        // Add MAAT line
        await callOdoo(parseInt(uid), password, 'product.template.attribute.line', 'create', [{
          product_tmpl_id: templateId,
          attribute_id: maatAttributeId,
          value_ids: [[6, 0, sizeValueIds]],
        }]);

        console.log('✅ Attribute lines created');

        // Step 5: Wait for Odoo to generate variants
        console.log('Step 5: Waiting for variant generation...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 6: Fetch generated variants
        const variantsResult = await callOdoo(
          parseInt(uid),
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

        for (const odooVariant of variantsResult) {
          try {
            // Get variant attribute values to match with CSV data
            const variantValueIds = odooVariant.product_template_variant_value_ids || [];
            
            // Fetch the actual attribute values
            if (variantValueIds.length === 0) continue;

            const valuesResult = await callOdoo(
              parseInt(uid),
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
            const sizeValueResult = await callOdoo(
              parseInt(uid),
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
              weight: 0.2, // Default weight 0.2kg for all variants
            };

            // Set SKU/Internal Reference if available
            if (csvVariant.sku) {
              updateData.default_code = csvVariant.sku;
            }

            // Always set barcode from CSV for new imports
            if (csvVariant.ean && csvVariant.ean.trim()) {
              updateData.barcode = csvVariant.ean;
              console.log(`📌 Setting barcode: ${csvVariant.ean}`);
            }

            console.log(`Updating variant ${odooVariant.id}:`, JSON.stringify(updateData));
            await callOdoo(parseInt(uid), password, 'product.product', 'write', [[odooVariant.id], updateData]);
            console.log(`✅ Updated variant`);

            // Update stock if quantity > 0
            if (csvVariant.quantity > 0) {
              try {
                await callOdoo(parseInt(uid), password, 'stock.quant', 'create', [{
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

        console.log(`✅ Updated ${updatedCount}/${variantsResult.length} variants`);

        // Step 8: Upload images if any
        let imagesUploaded = 0;
        if (product.images && product.images.length > 0) {
          console.log(`Step 8: Uploading ${product.images.length} images...`);
          
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
                console.log(`  Fetching image from URL: ${imageData.substring(0, 60)}...`);
                const imageResponse = await fetch(imageData);
                if (imageResponse.ok) {
                  const buffer = await imageResponse.arrayBuffer();
                  base64Data = Buffer.from(buffer).toString('base64');
                } else {
                  console.warn(`  ⚠️ Failed to fetch image: ${imageResponse.status}`);
                  continue;
                }
              } else {
                console.warn(`  ⚠️ Invalid image data format`);
                continue;
              }

              // First image: set as product template's main image
              if (i === 0) {
                console.log(`  Setting first image as main product image...`);
                await callOdoo(parseInt(uid), password, 'product.template', 'write', [
                  [templateId],
                  { image_1920: base64Data }
                ]);
                imagesUploaded++;
                console.log(`  ✅ Main image set (Image 1/${product.images.length})`);
              } else {
                // Additional images: create as product.image records
                await callOdoo(parseInt(uid), password, 'product.image', 'create', [{
                  name: `${product.name} - Image ${i + 1}`,
                  product_tmpl_id: templateId,
                  image_1920: base64Data,
                }]);
                imagesUploaded++;
                console.log(`  ✅ Image ${i + 1}/${product.images.length} uploaded`);
              }
            } catch (imageError) {
              console.error(`  ❌ Error uploading image ${i + 1}:`, imageError);
            }
          }
          
          console.log(`✅ Uploaded ${imagesUploaded}/${product.images.length} images`);
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
    return res.status(500).json({
      success: false,
      error: err.message || 'Import failed',
    });
  }
}

