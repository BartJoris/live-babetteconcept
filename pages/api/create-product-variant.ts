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
  sku?: string;
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
    const { templateId, barcode, sku, attributeValues, quantity, uid, password }: CreateVariantRequest = req.body;

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

          // Add to attribute line's values
          const currentValueIds = line.value_ids || [];
          await callOdoo(
            parseInt(uid),
            password,
            'product.template.attribute.line',
            'write',
            [[line.id], { value_ids: [[6, 0, [...currentValueIds, valueId]]] }]
          );
        }

        targetValueIds.push(valueId);
      }
    }

    if (targetValueIds.length === 0) {
      throw new Error('No attribute values provided. Please select at least one attribute value.');
    }

    console.log(`Target value IDs to match: ${targetValueIds.join(', ')}`);

    // Wait for Odoo to create variant combinations
    console.log('Waiting for Odoo to create variants...');
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

    for (const variant of variants) {
      if (variant.barcode) {
        console.log(`Variant ${variant.id} already has barcode, skipping`);
        continue;
      }

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
      console.log(`Variant ${variant.id} (${variant.name}) has value IDs: ${variantValueIds.join(', ')}`);
      
      // Check if this variant has ALL our target values
      const hasAllValues = targetValueIds.every(id => variantValueIds.includes(id));

      if (hasAllValues) {
        targetVariantId = variant.id;
        console.log(`✅ Found matching variant: ${variant.id} (${variant.name})`);
        break;
      }
    }

    if (!targetVariantId) {
      console.log('Could not find variant by attribute matching, trying latest unbarcoded variant');
      const unbarcoded = variants.filter((v: any) => !v.barcode);
      if (unbarcoded.length > 0) {
        targetVariantId = unbarcoded[unbarcoded.length - 1].id;
        console.log(`Using last unbarcoded variant: ${targetVariantId}`);
      } else {
        throw new Error('Could not find newly created variant. All variants already have barcodes.');
      }
    }

    // Update variant with barcode and SKU
    const updateData: any = { barcode };
    if (sku) {
      updateData.default_code = sku;
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
    console.error('Error creating variant:', error);
    res.status(500).json({ 
      error: 'Failed to create variant', 
      details: error.message 
    });
  }
}
