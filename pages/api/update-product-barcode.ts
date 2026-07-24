import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';

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

interface UpdateBarcodeRequest {
  productId: number;
  model: 'product.template' | 'product.product';
  newBarcode: string;
  clearBarcode?: boolean;

}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const { productId, model, newBarcode, clearBarcode }: UpdateBarcodeRequest = req.body;

    if (!productId || !model) {
      return res.status(400).json({ error: 'Product ID and model are required' });
    }

    if (!['product.template', 'product.product'].includes(model)) {
      return res.status(400).json({ error: 'Invalid model. Must be product.template or product.product' });
    }

    const barcodeValue = clearBarcode ? false : (newBarcode || '').trim();

    // Update the product barcode
    const result = await callOdoo(
      uid,
      password,
      model,
      'write',
      [
        [productId],
        { barcode: barcodeValue }
      ]
    );

    if (result) {
      // Fetch updated product to confirm
      const updatedProduct = await callOdoo(
        uid,
        password,
        model,
        'read',
        [
          [productId],
          ['id', 'name', 'barcode', 'default_code']
        ]
      );

      res.status(200).json({
        success: true,
        message: 'Barcode updated successfully',
        product: updatedProduct?.[0]
      });
    } else {
      res.status(500).json({ error: 'Failed to update barcode' });
    }

  } catch (error: any) {
    console.error('Error updating barcode:', error);
    res.status(500).json({ 
      error: 'Failed to update barcode', 
      details: error.message 
    });
  }
}

export default withAuth(handler);
