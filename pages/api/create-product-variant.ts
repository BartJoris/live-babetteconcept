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

interface CreateVariantRequest {
  templateId: number;
  barcode: string;
  costPrice?: number;
  attributeValues?: { [attrName: string]: string };  // Attribute name → selected value
  quantity: number;
  uid: string;
  password: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { templateId, barcode, costPrice, attributeValues, quantity, uid, password }: CreateVariantRequest = req.body;

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    if (!templateId || !barcode) {
      return res.status(400).json({ error: 'Missing templateId or barcode' });
    }

    console.log(`Creating variant for template ${templateId} with barcode ${barcode}`);
    console.log(`Attribute values:`, attributeValues);

    // Get template's attribute lines
    const attributeLines = await callOdoo(
      parseInt(uid),
      password,
      'product.template.attribute.line',
      'search_read',
      [
        [['product_tmpl_id', '=', templateId]],
        ['id', 'attribute_id', 'value_ids']
      ]
    );

    console.log(`Found ${attributeLines.length} attribute lines`);

    // Process each attribute value provided by user
    const targetValueIds: number[] = [];

    if (attributeValues) {
      for (const line of attributeLines) {
        const attrId = line.attribute_id[0];
        const attrName = line.attribute_id[1];
        
        // Check if user provided a value for this attribute
        const userValue = attributeValues[attrName];
        if (!userValue || !userValue.trim()) {
          console.log(`No value provided for ${attrName}, skipping`);
          continue;
        }

        console.log(`Processing ${attrName} = "${userValue}"`);

        // Check if this value already exists
        const existingValue = await callOdoo(
          parseInt(uid),
          password,
          'product.attribute.value',
          'search_read',
          [
            [['attribute_id', '=', attrId], ['name', '=', userValue]],
            ['id']
          ]
        );

        let valueId;
        let isNewValue = false;
        
        if (existingValue && existingValue.length > 0) {
          valueId = existingValue[0].id;
          console.log(`  Using existing value ID: ${valueId}`);
        } else {
          // Create new value
          valueId = await callOdoo(
            parseInt(uid),
            password,
            'product.attribute.value',
            'create',
            [{
              attribute_id: attrId,
              name: userValue,
            }]
          );
          console.log(`  Created new value ID: ${valueId}`);
          isNewValue = true;
        }

        // Check if this value is already in the attribute line
        const currentValueIds = line.value_ids || [];
        const valueInLine = currentValueIds.includes(valueId);
        
        if (!valueInLine) {
          // Add to attribute line's values
          await callOdoo(
            parseInt(uid),
            password,
            'product.template.attribute.line',
            'write',
            [[line.id], { value_ids: [[6, 0, [...currentValueIds, valueId]]] }]
          );
          console.log(`  Added ${isNewValue ? 'new' : 'existing'} value ${valueId} to attribute line ${line.id}`);
        }
        
        // Always try to create PTAV if the value wasn't in the line before
        // (whether it's a new value or an existing value being added to this template)
        if (!valueInLine) {
          try {
            const ptavId = await callOdoo(
              parseInt(uid),
              password,
              'product.template.attribute.value',
              'create',
              [{
                product_tmpl_id: templateId,
                attribute_line_id: line.id,
                product_attribute_value_id: valueId,
              }]
            );
            console.log(`  Created PTAV ${ptavId} for value ${valueId}`);
          } catch (ptavError: any) {
            console.log(`  PTAV creation note: ${ptavError.message} (may already exist)`);
            // Continue - PTAV might have been auto-created
          }
        }

        targetValueIds.push(valueId);
      }
    }

    if (targetValueIds.length === 0) {
      throw new Error('No attribute values provided. Please select at least one attribute value.');
    }

    console.log(`Target value IDs to match: ${targetValueIds.join(', ')}`);

    // Get or create product.template.attribute.value (PTAV) for each attribute value
    // PTAVs link attribute values to a specific template
    const ptavIds: number[] = [];
    for (const valueId of targetValueIds) {
      // Find which attribute line this value belongs to
      let foundPTAV = false;
      
      for (const line of attributeLines) {
        const lineValueIds = line.value_ids || [];
        if (lineValueIds.includes(valueId)) {
          // Search for existing PTAV
          const existingPTAV = await callOdoo(
            parseInt(uid),
            password,
            'product.template.attribute.value',
            'search_read',
            [
              [
                ['product_tmpl_id', '=', templateId],
                ['attribute_line_id', '=', line.id],
                ['product_attribute_value_id', '=', valueId]
              ],
              ['id']
            ]
          );
          
          if (existingPTAV && existingPTAV.length > 0) {
            ptavIds.push(existingPTAV[0].id);
            console.log(`Found existing PTAV ${existingPTAV[0].id} for value ${valueId}`);
            foundPTAV = true;
            break;
          }
        }
      }
      
      if (!foundPTAV) {
        console.log(`Warning: Could not find PTAV for value ${valueId} in first attempt`);
        // Try searching across all attribute lines (maybe it's in a different line than expected)
        const anyPTAV = await callOdoo(
          parseInt(uid),
          password,
          'product.template.attribute.value',
          'search_read',
          [
            [
              ['product_tmpl_id', '=', templateId],
              ['product_attribute_value_id', '=', valueId]
            ],
            ['id', 'attribute_line_id']
          ]
        );
        
        if (anyPTAV && anyPTAV.length > 0) {
          ptavIds.push(anyPTAV[0].id);
          console.log(`Found PTAV ${anyPTAV[0].id} for value ${valueId} (line: ${anyPTAV[0].attribute_line_id[1]})`);
          foundPTAV = true;
        } else {
          console.log(`ERROR: Still cannot find PTAV for value ${valueId} - this shouldn't happen after explicit creation`);
        }
      }
    }
    
    console.log(`PTAV IDs for this combination: ${ptavIds.join(', ')}`);
    
    if (ptavIds.length === 0) {
      throw new Error(
        `Could not find product.template.attribute.value records for any of the selected attributes.\n` +
        `Template ID: ${templateId}\n` +
        `Attribute value IDs: ${targetValueIds.join(', ')}\n` +
        `This might mean:\n` +
        `1. The attribute values were just created and Odoo needs time to process them\n` +
        `2. The template's attribute configuration is incomplete\n` +
        `Please try again in a few seconds, or check the template in Odoo.`
      );
    }
    
    if (ptavIds.length < targetValueIds.length) {
      console.log(`WARNING: Only found ${ptavIds.length} PTAVs but expected ${targetValueIds.length}`);
    }

    // Wait a bit for Odoo to potentially auto-create variants
    console.log('Waiting for Odoo to process variants...');
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Get all variants
    const variants = await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'search_read',
      [
        [['product_tmpl_id', '=', templateId]],
        ['id', 'product_template_attribute_value_ids', 'barcode', 'name']
      ]
    );

    console.log(`Found ${variants.length} total variants`);

    // Find the variant that matches our attribute values
    let targetVariantId: number | null = null;
    let existingBarcode: string | null = null;

    for (const variant of variants) {
      if (!variant.product_template_attribute_value_ids || variant.product_template_attribute_value_ids.length === 0) {
        console.log(`Variant ${variant.id} has no attributes, skipping`);
        continue;
      }

      // Get attribute values for this variant
      const variantAttrValues = await callOdoo(
        parseInt(uid),
        password,
        'product.template.attribute.value',
        'read',
        [variant.product_template_attribute_value_ids, ['product_attribute_value_id']]
      );

      const variantValueIds = variantAttrValues.map((v: any) => v.product_attribute_value_id[0]);
      console.log(`Variant ${variant.id} (${variant.name}) has value IDs: ${variantValueIds.join(', ')} ${variant.barcode ? `[barcode: ${variant.barcode}]` : '[no barcode]'}`);
      
      // Check if this variant has ALL our target values (subset match)
      // Note: Variants may have more values (e.g., MERK) that we don't explicitly set
      const hasAllTargetValues = targetValueIds.every(id => variantValueIds.includes(id));

      if (hasAllTargetValues) {
        targetVariantId = variant.id;
        existingBarcode = variant.barcode;
        console.log(`✅ Found matching variant: ${variant.id} (${variant.name}) - has all required values [${targetValueIds.join(', ')}]${existingBarcode ? ` - Already has barcode: ${existingBarcode}` : ''}`);
        break;
      } else {
        const missingIds = targetValueIds.filter(id => !variantValueIds.includes(id));
        if (missingIds.length > 0) {
          console.log(`  ✗ Variant ${variant.id} missing values: ${missingIds.join(', ')}`);
        }
      }
    }

    if (!targetVariantId) {
      // Try to find the latest variant without a barcode as fallback
      console.log('Could not find variant by attribute matching, trying latest unbarcoded variant');
      const unbarcoded = variants.filter((v: any) => !v.barcode);
      if (unbarcoded.length > 0) {
        targetVariantId = unbarcoded[unbarcoded.length - 1].id;
        console.log(`Using last unbarcoded variant: ${targetVariantId}`);
      } else {
        // No unbarcoded variant found - we need to create it manually
        console.log('No unbarcoded variant found. Creating variant manually...');
        
        try {
          // Create the product.product variant manually
          targetVariantId = await callOdoo(
            parseInt(uid),
            password,
            'product.product',
            'create',
            [{
              product_tmpl_id: templateId,
              product_template_attribute_value_ids: [[6, 0, ptavIds]],
            }]
          );
          
          console.log(`✅ Manually created variant ${targetVariantId} with PTAV IDs: ${ptavIds.join(', ')}`);
        } catch (createError: any) {
          // List what we were looking for and what exists
          const existingCombinations = variants.map((v: any) => 
            `Variant ${v.id}: ${v.name} (barcode: ${v.barcode || 'none'})`
          ).join('\n  ');
          throw new Error(
            `Could not find or create matching variant.\n` +
            `Looking for attribute value IDs: ${targetValueIds.join(', ')}\n` +
            `PTAV IDs: ${ptavIds.join(', ')}\n` +
            `Existing variants:\n  ${existingCombinations}\n` +
            `Creation error: ${createError.message}`
          );
        }
      }
    }

    // Check if the variant already has a different barcode
    if (existingBarcode && existingBarcode !== barcode) {
      throw new Error(
        `This variant combination already exists with barcode ${existingBarcode}. ` +
        `Cannot assign new barcode ${barcode}.`
      );
    }

    // Update variant with barcode and cost price
    // Note: We don't set default_code (SKU) or name - Odoo auto-generates variant name from template + attributes
    const updateData: any = { barcode };
    if (costPrice !== undefined && costPrice !== null) {
      updateData.standard_price = costPrice;
    }

    await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'write',
      [[targetVariantId], updateData]
    );

    console.log(`Updated variant ${targetVariantId} with barcode`);

    // Add initial stock if quantity > 0
    if (quantity > 0) {
      const locations = await callOdoo(
        parseInt(uid),
        password,
        'stock.location',
        'search_read',
        [
          [['usage', '=', 'internal'], ['name', '=', 'Stock']],
          ['id']
        ]
      );

      if (locations && locations.length > 0) {
        await callOdoo(
          parseInt(uid),
          password,
          'stock.quant',
          'create',
          [{
            product_id: targetVariantId,
            location_id: locations[0].id,
            quantity: quantity,
          }]
        );
        console.log(`Added ${quantity} to stock`);
      }
    }

    // Get created variant details
    const createdVariant = await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'read',
      [[targetVariantId], ['id', 'name', 'barcode', 'default_code', 'qty_available']]
    );

    res.status(200).json({
      success: true,
      variant: createdVariant[0],
    });

  } catch (error: any) {
    console.error('=== Error creating variant ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('=============================');
    
    res.status(500).json({ 
      error: 'Failed to create variant', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

