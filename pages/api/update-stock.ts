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

interface UpdateStockRequest {
  variantId: number;
  quantityToAdd: number;
  costPrice?: number;
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
    const { variantId, quantityToAdd, costPrice, uid, password }: UpdateStockRequest = req.body;

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    if (!variantId || quantityToAdd === undefined) {
      return res.status(400).json({ error: 'Missing variantId or quantityToAdd' });
    }

    // Update cost price if provided
    if (costPrice !== undefined && costPrice !== null) {
      await callOdoo(
        parseInt(uid),
        password,
        'product.product',
        'write',
        [[variantId], { standard_price: costPrice }]
      );
      console.log(`Updated cost price to ${costPrice} for variant ${variantId}`);
    }

    // Get current stock level
    const variant = await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'read',
      [[variantId], ['qty_available', 'name']]
    );

    if (!variant || variant.length === 0) {
      return res.status(404).json({ error: 'Product variant not found' });
    }

    const currentStock = variant[0].qty_available || 0;

    // Create stock.quant record to add inventory
    // First, get the default location (stock)
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

    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'Stock location not found' });
    }

    const locationId = locations[0].id;

    // Check if quant already exists for this product in this location
    const existingQuants = await callOdoo(
      parseInt(uid),
      password,
      'stock.quant',
      'search_read',
      [
        [['product_id', '=', variantId], ['location_id', '=', locationId]],
        ['id', 'quantity']
      ]
    );

    if (existingQuants && existingQuants.length > 0) {
      // Update existing quant
      const quantId = existingQuants[0].id;
      const currentQuantity = existingQuants[0].quantity || 0;
      
      await callOdoo(
        parseInt(uid),
        password,
        'stock.quant',
        'write',
        [[quantId], { quantity: currentQuantity + quantityToAdd }]
      );
    } else {
      // Create new quant
      await callOdoo(
        parseInt(uid),
        password,
        'stock.quant',
        'create',
        [{
          product_id: variantId,
          location_id: locationId,
          quantity: quantityToAdd,
        }]
      );
    }

    // Get updated stock level
    const updatedVariant = await callOdoo(
      parseInt(uid),
      password,
      'product.product',
      'read',
      [[variantId], ['qty_available']]
    );

    const newStock = updatedVariant[0].qty_available || 0;

    res.status(200).json({
      success: true,
      variantId,
      previousStock: currentStock,
      quantityAdded: quantityToAdd,
      newStock,
    });

  } catch (error: any) {
    console.error('Error updating stock:', error);
    res.status(500).json({ 
      error: 'Failed to update stock', 
      details: error.message 
    });
  }
}

