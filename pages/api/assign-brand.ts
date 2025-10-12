import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

type AssignBrandRequest = {
  uid: number;
  password: string;
  templateIds: number[]; // Product template IDs to update
  brandId: number; // Brand value ID to assign
  attributeId: number; // MERK or Merk 1 attribute ID
  testMode?: boolean; // If true, only process first template
};

type AssignBrandResponse = {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ templateId: number; error: string }>;
  details: Array<{ templateId: number; templateName: string; status: string }>;
  testMode: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password, templateIds, brandId, attributeId, testMode } = req.body as AssignBrandRequest;

  if (!uid || !password || !templateIds || !brandId || !attributeId) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const isTest = testMode === true;
  const templatesToProcess = isTest ? [templateIds[0]] : templateIds;

  try {
    console.log(`🔧 Assigning brand ${brandId} to ${templatesToProcess.length} templates (${isTest ? 'TEST MODE' : 'PRODUCTION'})`);

    const results: Array<{ templateId: number; templateName: string; status: string }> = [];
    const errors: Array<{ templateId: number; error: string }> = [];
    let processed = 0;
    let failed = 0;

    for (const templateId of templatesToProcess) {
      try {
        // STEP 1: Check if template already has MERK/Merk 1 attribute line
        const checkAttributeLinesPayload = {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            service: 'object',
            method: 'execute_kw',
            args: [
              ODOO_DB,
              uid,
              password,
              'product.template.attribute.line',
              'search_read',
              [[['product_tmpl_id', '=', templateId], ['attribute_id', '=', attributeId]]],
              { fields: ['id', 'value_ids'], limit: 10 },
            ],
          },
          id: Date.now(),
        };

        const checkRes = await fetch(ODOO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkAttributeLinesPayload),
        });
        const checkJson = await checkRes.json();
        const existingLines = checkJson.result || [];

        if (existingLines.length > 0) {
          // Update existing attribute line
          const lineId = existingLines[0].id;
          
          const updatePayload = {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              service: 'object',
              method: 'execute_kw',
              args: [
                ODOO_DB,
                uid,
                password,
                'product.template.attribute.line',
                'write',
                [[lineId], { value_ids: [[6, 0, [brandId]]] }],
              ],
            },
            id: Date.now(),
          };

          const updateRes = await fetch(ODOO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          });
          const updateJson = await updateRes.json();

          if (updateJson.error) {
            throw new Error(updateJson.error.message || 'Update failed');
          }

          results.push({
            templateId,
            templateName: `Template ${templateId}`,
            status: 'Updated existing attribute line',
          });
          processed++;
        } else {
          // Create new attribute line
          const createPayload = {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              service: 'object',
              method: 'execute_kw',
              args: [
                ODOO_DB,
                uid,
                password,
                'product.template.attribute.line',
                'create',
                [{
                  product_tmpl_id: templateId,
                  attribute_id: attributeId,
                  value_ids: [[6, 0, [brandId]]],
                }],
              ],
            },
            id: Date.now(),
          };

          const createRes = await fetch(ODOO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload),
          });
          const createJson = await createRes.json();

          if (createJson.error) {
            throw new Error(createJson.error.message || 'Create failed');
          }

          results.push({
            templateId,
            templateName: `Template ${templateId}`,
            status: 'Created new attribute line',
          });
          processed++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ templateId, error: errorMsg });
        failed++;
        console.error(`❌ Failed to assign brand to template ${templateId}:`, errorMsg);
      }
    }

    const response: AssignBrandResponse = {
      success: failed === 0,
      processed,
      failed,
      errors,
      details: results,
      testMode: isTest,
    };

    console.log(`✅ Brand assignment ${isTest ? 'TEST' : ''} completed: ${processed} success, ${failed} failed`);

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}


