import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: any[], kwargs?: any) {
  const executeArgs = [ODOO_DB, uid, password, model, method, args];
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
  const { uid, password } = req.method === 'POST' ? req.body : req.query;

  if (!uid || !password) {
    return res.status(400).json({ error: 'Missing uid or password' });
  }

  try {
    console.log('🏷️ Fetching brands from MERK attribute...');

    // Step 1: Get MERK and Merk 1 attributes
    const merkAttributes = await callOdoo(
      parseInt(uid),
      password,
      'product.attribute',
      'search_read',
      [[['name', 'in', ['MERK', 'Merk 1']]]],
      { fields: ['id', 'name'], limit: 10 }
    );

    if (!merkAttributes || merkAttributes.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'MERK or Merk 1 attributes not found' 
      });
    }

    console.log(`✅ Found ${merkAttributes.length} MERK attributes`);

    const merkAttributeIds = merkAttributes.map((attr: any) => attr.id);
    const attributeIdToName: Record<number, string> = {};
    merkAttributes.forEach((attr: any) => {
      attributeIdToName[attr.id] = attr.name;
    });

    // Step 2: Get all brand values for these attributes
    const brandValues = await callOdoo(
      parseInt(uid),
      password,
      'product.attribute.value',
      'search_read',
      [[['attribute_id', 'in', merkAttributeIds]]],
      { fields: ['id', 'name', 'attribute_id'], limit: 500 }
    );

    console.log(`✅ Found ${brandValues.length} brand values`);

    // Format the brands with source information
    const brands = brandValues.map((brand: any) => ({
      id: brand.id,
      name: brand.name,
      source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
    })).sort((a: any, b: any) => a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      brands,
      summary: {
        total: brands.length,
        attributes: merkAttributes.map((a: any) => ({ id: a.id, name: a.name })),
      },
    });

  } catch (error: any) {
    console.error('Fetch brands error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch brands',
    });
  }
}

