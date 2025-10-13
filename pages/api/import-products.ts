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
  price: number;
  rrp: number;
}

interface ParsedProduct {
  reference: string;
  name: string;
  material: string;
  color: string;
  variants: ProductVariant[];
  selectedBrand?: { id: number; name: string };
  category?: { id: number; name: string };
  publicCategories: Array<{ id: number; name: string }>;
  productTags: Array<{ id: number; name: string }>;
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
          type: 'consu', // Odoo 19 uses 'consu' for consumable products
          default_code: product.reference,
          weight: 0.2, // Default weight 0.2kg for all products
          available_in_pos: true, // Kan verkocht worden in Kassa
          website_id: 1, // Website: Babette.
          website_published: true, // Kan gekocht worden (online)
        };

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

        // Step 3: Get or create MAAT Kinderen attribute
        console.log('Step 3: Adding size attribute...');
        const maatAttrResult = await callOdoo(
          parseInt(uid),
          password,
          'product.attribute',
          'search_read',
          [[['name', '=', 'MAAT Kinderen']]],
          { fields: ['id', 'name'] }
        );

        let maatAttributeId;
        if (!maatAttrResult || maatAttrResult.length === 0) {
          console.log('Creating MAAT Kinderen attribute...');
          maatAttributeId = await callOdoo(parseInt(uid), password, 'product.attribute', 'create', [{
            name: 'MAAT Kinderen',
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

            console.log(`Updating variant: Size ${sizeName}, Barcode ${csvVariant.ean}`);

            // Check if barcode already exists
            const existingBarcode = await callOdoo(
              parseInt(uid),
              password,
              'product.product',
              'search',
              [[['barcode', '=', csvVariant.ean]]]
            );

            const updateData: Record<string, unknown> = {
              standard_price: csvVariant.price,
              weight: 0.2, // Default weight 0.2kg for all variants
            };

            // Only set barcode if it doesn't exist elsewhere
            if (!existingBarcode || existingBarcode.length === 0) {
              updateData.barcode = csvVariant.ean;
            } else {
              console.log(`⚠️ Barcode ${csvVariant.ean} already exists, skipping`);
            }

            await callOdoo(parseInt(uid), password, 'product.product', 'write', [[odooVariant.id], updateData]);

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

        results.push({
          success: true,
          reference: product.reference,
          templateId,
          variantsCreated: variantsResult.length,
          variantsUpdated: updatedCount,
          message: `Created template ${templateId} with ${variantsResult.length} variants`,
        });

      } catch (productError) {
        console.error(`❌ Error processing ${product.reference}:`, productError);
        const err = productError as { message?: string };
        results.push({
          success: false,
          reference: product.reference,
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

