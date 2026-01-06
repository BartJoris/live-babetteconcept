import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';

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

interface UpdateQuantity {
  productId: number;
  newQuantity: number;
}

interface UpdateQuantitiesRequest {
  updates: UpdateQuantity[];
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password } = req.session.user || {};

  if (!uid || !password) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { updates }: UpdateQuantitiesRequest = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array is required and must not be empty' });
    }

    // Validate all updates
    for (const update of updates) {
      if (!update.productId || update.newQuantity === undefined) {
        return res.status(400).json({ error: 'Each update must have productId and newQuantity' });
      }
      if (update.newQuantity < 0) {
        return res.status(400).json({ error: 'newQuantity must be >= 0' });
      }
    }

    console.log(`📦 Updating quantities for ${updates.length} products...`);

    // Get the default Stock location
    const locations = await callOdoo(
      uid,
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

    // Process updates
    const results: Array<{ productId: number; success: boolean; error?: string }> = [];
    let successCount = 0;

    for (const update of updates) {
      try {
        // Check if quant already exists for this product in this location
        const existingQuants = await callOdoo(
          uid,
          password,
          'stock.quant',
          'search_read',
          [
            [['product_id', '=', update.productId], ['location_id', '=', locationId]],
            ['id', 'quantity']
          ]
        );

        if (existingQuants && existingQuants.length > 0) {
          // Update existing quant - replace quantity (not additive)
          const quantId = existingQuants[0].id;
          await callOdoo(
            uid,
            password,
            'stock.quant',
            'write',
            [[quantId], { quantity: update.newQuantity }]
          );
        } else {
          // Create new quant with new quantity
          await callOdoo(
            uid,
            password,
            'stock.quant',
            'create',
            [{
              product_id: update.productId,
              location_id: locationId,
              quantity: update.newQuantity,
            }]
          );
        }

        results.push({ productId: update.productId, success: true });
        successCount++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error updating product ${update.productId}:`, message);
        results.push({ productId: update.productId, success: false, error: message });
      }
    }

    console.log(`✅ Successfully updated ${successCount}/${updates.length} products`);

    return res.status(200).json({
      success: true,
      updatedCount: successCount,
      totalCount: updates.length,
      results,
    });
  } catch (error: unknown) {
    console.error('Error updating product quantities:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
}

export default withAuth(handler);




