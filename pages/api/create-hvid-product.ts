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

interface CreateHvidProductRequest {
  name: string;
  barcode: string;
  sku?: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
  categoryId: number;
  brandId: number;
  size?: string;
  color?: string;
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
    const { 
      name, barcode, sku, costPrice, salePrice, quantity, 
      categoryId, brandId, size, color, uid, password 
    }: CreateHvidProductRequest = req.body;

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    if (!name || !barcode || !categoryId || !brandId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`Creating new HVID product: ${name}`);

    // Create product template
    const templateData: Record<string, unknown> = {
      name,
      categ_id: categoryId,
      list_price: salePrice || costPrice,
      standard_price: costPrice,
      type: 'consu',
      is_storable: true,
      default_code: sku || '',
      weight: 0.2,
      tracking: 'none',
      available_in_pos: true,
      website_id: 1,
      website_published: true,
      purchase_ok: false,
      out_of_stock_message: '<p>Verkocht!</p><p><br></p>',
    };

    const templateId = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'create',
      [templateData]
    );

    console.log(`✅ Template created: ID ${templateId}`);

    // Get MERK attribute ID
    const merkAttrResult = await callOdoo(
      parseInt(uid),
      password,
      'product.attribute',
      'search_read',
      [[['name', 'in', ['MERK', 'Merk 1']]], ['id', 'name']]
    );

    if (!merkAttrResult || merkAttrResult.length === 0) {
      throw new Error('MERK attribute not found');
    }

    const merkAttributeId = merkAttrResult[0].id;

    // Add brand attribute
    await callOdoo(
      parseInt(uid),
      password,
      'product.template.attribute.line',
      'create',
      [{
        product_tmpl_id: templateId,
        attribute_id: merkAttributeId,
        value_ids: [[6, 0, [brandId]]],
      }]
    );

    // If we have size/color, add those attributes
    if (size || color) {
      // Add Maat attribute if size is provided
      if (size) {
        const maatAttrResult = await callOdoo(
          parseInt(uid),
          password,
          'product.attribute',
          'search_read',
          [[['name', 'in', ['Maat', 'Maat 1']]], ['id']]
        );

        if (maatAttrResult && maatAttrResult.length > 0) {
          const maatAttributeId = maatAttrResult[0].id;

          // Check if size value exists
          const existingSize = await callOdoo(
            parseInt(uid),
            password,
            'product.attribute.value',
            'search_read',
            [
              [['attribute_id', '=', maatAttributeId], ['name', '=', size]],
              ['id']
            ]
          );

          let sizeValueId;
          if (existingSize && existingSize.length > 0) {
            sizeValueId = existingSize[0].id;
          } else {
            sizeValueId = await callOdoo(
              parseInt(uid),
              password,
              'product.attribute.value',
              'create',
              [{ attribute_id: maatAttributeId, name: size }]
            );
          }

          await callOdoo(
            parseInt(uid),
            password,
            'product.template.attribute.line',
            'create',
            [{
              product_tmpl_id: templateId,
              attribute_id: maatAttributeId,
              value_ids: [[6, 0, [sizeValueId]]],
            }]
          );
        }
      }

      // Add Kleur attribute if color is provided
      if (color) {
        const kleurAttrResult = await callOdoo(
          parseInt(uid),
          password,
          'product.attribute',
          'search_read',
          [[['name', '=', 'Kleur']], ['id']]
        );

        if (kleurAttrResult && kleurAttrResult.length > 0) {
          const kleurAttributeId = kleurAttrResult[0].id;

          // Check if color value exists
          const existingColor = await callOdoo(
            parseInt(uid),
            password,
            'product.attribute.value',
            'search_read',
            [
              [['attribute_id', '=', kleurAttributeId], ['name', '=', color]],
              ['id']
            ]
          );

          let colorValueId;
          if (existingColor && existingColor.length > 0) {
            colorValueId = existingColor[0].id;
          } else {
            colorValueId = await callOdoo(
              parseInt(uid),
              password,
              'product.attribute.value',
              'create',
              [{ attribute_id: kleurAttributeId, name: color }]
            );
          }

          await callOdoo(
            parseInt(uid),
            password,
            'product.template.attribute.line',
            'create',
            [{
              product_tmpl_id: templateId,
              attribute_id: kleurAttributeId,
              value_ids: [[6, 0, [colorValueId]]],
            }]
          );
        }
      }
    }

    // Wait for variant creation
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get the created variants
    const variants = await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'search_read',
      [
        [['product_tmpl_id', '=', templateId]],
        ['id', 'name']
      ]
    );

    if (!variants || variants.length === 0) {
      throw new Error('No variants created');
    }

    // Update the first variant with barcode
    const variantId = variants[0].id;

    await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'write',
      [[variantId], { barcode }]
    );

    // Add initial stock
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
            product_id: variantId,
            location_id: locations[0].id,
            quantity: quantity,
          }]
        );
      }
    }

    // Get final product details
    const finalProduct = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'read',
      [[templateId], ['id', 'name', 'display_name']]
    );

    const finalVariant = await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'read',
      [[variantId], ['id', 'name', 'barcode', 'qty_available']]
    );

    res.status(200).json({
      success: true,
      template: finalProduct[0],
      variant: finalVariant[0],
    });

  } catch (error: any) {
    console.error('Error creating HVID product:', error);
    res.status(500).json({ 
      error: 'Failed to create product', 
      details: error.message 
    });
  }
}

