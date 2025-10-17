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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { templateIds, uid, password } = req.body as {
      templateIds: number[];
      uid: string;
      password: string;
    };

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    if (!templateIds || templateIds.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    console.log(`🗑️ Starting archive process for ${templateIds.length} products...`);

    const results = [];

    for (const templateId of templateIds) {
      try {
        console.log(`\n📦 Processing product template ${templateId}...`);

        // Step 1: Get all variants for this template
        console.log('Step 1: Fetching variants...');
        const variants = await callOdoo(
          parseInt(uid),
          password,
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', templateId]]],
          { fields: ['id', 'name', 'barcode'] }
        );

        console.log(`Found ${variants.length} variants`);

        // Step 2: Clear barcodes from all variants
        if (variants.length > 0) {
          console.log('Step 2: Clearing barcodes from variants...');
          
          for (const variant of variants) {
            try {
              console.log(`📌 Clearing barcode from variant ${variant.id} (current barcode: ${variant.barcode || 'none'})`);
              await callOdoo(parseInt(uid), password, 'product.product', 'write', [[variant.id], { barcode: null }]);
              console.log(`✅ Successfully cleared barcode for variant ${variant.id}`);
            } catch (e) {
              console.error(`❌ Failed to clear barcode for variant ${variant.id}:`, e);
              throw e;
            }
          }
          console.log(`✅ All ${variants.length} variant barcodes cleared`);
        }

        // Step 3: Remove all attributes from the product
        console.log('Step 3: Removing all product attributes...');
        try {
          const attributeLines = await callOdoo(
            parseInt(uid),
            password,
            'product.template.attribute.line',
            'search',
            [[['product_tmpl_id', '=', templateId]]]
          );
          console.log(`Found ${attributeLines.length} attribute lines to remove`);
          
          if (attributeLines.length > 0) {
            await callOdoo(parseInt(uid), password, 'product.template.attribute.line', 'unlink', [attributeLines]);
            console.log(`✅ Removed ${attributeLines.length} attribute lines`);
          }
        } catch (e) {
          console.log(`⚠️ Could not remove attributes: ${e}`);
        }

        // Step 4: Mark as not for sale and hide from POS
        console.log('Step 4: Marking as not for sale and hiding from POS...');
        await callOdoo(parseInt(uid), password, 'product.template', 'write', [
          [templateId], 
          { 
            sale_ok: false,           // Not for sale
            available_in_pos: false,  // Hide from POS/Kassa
          }
        ]);
        console.log(`✅ Marked as not for sale and hidden from POS`);

        // Step 5: Archive the product template
        console.log('Step 5: Archiving product template...');
        await callOdoo(parseInt(uid), password, 'product.template', 'write', [[templateId], { active: false }]);
        console.log(`✅ Product template ${templateId} archived`);

        results.push({
          templateId,
          success: true,
          variantsCleared: variants.length,
          message: `Successfully cleaned up: attributes removed, barcodes cleared, marked as not for sale, hidden from POS, and archived`,
        });
      } catch (productError) {
        console.error(`❌ Error processing template ${templateId}:`, productError);
        const err = productError as { message?: string };
        results.push({
          templateId,
          success: false,
          message: err.message || String(productError),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`\n✅ Archive complete: ${successCount}/${results.length} successful`);

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
    console.error('Archive error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Archive failed',
    });
  }
}
